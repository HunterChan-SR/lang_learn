import { useMemo } from 'react'
import { orderWords } from './books'
import { wordStatus, type WordStatus } from './srs'
import type { AppData, Word } from './types'

export type WordFilter = 'all' | WordStatus | 'starred' | 'wrong'

export const WORD_FILTERS: { id: WordFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'new', label: '未学' },
  { id: 'learning', label: '学习中' },
  { id: 'mastered', label: '已掌握' },
  { id: 'starred', label: '生词本' },
  { id: 'wrong', label: '错题本' },
]

export const wordFilterOf = (s: string | null): WordFilter => WORD_FILTERS.find((f) => f.id === s)?.id ?? 'all'

/** 词库列表：按筛选条件和搜索词过滤。常规界面和代码皮肤共用 */
export function useWordList(bookWords: Word[], all: Map<string, Word> | null, data: AppData, filter: WordFilter, q: string) {
  const ordered = useMemo(() => orderWords(bookWords, data.settings.order), [bookWords, data.settings.order])

  const counts = useMemo(() => {
    const c: Record<WordFilter, number> = { all: ordered.length, new: 0, learning: 0, mastered: 0, starred: 0, wrong: 0 }
    for (const w of ordered) c[wordStatus(data.cards[w.w])] += 1
    c.starred = Object.keys(data.starred).length
    c.wrong = Object.keys(data.wrong).length
    return c
  }, [ordered, data])

  const list = useMemo(() => {
    let base: Word[]
    if (filter === 'starred' || filter === 'wrong') {
      const src = filter === 'starred' ? data.starred : data.wrong
      // 生词本/错题本按加入时间倒序，可能包含其他词库的词
      base = Object.keys(src)
        .sort((a, b) => (filter === 'starred' ? data.starred[b] - data.starred[a] : data.wrong[b].last - data.wrong[a].last))
        .map((k) => all?.get(k))
        .filter((w): w is Word => !!w)
    } else if (filter === 'all') {
      base = ordered
    } else {
      base = ordered.filter((w) => wordStatus(data.cards[w.w]) === filter)
    }
    if (!q) return base
    const isEn = /^[a-z' -]+$/.test(q)
    return base.filter((w) => (isEn ? w.w.toLowerCase().startsWith(q) : w.t.some((t) => t.includes(q))))
  }, [filter, ordered, data, all, q])

  return { counts, list }
}
