// langLearn 的 VS Code 插件。
//
// 网页版（打包在 web/ 里）运行在一个编辑器标签页（webview）中，固定使用“代码皮肤”。插件负责：
// - 存储：网页的 localStorage 由插件持久化。学习进度保存在 globalState；API Key 和登录凭据保存在
//   系统钥匙串（SecretStorage）
// - 网络：AI、Supabase 的请求由插件转发，不受 webview 跨域限制，也能访问内网和本机的接口
// - 登录：在系统浏览器里完成 GitHub 授权，回调 vscode://hunterchan.langlearn/auth-callback
// - 伪装：标签页标题和图标跟着页面变成 today.ts / words.json 等；资源管理器里有一组“文件”入口；
//   状态栏轮流显示正在学的单词；老板键（Alt+Q）一键切走
const vscode = require('vscode')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const VIEW_TYPE = 'langLearn.editor'
const STORAGE_KEY = 'langLearn.storage'
const SECRET_INDEX = 'langLearn.secretKeys'
const LAST_ROUTE = 'langLearn.lastRoute'
const TICKER_HIDDEN = 'langLearn.tickerHidden'

/** API Key 和登录凭据放进系统钥匙串 */
const isSecret = (key) => key === 'cet-words:ai' || key.startsWith('cet-words:auth')

/** “文件”入口：资源管理器里的条目，以及面包屑里的文件列表 */
const FILES = [
  { route: '/', file: 'src/today.ts', tip: '首页：今日任务和进度' },
  { route: '/study', file: 'src/session.ts', tip: '背单词' },
  { route: '/words', file: 'data/words.json', tip: '词库、生词本、错题本' },
  { route: '/quiz', file: 'quiz.config.ts', tip: '单词测验' },
  { route: '/practice', file: 'docs/practice.md', tip: '四六级题型练习和模拟考试' },
  { route: '/me', file: '.vscode/settings.json', tip: '账号、AI、学习设置' },
]

/** 老板键切走时，如果没有别的编辑器可切、工作区里也没有代码文件，就打开这段代码 */
const DECOY = `export interface Page<T> {
  items: T[]
  cursor: string | null
}

/** 防抖：停止调用 wait 毫秒后才执行 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

/** 分页拉取，直到没有下一页 */
export async function fetchAll<T>(load: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  do {
    const page = await load(cursor)
    out.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return out
}

/** 按固定大小切分数组 */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
`

// ---------------- 存储 ----------------

class Store {
  /** @param {vscode.ExtensionContext} ctx */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {Record<string, string>} */
    this.data = { ...ctx.globalState.get(STORAGE_KEY, {}) }
    /** @type {Record<string, string>} */
    this.secrets = {}
    this.timer = undefined
    this.listeners = new Set()
  }

  async init() {
    const keys = this.ctx.globalState.get(SECRET_INDEX, [])
    for (const k of keys) {
      const v = await this.ctx.secrets.get(k)
      if (v != null) this.secrets[k] = v
    }
  }

  snapshot() {
    return { ...this.data, ...this.secrets }
  }

  get(key) {
    return isSecret(key) ? this.secrets[key] : this.data[key]
  }

  set(key, value) {
    if (isSecret(key)) {
      if (value == null) {
        delete this.secrets[key]
        void this.ctx.secrets.delete(key)
      } else {
        this.secrets[key] = value
        void this.ctx.secrets.store(key, value)
      }
      void this.ctx.globalState.update(SECRET_INDEX, Object.keys(this.secrets))
      return
    }
    if (value == null) delete this.data[key]
    else this.data[key] = value
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 400)
    this.listeners.forEach((l) => l(key))
  }

  flush() {
    clearTimeout(this.timer)
    this.timer = undefined
    return this.ctx.globalState.update(STORAGE_KEY, this.data)
  }
}

// ---------------- 网页面板 ----------------

