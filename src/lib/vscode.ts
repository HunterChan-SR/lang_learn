/**
 * VS Code 插件版：网页运行在 webview 里，由插件（vscode/extension.js）提供宿主能力。
 *
 * 插件在加载网页前注入一段启动脚本：
 * - 用插件保存的数据替换 localStorage（写入会转发给插件持久化）
 * - 在 window.__LANGLEARN_VSCODE__ 上放好 VS Code API 和初始信息
 *
 * 这里封装和插件之间的消息往来：网络请求转发、确认框、保存文件、页面标题等。
 */

interface VSCodeApi {
  postMessage(msg: unknown): void
  setState(state: unknown): void
}

export interface VSCodeInit {
  api: VSCodeApi
  /** 插件版本 */
  version: string
  /** 登录回调地址，如 vscode://hunterchan.langlearn/auth-callback */
  authCallback: string
  /** 编辑器名称，如 Visual Studio Code / Cursor / Trae */
  appName: string
  /** 打开时要显示的页面 */
  route?: string
}

declare global {
  interface Window {
    __LANGLEARN_VSCODE__?: VSCodeInit
  }
}

export const vscodeHost: VSCodeInit | null = typeof window !== 'undefined' ? (window.__LANGLEARN_VSCODE__ ?? null) : null

type Handler = (msg: Record<string, unknown>) => void
const handlers = new Map<string, Set<Handler>>()

if (vscodeHost) {
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as Record<string, unknown> | null
    if (!msg || typeof msg.type !== 'string') return
    handlers.get(msg.type)?.forEach((h) => h(msg))
  })
}

export function onHostMessage(type: string, h: Handler): () => void {
  let set = handlers.get(type)
  if (!set) handlers.set(type, (set = new Set()))
  set.add(h)
  return () => set.delete(h)
}

export function postHost(msg: Record<string, unknown>) {
  vscodeHost?.api.postMessage(msg)
}

let seq = 0
const nextId = () => `${Date.now().toString(36)}-${++seq}`

/** 发一条请求并等待插件回复 { id, ... } */
export function requestHost<T extends Record<string, unknown>>(msg: Record<string, unknown>, replyType: string): Promise<T> {
  const id = nextId()
  return new Promise((resolve) => {
    const off = onHostMessage(replyType, (m) => {
      if (m.id !== id) return
      off()
      resolve(m as T)
    })
    postHost({ ...msg, id })
  })
}

const NULL_BODY = new Set([101, 103, 204, 205, 304])

/**
 * 由插件代发网络请求：webview 里的请求受跨域限制，插件（Node）没有这个限制，
 * 也能访问内网和本机的接口。响应以文本分块传回，支持流式输出和中途取消。
 */
export const vscodeFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : null
  const url = req ? req.url : String(input)
  const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers ?? req?.headers)
  let body: string | undefined
  if (init?.body != null) body = typeof init.body === 'string' ? init.body : await new Response(init.body).text()
  else if (req && method !== 'GET' && method !== 'HEAD') body = await req.text()
  const signal = init?.signal ?? req?.signal ?? undefined
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

  const id = nextId()
  const enc = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
    cancel: () => {
      postHost({ type: 'fetch-abort', id })
      cleanup()
    },
  })
  const offs: (() => void)[] = []
  const cleanup = () => {
    offs.splice(0).forEach((f) => f())
    signal?.removeEventListener('abort', onAbort)
  }
  let settle: { resolve: (r: Response) => void; reject: (e: unknown) => void } | null = null
  let headed = false
  const fail = (err: unknown) => {
    cleanup()
    if (!headed) settle?.reject(err)
    else {
      try {
        controller.error(err)
      } catch {
        // 流已关闭
      }
    }
  }
  const onAbort = () => {
    postHost({ type: 'fetch-abort', id })
    fail(new DOMException('The operation was aborted.', 'AbortError'))
  }
  signal?.addEventListener('abort', onAbort)

  return new Promise<Response>((resolve, reject) => {
    settle = { resolve, reject }
    offs.push(
      onHostMessage('fetch-head', (m) => {
        if (m.id !== id) return
        headed = true
        const status = Number(m.status)
        const res = new Response(NULL_BODY.has(status) ? null : stream, {
          status,
          statusText: String(m.statusText ?? ''),
          headers: new Headers(m.headers as [string, string][]),
        })
        Object.defineProperty(res, 'url', { value: url })
        resolve(res)
      }),
      onHostMessage('fetch-chunk', (m) => {
        if (m.id === id) controller.enqueue(enc.encode(String(m.text)))
      }),
      onHostMessage('fetch-end', (m) => {
        if (m.id !== id) return
        cleanup()
        try {
          controller.close()
        } catch {
          // 已取消
        }
      }),
      onHostMessage('fetch-error', (m) => {
        if (m.id === id) fail(new TypeError(String(m.message || 'Failed to fetch')))
      }),
    )
    postHost({ type: 'fetch', id, url, method, headers: [...headers.entries()], body })
  })
}
