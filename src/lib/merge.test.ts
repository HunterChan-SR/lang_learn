import { describe, expect, it } from 'vitest'
import { mergeData, stableStringify } from './merge'
import { schedule } from './srs'
import type { AppData } from './types'

const NOW = 1_800_000_000_000
const T = 20000

function base(patch: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    meta: { epoch: 0, settingsAt: 0, removed: {} },
    settings: { book: 'cet4', dailyNew: 20, accent: 'us', voice: 'system', autoPlay: true, order: 'freq' },
    cards: {},
    starred: {},
    wrong: {},
    days: {},
    practice: {},
    ...patch,
  }
}

const card = (last: number, seen = 1) => ({ ...schedule(undefined, 2, T, last), seen })

describe('mergeData', () => {
  it('练习记录取并集', () => {
    const rec = (at: number) => ({ kind: 'reading', level: 'cet4' as const, set: 'r1', title: 't', score: 3, total: 5, at })
    const a = base({ practice: { x1: rec(NOW - 10) } })
    const b = base({ practice: { x2: rec(NOW - 5) } })
    expect(Object.keys(mergeData(a, b, NOW).practice).sort()).toEqual(['x1', 'x2'])
  })

  it('合并结果与参数顺序无关', () => {
    const a = base({ cards: { apple: card(NOW - 10), book: card(NOW - 5) }, starred: { apple: NOW - 100 } })
    const b = base({ cards: { apple: card(NOW - 1), cat: card(NOW - 3) }, starred: { cat: NOW - 50 } })
    expect(stableStringify(mergeData(a, b, NOW))).toBe(stableStringify(mergeData(b, a, NOW)))
  })

  it('单词记忆状态取最近复习的那份，两边的新词都保留', () => {
    const a = base({ cards: { apple: card(NOW - 10), book: card(NOW - 5) } })
    const b = base({ cards: { apple: card(NOW - 1, 3), cat: card(NOW - 3) } })
    const m = mergeData(a, b, NOW)
    expect(Object.keys(m.cards).sort()).toEqual(['apple', 'book', 'cat'])
    expect(m.cards.apple.seen).toBe(3)
  })

  it('另一台设备取消收藏后不会被旧数据复活；重新收藏则保留', () => {
    const stale = base({ starred: { apple: NOW - 1000, book: NOW - 1000 } })
    const fresh = base({
      starred: { book: NOW - 10 },
      meta: { epoch: 0, settingsAt: 0, removed: { 'star:apple': NOW - 500, 'star:book': NOW - 500 } },
    })
    const m = mergeData(stale, fresh, NOW)
    expect(m.starred).toEqual({ book: NOW - 10 })
  })

  it('错题本：移出记录比答错时间新则移除', () => {
    const a = base({ wrong: { apple: { n: 1, streak: 0, last: NOW - 1000 }, book: { n: 2, streak: 0, last: NOW - 10 } } })
    const b = base({ meta: { epoch: 0, settingsAt: 0, removed: { 'wrong:apple': NOW - 500, 'wrong:book': NOW - 500 } } })
    expect(Object.keys(mergeData(a, b, NOW).wrong)).toEqual(['book'])
  })

  it('每日统计取较大值，重复同步不会翻倍', () => {
    const a = base({ days: { '2026-11-16': { learned: 10, reviewed: 5, quiz: 0, correct: 0 } } })
    const b = base({ days: { '2026-11-16': { learned: 8, reviewed: 9, quiz: 2, correct: 1 } } })
    const once = mergeData(a, b, NOW)
    const twice = mergeData(once, b, NOW)
    expect(twice.days['2026-11-16']).toEqual({ learned: 10, reviewed: 9, quiz: 2, correct: 1 })
  })

  it('设置取最近修改的一方', () => {
    const a = base({ meta: { epoch: 0, settingsAt: NOW - 100, removed: {} } })
    const b = base({ meta: { epoch: 0, settingsAt: NOW - 10, removed: {} } })
    b.settings = { ...b.settings, dailyNew: 50 }
    expect(mergeData(a, b, NOW).settings.dailyNew).toBe(50)
  })

  it('纪元不同（重置/导入过）时较新的一方整体生效', () => {
    const old = base({ cards: { apple: card(NOW - 1) } })
    const reset = base({ meta: { epoch: NOW - 100, settingsAt: 0, removed: {} } })
    expect(mergeData(old, reset, NOW)).toBe(reset)
    expect(mergeData(reset, old, NOW)).toBe(reset)
  })

  it('过期的删除记录会被清理', () => {
    const a = base({ meta: { epoch: 0, settingsAt: 0, removed: { 'star:old': NOW - 100 * 86_400_000, 'star:new': NOW - 1000 } } })
    expect(Object.keys(mergeData(a, base(), NOW).meta.removed)).toEqual(['star:new'])
  })
})

describe('stableStringify', () => {
  it('与属性顺序无关', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: [1, { e: 1, f: 2 }] } })).toBe(stableStringify({ b: { d: [1, { f: 2, e: 1 }], c: 2 }, a: 1 }))
  })
})
