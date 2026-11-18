/**
 * 桌面版（Electron）主进程。
 *
 * - 页面：加载打包进应用的 dist/（npm run build 的产物），通过自定义协议 app://lang-learn/ 提供，
 *   离线可用，localStorage 等行为与网页版一致。
 * - 登录：在系统浏览器里完成 GitHub 授权，Supabase 回调 cet-words://auth-callback?code=…，
 *   系统把这个链接交给本应用，再转给页面完成登录。
 * - AI：页面通过 app://lang-learn/__proxy 发请求，由主进程代为转发，不受浏览器跨域限制，
 *   所以 Kimi、智谱、Gemini 等网页版无法直连的服务在桌面版也能用。
 * - 更新：启动时检查 GitHub Releases，有新版本时提示下载。
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const HOST = 'lang-learn'
const APP_ORIGIN = `${SCHEME}://${HOST}`
const DEEP_LINK = 'cet-words'
const REPO = 'HunterChan-SR/lang_learn'
const WEBSITE = 'https://hunterchan-sr.github.io/lang_learn/'
const DIST = path.join(__dirname, '..', 'dist')

// 数据目录固定沿用 0.2.0 的 cet-words（localStorage、窗口位置都在里面），改应用名不影响已有数据
app.setPath('userData', path.join(app.getPath('appData'), 'cet-words'))
app.setName('langLearn')

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

/** @type {BrowserWindow | null} */
let win = null
/** 页面还没准备好时收到的登录回调 */
let pendingAuth = null

const isDeepLink = (s) => typeof s === 'string' && s.startsWith(`${DEEP_LINK}://`)

function handleDeepLink(url) {
  if (!isDeepLink(url)) return
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    win.webContents.send('auth-callback', url)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    pendingAuth = url
  }
}

// 同一时间只运行一个实例；Windows 上点击登录回调链接会启动第二个实例，把链接转给第一个
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(isDeepLink)
    if (url) handleDeepLink(url)
    else if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  // macOS 通过 open-url 事件传入链接，需要在 ready 之前注册
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleDeepLink(url)
  })
  pendingAuth = process.argv.find(isDeepLink) ?? null

  if (process.defaultApp && process.argv.length >= 2) {
    // 开发模式（electron .）
    app.setAsDefaultProtocolClient(DEEP_LINK, process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK)
  }

  app.whenReady().then(() => {
    registerAppProtocol()
    registerIpc()
    Menu.setApplicationMenu(buildMenu())
    createWindow()
    setTimeout(() => void checkUpdate(false), 5000)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// ---------------- 页面与代理 ----------------

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== HOST) return new Response('Not found', { status: 404 })
    if (url.pathname === '/__proxy') return proxy(request, url)

    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.normalize(path.join(DIST, rel))
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

const DROP_HEADERS = new Set(['host', 'origin', 'referer', 'content-length', 'cookie', 'connection'])

/** 转发 AI 请求：app://lang-learn/__proxy?u=<目标地址> */
async function proxy(request, url) {
  const target = url.searchParams.get('u') ?? ''
  if (!/^https?:\/\//i.test(target)) return new Response('Bad target', { status: 400 })
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!DROP_HEADERS.has(key.toLowerCase()) && !key.toLowerCase().startsWith('sec-')) headers.set(key, value)
  })
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    const res = await net.fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: request.signal,
      bypassCustomProtocolHandlers: true,
    })
    // 返回给页面时去掉跨域相关的响应头（同源请求不需要）
    const out = new Headers(res.headers)
    for (const k of [...out.keys()]) if (k.toLowerCase().startsWith('access-control-')) out.delete(k)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: `网络连接失败：${e && e.message ? e.message : e}` } }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}

// ---------------- 窗口 ----------------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return null
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
  } catch {
    // ignore
  }
}

function createWindow() {
  const saved = loadBounds()
  win = new BrowserWindow({
    width: saved?.width ?? 1200,
    height: saved?.height ?? 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: 380,
    minHeight: 560,
    title: 'langLearn',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101217' : '#f4f5f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  if (saved?.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', saveBounds)
  win.on('closed', () => {
    win = null
  })

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  win.webContents.on('did-finish-load', () => {
    if (pendingAuth) {
      const url = pendingAuth
      pendingAuth = null
      // 等页面里的登录模块初始化
      setTimeout(() => handleDeepLink(url), 800)
    }
  })

  void win.loadURL(`${APP_ORIGIN}/index.html`)
}

// ---------------- 页面可以调用的接口 ----------------

function registerIpc() {
  ipcMain.on('app-info', (event) => {
    event.returnValue = { version: app.getVersion(), platform: process.platform }
  })
  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
  ipcMain.handle('check-update', () => checkUpdate(true))
}

// ---------------- 菜单 ----------------

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const go = (hash) => () => win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`)
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `关于 ${app.name}` },
              { label: '检查更新…', click: () => void checkUpdate(true) },
              { type: 'separator' },
              { role: 'hide', label: '隐藏' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出' },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '前往',
      submenu: [
        { label: '首页', accelerator: 'CmdOrCtrl+1', click: go('#/') },
        { label: '词库', accelerator: 'CmdOrCtrl+2', click: go('#/words') },
        { label: '测验', accelerator: 'CmdOrCtrl+3', click: go('#/quiz') },
        { label: '练习', accelerator: 'CmdOrCtrl+4', click: go('#/practice') },
        { label: '我的', accelerator: 'CmdOrCtrl+5', click: go('#/me') },
      ],
    },
    {
      label: '显示',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    { role: 'windowMenu', label: '窗口' },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        { label: '网页版', click: () => void shell.openExternal(WEBSITE) },
        { label: '项目主页', click: () => void shell.openExternal(`https://github.com/${REPO}`) },
        ...(isMac ? [] : [{ label: '检查更新…', click: () => void checkUpdate(true) }, { role: 'about', label: '关于' }]),
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

// ---------------- 更新检查 ----------------

function newer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

const skipFile = () => path.join(app.getPath('userData'), 'skip-version.txt')

/** manual：用户手动点“检查更新”时，没有新版本也要提示 */
async function checkUpdate(manual) {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'langLearn-desktop' },
    })
    if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
    const rel = await res.json()
    const latest = String(rel.tag_name || '').replace(/^v/, '')
    const current = app.getVersion()
    if (!latest || !newer(latest, current)) {
      if (manual) await dialog.showMessageBox({ type: 'info', message: '已是最新版本', detail: `当前版本 ${current}` })
      return { latest, current, available: false }
    }
    let skipped = ''
    try {
      skipped = fs.readFileSync(skipFile(), 'utf8').trim()
    } catch {
      // ignore
    }
    if (!manual && skipped === latest) return { latest, current, available: true }
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['前往下载', '跳过这个版本', '以后再说'],
      defaultId: 0,
      cancelId: 2,
      message: `发现新版本 ${latest}`,
      detail: `当前版本 ${current}。下载新版本安装后，学习进度不会丢失。`,
    })
    if (response === 0) void shell.openExternal(rel.html_url || `https://github.com/${REPO}/releases/latest`)
    if (response === 1) fs.writeFileSync(skipFile(), latest)
    return { latest, current, available: true }
  } catch (e) {
    if (manual) await dialog.showMessageBox({ type: 'warning', message: '检查更新失败', detail: String(e && e.message ? e.message : e) })
    return { error: String(e) }
  }
}
