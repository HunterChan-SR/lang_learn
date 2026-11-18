import { desktop, DESKTOP_AUTH_CALLBACK } from './desktop'
import { onHostMessage, postHost, requestHost, vscodeFetch, vscodeHost } from './vscode'

/**
 * 运行环境：网页、桌面版（Electron）、VS Code 插件。
 * 页面代码通过这里使用和环境有关的能力，不直接判断环境。
 */
export type HostKind = 'web' | 'desktop' | 'vscode'

export const hostKind: HostKind = vscodeHost ? 'vscode' : desktop ? 'desktop' : 'web'

/** 网络请求由宿主转发（不受浏览器跨域限制，可以访问内网和本机接口） */
export const proxied = hostKind !== 'web'

/** 请求第三方接口：桌面版经主进程转发，插件版经插件转发，网页版直接 fetch */
export const netFetch: typeof fetch = (input, init) => {
  if (vscodeHost) return vscodeFetch(input, init)
  if (!desktop) return fetch(input, init)
  if (input instanceof Request) return fetch(new Request(desktopProxyUrl(input.url), input), init)
  return fetch(desktopProxyUrl(String(input)), init)
}

function desktopProxyUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? `${window.location.origin}/__proxy?u=${encodeURIComponent(url)}` : url
}

/** 用系统浏览器打开链接 */
export async function openExternal(url: string): Promise<void> {
  if (vscodeHost) postHost({ type: 'open', url })
  else if (desktop) await desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

/** 确认框。插件版的 webview 不能弹 confirm()，改由 VS Code 弹出 */
export async function confirmDialog(message: string, ok = '确定'): Promise<boolean> {
  if (!vscodeHost) return window.confirm(message)
  const r = await requestHost<{ ok: boolean }>({ type: 'confirm', message, okLabel: ok }, 'confirm-result')
  return r.ok
}

export async function alertDialog(message: string): Promise<void> {
  if (!vscodeHost) return window.alert(message)
  postHost({ type: 'alert', message })
}

/** 保存文本文件：网页/桌面版触发下载，插件版弹出保存对话框 */
export async function saveTextFile(name: string, text: string): Promise<void> {
  if (vscodeHost) {
    await requestHost({ type: 'save', name, text }, 'save-result')
    return
  }
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 桌面版/插件版的登录回调地址（需要加入 Supabase 的 Redirect URLs）；网页版为 null */
export const appAuthCallback: string | null = vscodeHost ? vscodeHost.authCallback : desktop ? DESKTOP_AUTH_CALLBACK : null

/** 监听桌面版/插件版的登录回调 */
export function onAuthCallback(cb: (url: string) => void): () => void {
  if (vscodeHost) return onHostMessage('auth-callback', (m) => cb(String(m.url)))
  if (desktop) return desktop.onAuthCallback(cb)
  return () => {}
}

/** 宿主名称和版本，显示在「我的」页面 */
export function hostLabel(): string | null {
  if (vscodeHost) return `${vscodeHost.appName} 插件 ${vscodeHost.version}`
  if (desktop) return `桌面版 ${desktop.version}`
  return null
}
