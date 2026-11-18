import { forwardRef, type ReactNode } from 'react'

/**
 * 代码皮肤的基础组件：把界面画成编辑器里的一段代码。
 * - <Code> 编辑器区域，行号用 CSS 计数器自动生成
 * - <L> 一行代码，i 为缩进层级（画缩进参考线），mark 为行号左侧的图标，git 为行号右侧的修改标记
 * - <Lens> 行上方的 CodeLens（灰色小字链接），用作按钮
 * - 语法高亮：K 关键字、C 控制关键字、S 字符串、N 数字、Cm 注释、F 函数、V 变量/属性、T 类型、Ct 常量
 * - <Act> 可点击的代码片段
 */

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`cx-code${className ? ` ${className}` : ''}`}>{children}</div>
}

export type Mark = 'pass' | 'fail' | 'star' | 'run' | 'dot'

interface LineProps {
  i?: number
  children?: ReactNode
  mark?: Mark | null
  git?: 'add' | 'mod' | null
  active?: boolean
  className?: string
  onClick?: () => void
  title?: string
}

export const L = forwardRef<HTMLDivElement, LineProps>(function L({ i = 0, children, mark, git, active, className, onClick, title }, ref) {
  return (
    <div
      ref={ref}
      className={`cx-ln${active ? ' active' : ''}${onClick ? ' click' : ''}${className ? ` ${className}` : ''}`}
      data-git={git ?? undefined}
      onClick={onClick}
      title={title}
    >
      <span className="cx-gut" aria-hidden="true">
        <span className="cx-glyph">{mark && <Glyph kind={mark} />}</span>
        <span className="cx-num" />
      </span>
      {i > 0 && (
        <span className="cx-ind" aria-hidden="true">
          {Array.from({ length: i }, (_, k) => (
            <span key={k} className="cx-ig" />
          ))}
        </span>
      )}
      <span className="cx-src">{children ?? '​'}</span>
    </div>
  )
})

export interface LensItem {
  label: ReactNode
  onClick?: () => void
  title?: string
}

/** CodeLens：行上方一排灰色小字，可点的项像链接 */
export function Lens({ i = 0, items }: { i?: number; items: (LensItem | false | null | undefined)[] }) {
  const list = items.filter((x): x is LensItem => !!x)
  if (list.length === 0) return null
  return (
    <div className="cx-lens">
      <span className="cx-gut" aria-hidden="true" />
      {i > 0 && (
        <span className="cx-ind" aria-hidden="true">
          {Array.from({ length: i }, (_, k) => (
            <span key={k} className="cx-ig" />
          ))}
        </span>
      )}
      <span className="cx-lens-items">
        {list.map((it, k) => (
          <span key={k}>
            {k > 0 && <span className="cx-lens-sep"> | </span>}
            {it.onClick ? (
              <button type="button" className="cx-lens-btn" title={it.title} onClick={it.onClick}>
                {it.label}
              </button>
            ) : (
              <span title={it.title}>{it.label}</span>
            )}
          </span>
        ))}
      </span>
    </div>
  )
}

type TokProps = { children?: ReactNode; className?: string }
const tok = (cls: string) =>
  function Tok({ children, className }: TokProps) {
    return <span className={`${cls}${className ? ` ${className}` : ''}`}>{children}</span>
  }

export const K = tok('t-k')
export const C = tok('t-c')
export const N = tok('t-n')
export const Cm = tok('t-cm')
export const F = tok('t-f')
export const V = tok('t-v')
export const T = tok('t-t')
export const Ct = tok('t-ct')
export const P = tok('t-p')

/** 字符串字面量（带引号） */
export function S({ children, q = "'", className }: { children?: ReactNode; q?: string; className?: string }) {
  return (
    <span className={`t-s${className ? ` ${className}` : ''}`}>
      {q}
      {children}
      {q}
    </span>
  )
}

/** JSON 的键 */
export function JK({ children }: { children: ReactNode }) {
  return <span className="t-jk">"{children}"</span>
}

