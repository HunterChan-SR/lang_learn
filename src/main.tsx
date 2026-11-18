import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { hostKind } from './lib/host'
import { fixHashLinks, navigate } from './lib/router'
import { stopSpeaking } from './lib/speech'
import { onHostMessage, postHost, vscodeHost } from './lib/vscode'
import { initSync } from './lib/sync'
import './styles.css'
import './code/code.css'

document.documentElement.dataset.host = hostKind
fixHashLinks()

if (vscodeHost) {
  if (vscodeHost.route && !window.location.hash) navigate(vscodeHost.route, true)
  onHostMessage('navigate', (m) => navigate(String(m.path)))
  // 老板键：立刻停止发音
  onHostMessage('boss', () => stopSpeaking())
  postHost({ type: 'ready' })
}
initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
