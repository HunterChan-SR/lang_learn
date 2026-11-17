import { useMemo } from 'react'
import { parseExchange, useAllWords } from './books'
import type { Word } from './types'

/**
 * 文章取词：把文中的单词（含变化形式）对应到四六级词库，用于点击查词。
 */
export function useLookup(): ((token: string) => Word | undefined) | null {
  const all = useAllWords()
  return useMemo(() => {
    if (!all) return null
    const forms = new Map<string, Word>()
    for (const w of all.values()) forms.set(w.w.toLowerCase(), w)
    for (const w of all.values()) {
      for (const { value } of parseExchange(w.x)) {
        const k = value.toLowerCase()
        if (!forms.has(k)) forms.set(k, w)
      }
    }
    const get = (k: string) => forms.get(k)
    return (token: string) => {
      const k = token.toLowerCase().replace(/[’']s$/, '')
      return (
        get(k) ??
        // 词库里没有列出的规则变化
        (k.endsWith('ies') ? get(`${k.slice(0, -3)}y`) : undefined) ??
        (k.endsWith('ied') ? get(`${k.slice(0, -3)}y`) : undefined) ??
        (k.endsWith('es') ? get(k.slice(0, -2)) : undefined) ??
        (k.endsWith('s') ? get(k.slice(0, -1)) : undefined) ??
        (k.endsWith('ed') ? (get(k.slice(0, -2)) ?? get(k.slice(0, -1))) : undefined) ??
        (k.endsWith('ing') ? (get(k.slice(0, -3)) ?? get(`${k.slice(0, -3)}e`)) : undefined) ??
        (k.endsWith('ly') ? get(k.slice(0, -2)) : undefined)
      )
    }
  }, [all])
}
