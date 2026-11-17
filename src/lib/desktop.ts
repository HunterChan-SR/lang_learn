/**
 * 桌面版（Electron）提供的能力，网页版里为 null。见 desktop/preload.cjs。
 */
export interface DesktopBridge {
  version: string
  platform: string
  openExternal(url: string): Promise<void>
  onAuthCallback(cb: (url: string) => void): () => void
  checkUpdate(): Promise<unknown>
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

export const desktop: DesktopBridge | null = typeof window !== 'undefined' ? (window.desktop ?? null) : null

/** 桌面版登录回调地址（需要加入 Supabase 的 Redirect URLs） */
export const DESKTOP_AUTH_CALLBACK = 'cet-words://auth-callback'

/**
 * 请求第三方接口。桌面版经主进程转发，不受浏览器跨域限制；网页版直接 fetch。
 */
export const netFetch: typeof fetch = (input, init) => {
  if (!desktop) return fetch(input, init)
  if (input instanceof Request) {
    return fetch(new Request(proxyUrl(input.url), input), init)
  }
  return fetch(proxyUrl(String(input)), init)
}

function proxyUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? `${window.location.origin}/__proxy?u=${encodeURIComponent(url)}` : url
}
