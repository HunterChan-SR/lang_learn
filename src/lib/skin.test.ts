import { describe, expect, it } from 'vitest'
import { isCommonBrowser } from './skin'

const UA = {
  vscode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.145.3 Chrome/150.0.7871.250 Electron/43.8.3 Safari/537.36',
  cursor: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/2.1.0 Chrome/138.0.0.0 Electron/37.2.3 Safari/537.36',
  desktopApp:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) langLearn/0.3.1 Chrome/146.0.0.0 Electron/45.3.3 Safari/537.36',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  wechatIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.60(0x18003c2f) NetType/WIFI Language/zh_CN',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  unknown: 'curl/8.7.1',
}

describe('isCommonBrowser', () => {
  it('编辑器内置浏览器和 Electron 应用不算常用浏览器（默认代码皮肤）', () => {
    expect(isCommonBrowser(UA.vscode)).toBe(false)
    expect(isCommonBrowser(UA.cursor)).toBe(false)
    expect(isCommonBrowser(UA.desktopApp)).toBe(false)
    expect(isCommonBrowser(UA.unknown)).toBe(false)
  })

  it('常用桌面浏览器、手机和 App 内置浏览器用常规界面', () => {
    for (const k of ['chrome', 'edge', 'safari', 'firefox', 'iphone', 'wechatIOS', 'android'] as const) {
      expect(isCommonBrowser(UA[k]), k).toBe(true)
    }
  })
})
