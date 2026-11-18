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
