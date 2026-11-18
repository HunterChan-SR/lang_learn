import { useSyncExternalStore } from 'react'
import { vscodeHost } from './vscode'

/**
 * 界面皮肤：default 为常规界面；code 为“代码皮肤”，整个界面伪装成代码编辑器。
 * 皮肤跟设备走（公司电脑用代码皮肤、手机用常规界面），不随进度同步。
 * - VS Code 插件版固定为代码皮肤
 * - 网址带 ?skin=code / ?skin=default 时切换并记住，方便在 VS Code 的内置浏览器里直接打开
 */
export type Skin = 'default' | 'code'

const KEY = 'cet-words:skin'

function initial(): Skin {
  if (vscodeHost) return 'code'
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('skin')
    if (fromUrl === 'code' || fromUrl === 'default') {
      localStorage.setItem(KEY, fromUrl)
      return fromUrl
    }
    return localStorage.getItem(KEY) === 'code' ? 'code' : 'default'
  } catch {
    return 'default'
  }
}

let skin: Skin = typeof window !== 'undefined' ? initial() : 'default'
const listeners = new Set<() => void>()

export const skinLocked = !!vscodeHost

export function getSkin(): Skin {
  return skin
}

export function setSkin(next: Skin) {
  if (skinLocked || next === skin) return
  skin = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, getSkin, getSkin)
}