export function Act({ children, onClick, title, className }: { children: ReactNode; onClick: () => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      className={`cx-act${className ? ` ${className}` : ''}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

/** 灰色斜体的“建议文字”，类似 Copilot 的行内提示 */
export function Ghost({ children }: { children: ReactNode }) {
  return <span className="cx-ghost">{children}</span>
}

export function Glyph({ kind }: { kind: Mark }) {
  switch (kind) {
    case 'pass':
      return (
        <svg className="g-pass" viewBox="0 0 16 16" width="14" height="14">
          <path d="M6.3 11.3 3.2 8.2l.9-.9 2.2 2.2 5.6-5.6.9.9z" fill="currentColor" />
        </svg>
      )
    case 'fail':
      return (
        <svg className="g-fail" viewBox="0 0 16 16" width="14" height="14">
          <path d="m8 7.1 3.6-3.6.9.9L8.9 8l3.6 3.6-.9.9L8 8.9l-3.6 3.6-.9-.9L7.1 8 3.5 4.4l.9-.9z" fill="currentColor" />
        </svg>
      )
    case 'star':
      return (
        <svg className="g-star" viewBox="0 0 16 16" width="13" height="13">
          <path d="M8 1.5 9.9 5.8l4.6.4-3.5 3 1.1 4.6L8 11.4l-4.1 2.4L5 9.2l-3.5-3 4.6-.4z" fill="currentColor" />
        </svg>
      )
    case 'run':
      return (
        <svg className="g-run" viewBox="0 0 16 16" width="13" height="13">
          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
      )
    case 'dot':
      return <span className="g-dot" />
  }
}

export type FileKind = 'ts' | 'json' | 'md' | 'gear'

/** 文件图标（仿编辑器文件图标主题的样式） */
export function FileIcon({ kind }: { kind: FileKind }) {
  switch (kind) {
    case 'ts':
      return <span className="fi fi-ts">TS</span>
    case 'json':
      return <span className="fi fi-json">{'{}'}</span>
    case 'md':
      return (
        <svg className="fi fi-md" viewBox="0 0 16 16" width="14" height="14">
          <path d="M1.5 4h13v8h-13zM3 10.5V5.5h1.3L6 7.6l1.7-2.1H9v5H7.7V7.4L6 9.5 4.3 7.4v3.1zm8.3 0L9.6 8.4h1.1V5.5H12v2.9h1.1z" fill="currentColor" />
        </svg>
      )
    case 'gear':
      return (
        <svg className="fi fi-gear" viewBox="0 0 16 16" width="14" height="14">
          <path
            d="M9.1 1.5 9.5 3.3a5 5 0 0 1 1.2.7l1.7-.6 1.1 1.9-1.4 1.2a5 5 0 0 1 0 1.4l1.4 1.2-1.1 1.9-1.7-.6a5 5 0 0 1-1.2.7l-.4 1.8H6.9l-.4-1.8a5 5 0 0 1-1.2-.7l-1.7.6-1.1-1.9 1.4-1.2a5 5 0 0 1 0-1.4L2.5 5.3l1.1-1.9 1.7.6a5 5 0 0 1 1.2-.7l.4-1.8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
            fill="currentColor"
          />
        </svg>
      )
  }
}

/** 浏览器标签页图标（data URL），在内置浏览器里看起来像一个代码文件 */
export function faviconFor(kind: FileKind): string {
  const svg: Record<FileKind, string> = {
    ts: '<text x="8" y="12" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="9" text-anchor="middle" fill="#519aba">TS</text>',
    json: '<text x="8" y="12.5" font-family="Menlo,Consolas,monospace" font-weight="700" font-size="10" text-anchor="middle" fill="#cbcb41">{}</text>',
    md: '<path d="M1.5 4h13v8h-13zM3 10.5V5.5h1.3L6 7.6l1.7-2.1H9v5H7.7V7.4L6 9.5 4.3 7.4v3.1zm8.3 0L9.6 8.4h1.1V5.5H12v2.9h1.1z" fill="#519aba"/>',
    gear: '<circle cx="8" cy="8" r="4.5" fill="none" stroke="#8a8a8a" stroke-width="2.4" stroke-dasharray="2.2 1.3"/><circle cx="8" cy="8" r="1.6" fill="#8a8a8a"/>',
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${svg[kind]}</svg>`)}`
}
