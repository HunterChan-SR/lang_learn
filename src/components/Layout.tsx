import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: '首页', icon: 'home' },
  { path: '/words', label: '词库', icon: 'book' },
  { path: '/quiz', label: '测验', icon: 'quiz' },
  { path: '/me', label: '我的', icon: 'user' },
]

/**
 * 手机：底部 Tab 栏；iPad / PC（≥768px）：左侧导航栏。
 * focus 模式（学习、答题中）隐藏导航，让注意力集中在卡片上。
 */
export function Layout({ path, focus, children }: { path: string; focus: boolean; children: ReactNode }) {
  if (focus) return <div className="focus-shell">{children}</div>

  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p))
  return (
    <div className="shell">
      <nav className="nav" aria-label="主导航">
        <div className="nav-brand">
          <span className="brand-mark">词</span>
          <span className="brand-text">四六级单词</span>
        </div>
        {TABS.map((t) => (
          <a key={t.path} href={`#${t.path}`} className={`nav-item${active(t.path) ? ' active' : ''}`}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
