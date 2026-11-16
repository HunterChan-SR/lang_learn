import { useEffect, useMemo, useState } from 'react'
import type { BookId, RawWord, Word, WordOrder } from './types'

export interface BookMeta {
  id: BookId
  name: string
  short: string
  desc: string
}

export const BOOKS: BookMeta[] = [
  { id: 'cet4', name: '大学英语四级', short: '四级', desc: 'CET-4 考纲词汇' },
  { id: 'cet6', name: '大学英语六级', short: '六级', desc: 'CET-6 考纲词汇（不含四级）' },
]

export function bookMeta(id: BookId): BookMeta {
  return BOOKS.find((b) => b.id === id) ?? BOOKS[0]
}

const cache = new Map<BookId, Promise<Word[]>>()

/** 词库按词频排序存放（常用词在前） */
export function loadBook(id: BookId): Promise<Word[]> {
  let p = cache.get(id)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`词库加载失败（${r.status}）`)
        return r.json() as Promise<RawWord[]>
      })
      .then((rows) => rows.map(([w, p, t, x]) => ({ w, p, t: t.split('\n'), x: x || undefined })))
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}

/** 稳定的伪随机：同一个单词每次得到同样的位置，避免刷新后顺序变化 */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function orderWords(words: Word[], order: WordOrder): Word[] {
  if (order === 'freq') return words
  const copy = words.slice()
  if (order === 'alpha') return copy.sort((a, b) => a.w.localeCompare(b.w, 'en', { sensitivity: 'base' }))
  return copy.sort((a, b) => hash(a.w) - hash(b.w))
}

export interface BookState {
  words: Word[]
  byWord: Map<string, Word>
  loading: boolean
  error: string | null
  retry: () => void
}

export function useBook(id: BookId): BookState {
  const [words, setWords] = useState<Word[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedId, setLoadedId] = useState<BookId | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    loadBook(id).then(
      (list) => {
        if (!alive) return
        setWords(list)
        setLoadedId(id)
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : '词库加载失败'),
    )
    return () => {
      alive = false
    }
  }, [id, attempt])

  const byWord = useMemo(() => new Map(words.map((w) => [w.w, w])), [words])
  const ready = loadedId === id
  return {
    words: ready ? words : [],
    byWord: ready ? byWord : new Map(),
    loading: !ready && !error,
    error,
    retry: () => setAttempt((n) => n + 1),
  }
}

/** 合并所有词库（生词本、错题本里的词可能来自不同词库） */
export function useAllWords(): Map<string, Word> | null {
  const [map, setMap] = useState<Map<string, Word> | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all(BOOKS.map((b) => loadBook(b.id))).then(
      (lists) => {
        if (!alive) return
        const m = new Map<string, Word>()
        for (const list of lists) for (const w of list) if (!m.has(w.w)) m.set(w.w, w)
        setMap(m)
      },
      () => alive && setMap(new Map()),
    )
    return () => {
      alive = false
    }
  }, [])
  return map
}

// ---------------- 文本工具 ----------------

const POS_RE = /^([a-z]+\.(?:\s*&\s*[a-z]+\.)?)\s*/i

/** 拆出词性和释义：'n. 苹果, 家伙' -> ['n.', '苹果, 家伙'] */
export function splitPos(line: string): [string, string] {
  const m = line.match(POS_RE)
  return m ? [m[1], line.slice(m[0].length)] : ['', line]
}

/** 选择题选项用的简短释义 */
export function shortMeaning(word: Word, max = 26): string {
  const line = word.t[0] ?? ''
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const idx = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf(','), cut.lastIndexOf('；'), cut.lastIndexOf(';'))
  return idx > 6 ? cut.slice(0, idx) : `${cut}…`
}

export function firstPos(word: Word): string {
  return splitPos(word.t[0] ?? '')[0]
}

const EXCHANGE_LABELS: Record<string, string> = {
  s: '复数',
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '三单',
  r: '比较级',
  t: '最高级',
}

/** 解析 ECDICT 的词形变化：'p:went/d:gone/...' */
export function parseExchange(x: string | undefined): { label: string; value: string }[] {
  if (!x) return []
  const out: { label: string; value: string }[] = []
  for (const part of x.split('/')) {
    const [k, v] = part.split(':')
    const label = EXCHANGE_LABELS[k]
    if (label && v) out.push({ label, value: v })
  }
  return out
}
