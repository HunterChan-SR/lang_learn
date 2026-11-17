import { useEffect, useState } from 'react'
import { desktop } from '../lib/desktop'
import { signInWithGitHub, signOut, syncNow, useSync } from '../lib/sync'
import { Icon } from './Icon'

function timeAgo(ts: number, now: number): string {
  const s = Math.round((now - ts) / 1000)
  if (s < 10) return '刚刚'
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function useNow(interval = 15000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export function AccountCard() {
  const sync = useSync()

  return (
    <section className="card">
      <h3>账号与同步</h3>
      {sync.auth === 'loading' && <p className="muted small">正在检查登录状态…</p>}
      {sync.auth === 'signedOut' && <LoginForm />}
      {sync.auth === 'signedIn' && <SignedIn />}
    </section>
  )
}

function LoginForm() {
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async () => {
    setBusy(true)
    setError(null)
    const err = await signInWithGitHub()
    // 成功时页面会跳转到 GitHub（桌面版在系统浏览器里打开），失败才会走到这里
    if (err) {
      setError(err)
      setBusy(false)
    }
  }

  // 桌面版：浏览器授权失败或被取消时恢复按钮
  useEffect(() => {
    if (sync.error) setBusy(false)
  }, [sync.error])

  return (
    <div className="login">
      <p className="muted small">登录后学习进度会自动同步，手机、iPad、电脑之间无缝切换。未登录时进度只保存在本机。</p>
      {(error || sync.error) && <p className="error small">{error || sync.error}</p>}
      <button className="btn github block" disabled={busy} onClick={() => void login()}>
        <GitHubMark />
        {busy ? (desktop ? '请在浏览器中完成授权…' : '正在跳转到 GitHub…') : '使用 GitHub 登录'}
      </button>
      {busy && desktop && (
        <p className="muted small">
          已在浏览器中打开 GitHub 授权页面，授权后会自动回到应用。
          <button type="button" className="link" onClick={() => setBusy(false)}>
            重新登录
          </button>
        </p>
      )}
      <p className="muted small">仅限已授权的 GitHub 账号使用。</p>
    </div>
  )
}

function GitHubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function SignedIn() {
  const sync = useSync()
  const now = useNow()
  const [busy, setBusy] = useState(false)

  const logout = async () => {
    if (!window.confirm('退出后，本机上的学习记录会被清除（云端已保存，重新登录即可恢复）。确定退出吗？')) return
    setBusy(true)
    let err = await signOut()
    if (err && window.confirm(`同步失败：${err}\n现在退出会丢失尚未同步的进度，仍要退出吗？`)) err = await signOut(true)
    setBusy(false)
  }

  let status: { cls: string; text: string }
  switch (sync.sync) {
    case 'syncing':
      status = { cls: 'syncing', text: '正在同步…' }
      break
    case 'offline':
      status = { cls: 'offline', text: '离线中，联网后会自动同步' }
      break
    case 'error':
      status = { cls: 'error', text: `同步失败：${sync.error ?? '未知错误'}` }
      break
    default:
      status = { cls: 'ok', text: sync.lastSync ? `已同步 · ${timeAgo(sync.lastSync, now)}` : '等待同步' }
  }

  return (
    <div className="account">
      <div className="account-head">
        {sync.avatar ? (
          <img className="avatar" src={sync.avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar">{(sync.name ?? '?').slice(0, 1).toUpperCase()}</span>
        )}
        <div className="account-info">
          <strong className="ellipsis">{sync.name}</strong>
          <span className={`sync-status ${status.cls}`}>
            <Icon name={sync.sync === 'error' ? 'close' : sync.sync === 'syncing' ? 'refresh' : 'cloud'} size={14} />
            {status.text}
          </span>
        </div>
      </div>
      <div className="row gap-sm wrap">
        <button className="btn sm" disabled={busy || sync.sync === 'syncing'} onClick={() => void syncNow()}>
          <Icon name="refresh" size={16} /> 立即同步
        </button>
        <button className="btn sm ghost" disabled={busy} onClick={() => void logout()}>
          退出登录
        </button>
      </div>
    </div>
  )
}
