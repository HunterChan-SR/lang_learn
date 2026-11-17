/**
 * 桌面版预加载脚本：给页面暴露 window.desktop，页面据此判断是否运行在桌面应用里。
 */
const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('app-info')

contextBridge.exposeInMainWorld('desktop', {
  version: info.version,
  platform: info.platform,
  /** 用系统浏览器打开链接 */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  /** 收到 cet-words://auth-callback?… 登录回调；返回取消订阅的函数 */
  onAuthCallback: (cb) => {
    const listener = (_event, url) => cb(url)
    ipcRenderer.on('auth-callback', listener)
    return () => ipcRenderer.removeListener('auth-callback', listener)
  },
  checkUpdate: () => ipcRenderer.invoke('check-update'),
})
