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
  const hash = `#${to}`
  if (replace) window.location.replace(hash)
  else window.location.hash = to
}
