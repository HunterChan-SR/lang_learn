import { useSyncExternalStore } from 'react'
import { vscodeHost } from './vscode'

/**
 * 界面皮肤：default 为常规界面；code 为“代码皮肤”，整个界面伪装成代码编辑器。
 *
 * 默认（auto）用代码皮肤，只有识别为常用浏览器（Chrome、Safari、Edge、Firefox 等）或手机、平板时
 * 才用常规界面。VS Code / Cursor / Trae 的内置浏览器、桌面版等 Electron 环境都算“非常用浏览器”。
 *
 * - 用户在「我的 → 界面」里手动选过的，以手动选择为准（按设备保存，不随进度同步）
 * - 网址带 ?skin=code / ?skin=default / ?skin=auto 时切换并记住
 * - VS Code 插件固定为代码皮肤
 */
export type Skin = 'default' | 'code'
export type SkinPref = Skin | 'auto'

const KEY = 'cet-words:skin'

/** 是否为常用浏览器（或手机、平板）：是则默认用常规界面 */
export function isCommonBrowser(ua: string): boolean {
  // 桌面应用里的网页：VS Code / Cursor / Trae 的内置浏览器、Electron 应用（包括本项目的桌面版）
  if (/Electron\//i.test(ua)) return false
  // 手机、平板（包括微信等 App 内置的浏览器）
  if (/Mobi|Android|iPhone|iPad|iPod|HarmonyOS/i.test(ua)) return true
  return /(Chrome|Chromium|CriOS|Firefox|FxiOS|Safari|Edg|OPR|Opera)\//i.test(ua)
}

const autoSkin = (): Skin => (typeof navigator !== 'undefined' && isCommonBrowser(navigator.userAgent) ? 'default' : 'code')

function readPref(): SkinPref {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('skin')
    if (fromUrl === 'code' || fromUrl === 'default') {
      localStorage.setItem(KEY, fromUrl)
      return fromUrl
    }
    if (fromUrl === 'auto') {
      localStorage.removeItem(KEY)
      return 'auto'
    }
    const saved = localStorage.getItem(KEY)
    return saved === 'code' || saved === 'default' ? saved : 'auto'
  } catch {
    return 'auto'
  }
}

export const skinLocked = !!vscodeHost

let pref: SkinPref = typeof window !== 'undefined' && !skinLocked ? readPref() : 'auto'
const auto: Skin = typeof window !== 'undefined' ? autoSkin() : 'default'
const listeners = new Set<() => void>()

/** 实际使用的皮肤 */
export function getSkin(): Skin {
  if (skinLocked) return 'code'
  return pref === 'auto' ? auto : pref
}

export function getSkinPref(): SkinPref {
  return pref
}

/** 自动模式下会用哪种皮肤（设置页显示用） */
export function autoSkinValue(): Skin {
  return auto
}

export function setSkinPref(next: SkinPref) {
  if (skinLocked || next === pref) return
  pref = next
  try {
    if (next === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
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

export function useSkinPref(): SkinPref {
  return useSyncExternalStore(subscribe, getSkinPref, getSkinPref)
}