class Panel {
  /**
   * @param {vscode.ExtensionContext} ctx
   * @param {Store} store
   */
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    /** @type {vscode.WebviewPanel | null} */
    this.panel = null
    this.ready = false
    /** 页面准备好之前要发给它的消息 */
    this.queue = []
    /** @type {Map<string, AbortController>} */
    this.fetches = new Map()
    this.webRoot = vscode.Uri.joinPath(ctx.extensionUri, 'web')
    this.mediaRoot = vscode.Uri.joinPath(ctx.extensionUri, 'media')
    this.onShow = () => {}
  }

  get visible() {
    return !!this.panel && this.panel.visible
  }

  get active() {
    return !!this.panel && this.panel.active
  }

  /** 打开（或切换到）面板，可以指定页面 */
  async open(route) {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, false)
      if (route) this.post({ type: 'navigate', path: route })
      return
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'today.ts', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, this.options())
    await this.attach(panel, route || this.ctx.globalState.get(LAST_ROUTE, '/'))
  }

  options() {
    return { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.webRoot, this.mediaRoot] }
  }

  /**
   * 接管一个面板（新建的，或 VS Code 重启后恢复的）
   * @param {vscode.WebviewPanel} panel
   */
  async attach(panel, route) {
    this.panel = panel
    this.ready = false
    panel.webview.options = this.options()
    panel.iconPath = this.icon('ts')
    panel.webview.onDidReceiveMessage((m) => void this.onMessage(m))
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) this.onShow()
    })
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = null
      for (const c of this.fetches.values()) c.abort()
      this.fetches.clear()
    })
    panel.webview.html = await this.html(panel.webview, route)
  }

  icon(kind) {
    const f = (name) => vscode.Uri.joinPath(this.mediaRoot, name)
    if (kind === 'json') return f('json.svg')
    if (kind === 'md') return f('md.svg')
    if (kind === 'gear') return { light: f('gear-light.svg'), dark: f('gear-dark.svg') }
    return f('ts.svg')
  }

  post(msg) {
    if (!this.panel) return
    if (!this.ready && msg.type !== 'confirm-result' && !msg.type.startsWith('fetch')) {
      this.queue.push(msg)
      return
    }
    void this.panel.webview.postMessage(msg)
  }

  /** @param {vscode.Webview} webview */
  async html(webview, route) {
    let html = fs.readFileSync(path.join(this.webRoot.fsPath, 'index.html'), 'utf8')
    const nonce = crypto.randomBytes(16).toString('base64')
    const base = `${webview.asWebviewUri(this.webRoot).toString()}/`
    // 固定的回调地址（不带 windowId 等参数），这样 Supabase 的 Redirect URLs 里加一条就能匹配
    const callback = `${vscode.env.uriScheme}://${this.ctx.extension.id}/auth-callback`
    const init = {
      version: this.ctx.extension.packageJSON.version,
      appName: vscode.env.appName,
      authCallback: callback,
      route,
      storage: this.store.snapshot(),
    }
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data: blob:`,
      `media-src ${webview.cspSource} https: data: blob:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `connect-src ${webview.cspSource}`,
    ].join('; ')
    const json = JSON.stringify(init).replace(/</g, '\\u003c')
    const head = [
      `<base href="${base}">`,
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
      `<script type="application/json" id="ll-init">${json}</script>`,
      `<script nonce="${nonce}">${BOOT}</script>`,
    ].join('\n')
    html = html.replace('<head>', `<head>\n${head}`)
    html = html.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`)
    html = html.replace(/<link rel="manifest"[^>]*>\s*/, '')
    return html
  }

  async onMessage(m) {
    if (!m || typeof m.type !== 'string') return
    switch (m.type) {
      case 'ready':
        this.ready = true
        for (const msg of this.queue.splice(0)) void this.panel?.webview.postMessage(msg)
        break
      case 'storage':
        this.store.set(String(m.key), m.value == null ? null : String(m.value))
        break
      case 'page':
        if (this.panel) {
          this.panel.title = String(m.title || 'today.ts')
          this.panel.iconPath = this.icon(m.kind)
        }
        if (typeof m.route === 'string' && m.route !== '/study' && !m.route.startsWith('/quiz?run')) {
          void this.ctx.globalState.update(LAST_ROUTE, m.route)
        }
        break
      case 'fetch':
        void this.fetch(m)
        break
      case 'fetch-abort':
        this.fetches.get(m.id)?.abort()
        this.fetches.delete(m.id)
        break
      case 'confirm': {
        const ok = m.okLabel || '确定'
        const pick = await vscode.window.showWarningMessage(String(m.message), { modal: true }, ok)
        this.post({ type: 'confirm-result', id: m.id, ok: pick === ok })
        break
      }
      case 'alert':
        void vscode.window.showInformationMessage(String(m.message))
        break
      case 'open':
        if (/^https?:\/\//i.test(String(m.url))) void vscode.env.openExternal(vscode.Uri.parse(String(m.url), true))
        break
      case 'save': {
        const home = process.env.HOME || process.env.USERPROFILE || ''
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(home, String(m.name || 'langLearn.json'))),
          filters: { JSON: ['json'] },
        })
        if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(String(m.text), 'utf8'))
        this.post({ type: 'save-result', id: m.id, ok: !!target })
        break
      }
    }
  }

  /** 代发网络请求：响应头先回，正文按文本分块传回，支持取消 */
  async fetch(m) {
    const ctrl = new AbortController()
    this.fetches.set(m.id, ctrl)
    const send = (msg) => this.panel && void this.panel.webview.postMessage({ ...msg, id: m.id })
    try {
      const headers = new Headers()
      for (const [k, v] of m.headers || []) {
        const key = String(k).toLowerCase()
        if (DROP_HEADERS.has(key) || key.startsWith('sec-')) continue
        headers.set(key, String(v))
      }
      const res = await fetch(String(m.url), {
        method: m.method || 'GET',
        headers,
        body: m.body == null || m.method === 'GET' || m.method === 'HEAD' ? undefined : String(m.body),
        signal: ctrl.signal,
      })
      const outHeaders = [...res.headers].filter(([k]) => !k.startsWith('access-control-') && k !== 'content-encoding' && k !== 'content-length')
      send({ type: 'fetch-head', status: res.status, statusText: res.statusText, headers: outHeaders })
      if (res.body) {
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const text = dec.decode(value, { stream: true })
          if (text) send({ type: 'fetch-chunk', text })
        }
        const tail = dec.decode()
        if (tail) send({ type: 'fetch-chunk', text: tail })
      }
      send({ type: 'fetch-end' })
    } catch (e) {
      if (!ctrl.signal.aborted) send({ type: 'fetch-error', message: describeFetchError(e) })
    } finally {
      this.fetches.delete(m.id)
    }
  }
}

const DROP_HEADERS = new Set(['host', 'origin', 'referer', 'content-length', 'cookie', 'connection', 'user-agent'])

function describeFetchError(e) {
  const cause = e && e.cause
  return (cause && (cause.code || cause.message)) || (e && e.message) || String(e)
}

/**
 * 在网页脚本之前运行：用插件保存的数据替换 localStorage，写入转发给插件持久化。
 * 用字符串内联进页面（webview 里 localStorage 不保证持久，也不能在多个窗口间共享）。
 */
const BOOT = `(() => {
  const api = acquireVsCodeApi();
  const init = JSON.parse(document.getElementById('ll-init').textContent);
  const mem = new Map(Object.entries(init.storage || {}));
  delete init.storage;
  const ls = {
    get length() { return mem.size; },
    key(i) { return Array.from(mem.keys())[i] ?? null; },
    getItem(k) { k = String(k); return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) { k = String(k); v = String(v); if (mem.get(k) === v) return; mem.set(k, v); api.postMessage({ type: 'storage', key: k, value: v }); },
    removeItem(k) { k = String(k); if (!mem.has(k)) return; mem.delete(k); api.postMessage({ type: 'storage', key: k, value: null }); },
    clear() { for (const k of Array.from(mem.keys())) this.removeItem(k); },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: () => ls });
  const saved = api.getState();
  if (saved && saved.route) init.route = saved.route;
  window.__LANGLEARN_VSCODE__ = Object.assign({ api }, init);
})();`

// ---------------- 资源管理器里的“文件” ----------------

class FilesView {
  /** @param {Panel} panel */
  constructor(panel) {
    this.panel = panel
  }

  getTreeItem(f) {
    const item = new vscode.TreeItem(vscode.Uri.file(`/lang_learn/${f.file}`))
    item.iconPath = vscode.ThemeIcon.File
    item.tooltip = f.tip
    item.command = { command: 'langLearn.openRoute', title: '打开', arguments: [f.route] }
    return item
  }

  getChildren(el) {
    return el ? [] : FILES
  }
}

// ---------------- 状态栏单词 ----------------

class Ticker {
  /**
   * @param {vscode.ExtensionContext} ctx
   * @param {Store} store
   */
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    this.item = vscode.window.createStatusBarItem('langLearn.ticker', vscode.StatusBarAlignment.Right, -1000)
    this.item.name = 'langLearn'
    this.item.command = 'langLearn.nextWord'
    /** @type {Record<string, Map<string, [string, string, string]>>} */
    this.books = {}
    this.last = ''
    this.timer = undefined
    /** 老板键按下后暂时隐藏，重新打开面板时恢复 */
    this.suspended = false
  }

  config() {
    const c = vscode.workspace.getConfiguration('langLearn.ticker')
    return {
      enabled: c.get('enabled', true) && !this.ctx.globalState.get(TICKER_HIDDEN, false),
      interval: Math.max(5, c.get('interval', 30)),
      showMeaning: c.get('showMeaning', true),
    }
  }

  restart() {
    clearInterval(this.timer)
    const c = this.config()
    if (!c.enabled || this.suspended) {
      this.item.hide()
      return
    }
    this.next()
    this.timer = setInterval(() => this.next(), c.interval * 1000)
  }

  suspend() {
    this.suspended = true
    this.restart()
  }

  resume() {
    if (!this.suspended) return
    this.suspended = false
    this.restart()
  }

  book(id) {
    if (!this.books[id]) {
      try {
        const rows = JSON.parse(fs.readFileSync(path.join(this.ctx.extensionPath, 'web', 'data', `${id}.json`), 'utf8'))
        this.books[id] = new Map(rows.map((r) => [r[0], r]))
      } catch {
        this.books[id] = new Map()
      }
    }
    return this.books[id]
  }

  /** 优先挑正在学习（还没掌握）的词，其次是接下来要学的新词 */
  candidates() {
    let progress = null
    try {
      progress = JSON.parse(this.store.get('cet-words:v1') || 'null')
    } catch {
      progress = null
    }
    const bookId = progress?.settings?.book === 'cet6' ? 'cet6' : 'cet4'
    const book = this.book(bookId)
    const cards = progress?.cards || {}
    const learning = Object.entries(cards)
      .filter(([w, c]) => c && c.ivl < 21 && book.has(w))
      .sort((a, b) => a[1].due - b[1].due)
      .slice(0, 80)
      .map(([w]) => w)
    if (learning.length >= 20) return { book, words: learning }
    const fresh = []
    for (const w of book.keys()) {
      if (!cards[w]) fresh.push(w)
      if (fresh.length >= 30) break
    }
    return { book, words: [...learning, ...fresh] }
  }

  next() {
    const c = this.config()
    if (!c.enabled || this.suspended) return
    const { book, words } = this.candidates()
    if (words.length === 0) {
      this.item.hide()
      return
    }
    let w = words[Math.floor(Math.random() * words.length)]
    if (w === this.last && words.length > 1) w = words[(words.indexOf(w) + 1) % words.length]
    this.last = w
    const [, phonetic, meaning] = book.get(w)
    const lines = String(meaning).split('\n')
    const short = lines[0].length > 18 ? `${lines[0].slice(0, 18)}…` : lines[0]
    this.item.text = c.showMeaning ? `${w}  ${short}` : w
    const tip = new vscode.MarkdownString(`**${w}**${phonetic ? `  /${phonetic}/` : ''}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n点击换一个`)
    this.item.tooltip = tip
    this.item.show()
  }

  dispose() {
    clearInterval(this.timer)
    this.item.dispose()
  }
}

// ---------------- 激活 ----------------

/** @param {vscode.ExtensionContext} ctx */
async function activate(ctx) {
  const store = new Store(ctx)
  await store.init()
  const panel = new Panel(ctx, store)
  const ticker = new Ticker(ctx, store)
  panel.onShow = () => ticker.resume()
  ctx.subscriptions.push(ticker)

  ctx.subscriptions.push(
    vscode.commands.registerCommand('langLearn.open', () => {
      ticker.resume()
      return panel.open()
    }),
    vscode.commands.registerCommand('langLearn.openRoute', (route) => {
      ticker.resume()
      return panel.open(typeof route === 'string' ? route : undefined)
    }),
    vscode.commands.registerCommand('langLearn.boss', () => boss(panel, ticker)),
    vscode.commands.registerCommand('langLearn.nextWord', () => ticker.next()),
    vscode.commands.registerCommand('langLearn.toggleTicker', async () => {
      const hidden = !ctx.globalState.get(TICKER_HIDDEN, false)
      await ctx.globalState.update(TICKER_HIDDEN, hidden)
      ticker.restart()
    }),
    vscode.window.registerTreeDataProvider('langLearn.files', new FilesView(panel)),
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path !== '/auth-callback') return
        void panel.open('/me').then(() => panel.post({ type: 'auth-callback', url: uri.toString(true) }))
      },
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(webviewPanel, state) {
        await panel.attach(webviewPanel, (state && state.route) || ctx.globalState.get(LAST_ROUTE, '/'))
      },
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('langLearn.ticker')) ticker.restart()
    }),
    { dispose: () => void store.flush() },
  )

  ticker.restart()
  // 学完一组后状态栏换成新进度里的词
  store.listeners.add((key) => {
    if (key === 'cet-words:v1' && !ticker.item.text) ticker.next()
  })
}

/** 老板键：面板在前台时切到别的代码（没有就打开一段示例代码），停止发音并隐藏状态栏单词；再按一次切回来 */
async function boss(panel, ticker) {
  if (panel.visible) {
    panel.post({ type: 'boss' })
    ticker.suspend()
    const column = panel.panel.viewColumn
    if (!panel.active) panel.panel.reveal(column, false)
    await vscode.commands.executeCommand('workbench.action.openPreviousRecentlyUsedEditorInGroup')
    if (panel.visible) {
      // 这一组里没有别的编辑器：打开工作区里的一个代码文件，没有就打开一段示例代码
      const [file] = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go,java,kt,rs,cpp,c,cs,swift,vue}', '**/{node_modules,dist,build,out,.git}/**', 1)
      const doc = file ? await vscode.workspace.openTextDocument(file) : await vscode.workspace.openTextDocument({ language: 'typescript', content: DECOY })
      await vscode.window.showTextDocument(doc, { viewColumn: column, preview: false })
    }
    return
  }
  ticker.resume()
  await panel.open()
}

function deactivate() {}

module.exports = { activate, deactivate }
