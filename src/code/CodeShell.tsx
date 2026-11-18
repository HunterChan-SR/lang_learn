import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate } from '../lib/router'
import { postHost, vscodeHost } from '../lib/vscode'
import { faviconFor, FileIcon } from './Code'
import { fileFor, PINNED, type CodeFile } from './files'

/**
 * 代码皮肤的外壳：标签栏（仅网页里显示；插件版由 VS Code 自己的标签页代替）、面包屑、编辑区。
 * 同时把标签页标题和图标改成当前“文件”的样子。
 */
export function CodeShell({ path, query, children }: { path: string; query: URLSearchParams; children: ReactNode }) {
  const file = fileFor(path, query)
  const tabs = PINNED.some((f) => f.title === file.title) ? PINNED : [...PINNED, file]

  useEffect(() => {
    document.title = file.title
    if (vscodeHost) {
      const route = window.location.hash.replace(/^#/, '') || '/'
      postHost({ type: 'page', title: file.title, kind: file.kind, route })
      // VS Code 重启后恢复到这个页面
      vscodeHost.api.setState({ route })
    }
  }, [file.title, file.kind, path, query])

  useFavicon(file)

  return (
    <div className="cx-shell">
      <div className="cx-top">
        {!vscodeHost && (
          <div className="cx-tabs" role="tablist">
            {tabs.map((t) => {
              const active = t.title === file.title
              return (
                <button
                  key={t.title}
                  role="tab"
                  aria-selected={active}
                  className={`cx-tab${active ? ' active' : ''}${t.pinned ? '' : ' preview'}`}
                  onClick={() => !active && navigate(t.path)}
                >
                  <FileIcon kind={t.kind} />
                  <span className="cx-tab-name">{t.title}</span>
                  <span
                    className="cx-tab-close"
                    role="button"
                    aria-label="关闭"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (active) navigate(t.pinned ? '/' : parentOf(t))
                    }}
                  >
                    ×
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {file.code && <Breadcrumbs file={file} />}
      </div>
      <div className={file.code ? 'cx-editor' : 'cx-doc'}>{children}</div>
    </div>
  )
}

/** 关闭临时打开的文件时回到的页面 */
function parentOf(f: CodeFile): string {
  if (f.path.startsWith('/practice')) return '/practice'
  if (f.path === '/quiz') return '/quiz'
  return '/'
}

function Breadcrumbs({ file }: { file: CodeFile }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const parts = ['lang_learn', ...file.dir]
  return (
    <div className="cx-crumbs" ref={ref}>
      {parts.map((p) => (
        <span key={p} className="cx-crumb">
          <button type="button" onClick={() => setOpen((o) => !o)}>
            {p}
          </button>
          <span className="cx-crumb-sep">›</span>
        </span>
      ))}
      <span className="cx-crumb current">
        <button type="button" onClick={() => setOpen((o) => !o)}>
          <FileIcon kind={file.kind} />
          {file.name}
        </button>
      </span>
      {open && (
        <div className="cx-picker" role="menu">
          {PINNED.map((f) => (
            <button
              key={f.title}
              role="menuitem"
              className={f.path === file.path && f.name === file.name ? 'on' : ''}
              onClick={() => {
                setOpen(false)
                navigate(f.path)
              }}
            >
              <FileIcon kind={f.kind} />
              <span>{f.name}</span>
              <span className="cx-picker-dir">{['lang_learn', ...f.dir].join('/')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 网页里把浏览器标签页图标换成文件图标，离开代码皮肤时恢复 */
function useFavicon(file: CodeFile) {
  useEffect(() => {
    if (vscodeHost) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    const original = link.dataset.original ?? link.href
    link.dataset.original = original
    link.type = 'image/svg+xml'
    link.href = faviconFor(file.kind)
    return () => {
      link.href = original
    }
  }, [file.kind])
}
