import { useEffect, useState } from 'react'
import { parseExchange } from './books'
import type { Word } from './types'

/**
 * 单词卡增强资料（例句、短语、词根、辨析、英英释义），由 scripts/build-extras.mjs 生成，
 * 按单词首字母分片放在 public/data/x/，打开单词时按需加载。
 */

export interface RootInfo {
  /** 词根/词缀，如 'viv, vivi, vit' */
  key: string
  meaning: string
  /** 类型：词根 / 前缀 / 名词后缀… */
  kind: string
  /** 同根词 */
  examples: string[]
}

export interface SynGroup {
  words: string[]
  intro: string
  items: [string, string][]
}

export interface WordExtra {
  examples: [string, string][]
  phrases: [string, string][]
  roots: RootInfo[]
  groups: SynGroup[]
  defs: string[]
  /** 柯林斯星级 0-5 */
  collins: number
  /** 牛津 3000 核心词 */
  oxford: boolean
}

interface RawEntry {
  e?: [string, string][]
  p?: [string, string][]
  r?: number[]
  s?: number[]
  d?: string[]
  c?: number
  o?: 1
}

interface Shard {
  w: Record<string, RawEntry>
  r: { k: string; m: string; t: string; x: string[] }[]
  s: { w: string[]; i: string; d: [string, string][] }[]
}

const EMPTY: WordExtra = { examples: [], phrases: [], roots: [], groups: [], defs: [], collins: 0, oxford: false }

const shards = new Map<string, Promise<Shard>>()

function shardKey(word: string): string {
  const c = word[0]?.toLowerCase() ?? '_'
  return c >= 'a' && c <= 'z' ? c : '_'
}

function loadShard(key: string): Promise<Shard> {
  let p = shards.get(key)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/x/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`资料加载失败（${r.status}）`)
      return r.json() as Promise<Shard>
    })
    p.catch(() => shards.delete(key))
    shards.set(key, p)
  }
  return p
}

function expand(shard: Shard, word: string): WordExtra {
  const raw = shard.w[word]
  if (!raw) return EMPTY
  return {
    examples: raw.e ?? [],
    phrases: raw.p ?? [],
    roots: (raw.r ?? []).map((i) => shard.r[i]).filter(Boolean).map((r) => ({ key: r.k, meaning: r.m, kind: r.t, examples: r.x })),
    groups: (raw.s ?? []).map((i) => shard.s[i]).filter(Boolean).map((g) => ({ words: g.w, intro: g.i, items: g.d })),
    defs: raw.d ?? [],
    collins: raw.c ?? 0,
    oxford: raw.o === 1,
  }
}

export async function getExtra(word: string): Promise<WordExtra> {
  return expand(await loadShard(shardKey(word)), word)
}

/** 批量获取（测验的例句填空用） */
export async function getExtras(words: string[]): Promise<Map<string, WordExtra>> {
  const keys = [...new Set(words.map(shardKey))]
  const loaded = new Map(await Promise.all(keys.map(async (k) => [k, await loadShard(k)] as const)))
  return new Map(words.map((w) => [w, expand(loaded.get(shardKey(w))!, w)]))
}

export function useWordExtra(word: string): { extra: WordExtra | null; error: string | null } {
  const [state, setState] = useState<{ word: string; extra: WordExtra | null; error: string | null }>({
    word,
    extra: null,
    error: null,
  })
  useEffect(() => {
    let alive = true
    getExtra(word).then(
      (extra) => alive && setState({ word, extra, error: null }),
      (e: unknown) => alive && setState({ word, extra: null, error: e instanceof Error ? e.message : '资料加载失败' }),
    )
    return () => {
      alive = false
    }
  }, [word])
  return state.word === word ? state : { extra: null, error: null }
}

/** 单词的所有词形（原形 + 变化形式），用于在例句中高亮、挖空 */
export function wordForms(word: Word): string[] {
  const forms = new Set([word.w.toLowerCase()])
  for (const { value } of parseExchange(word.x)) forms.add(value.toLowerCase())
  return [...forms]
}

/** 把句子按目标词切开：返回 [文本, 是否目标词][] */
export function splitByForms(sentence: string, forms: string[]): [string, boolean][] {
  const set = new Set(forms.map((f) => f.toLowerCase()))
  const out: [string, boolean][] = []
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence))) {
    if (set.has(m[0].toLowerCase())) {
      if (m.index > last) out.push([sentence.slice(last, m.index), false])
      out.push([m[0], true])
      last = m.index + m[0].length
    }
  }
  if (last < sentence.length) out.push([sentence.slice(last), false])
  return out
}
