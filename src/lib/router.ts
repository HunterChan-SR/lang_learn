import { useMemo, useSyncExternalStore } from 'react'

/**
 * 极简 hash 路由：GitHub Pages 没有服务端重写，hash 路由刷新任何页面都不会 404。
 * 形如 #/quiz?src=wrong
 */
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const getHash = () => window.location.hash

export interface Route {
  path: string
  query: URLSearchParams
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash)
  return useMemo(() => {
    const raw = hash.replace(/^#/, '') || '/'
    const [path, qs = ''] = raw.split('?')
    return { path: path || '/', query: new URLSearchParams(qs) }
  }, [hash])
}

export function navigate(to: string, replace = false) {
  // 用完整地址：插件版页面里有 <base>，相对地址 '#/x' 会被解析成另一个页面
  if (replace) window.location.replace(`${window.location.href.split('#')[0]}#${to}`)
  else window.location.hash = to
}

/**
 * 插件版页面里有 <base>（指向插件目录），<a href="#/x"> 会跳到另一个页面。
 * 拦截这类链接，改为只修改当前页面的 hash。
 */
export function fixHashLinks() {
  if (!document.querySelector('base')) return
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]')
    if (!a) return
    e.preventDefault()
    window.location.hash = a.getAttribute('href')!.slice(1)
  })
}
