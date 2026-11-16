import { describe, expect, it } from 'vitest'
import { dayIndex, dayKey, formatInterval } from './date'
import { buildQuiz, checkSpelling } from './quiz'
import { buildQueue, dailyPlan } from './session'
import { MASTERED_IVL, nextIntervals, schedule, wordStatus } from './srs'
import type { AppData, CardState, Word } from './types'

const T = 20000 // 任意一天的 dayIndex

describe('srs', () => {
  it('新词：模糊 1 天 / 认识 2 天 / 太简单 6 天', () => {
    expect(nextIntervals(undefined)).toEqual([0, 1, 2, 6])
    const c = schedule(undefined, 2, T)
    expect(c).toMatchObject({ due: T + 2, ivl: 2, reps: 1, seen: 1, lapses: 0 })
  })

  it('忘记后当天重来，且不算遗忘次数（新词）', () => {
    const c = schedule(undefined, 0, T)
    expect(c.due).toBe(T)
    expect(c.reps).toBe(0)
    expect(c.lapses).toBe(0)
    // 同一组里再次“认识”只给 1 天
    expect(schedule(c, 2, T).ivl).toBe(1)
  })

  it('连续“认识”间隔递增，最终达到已掌握', () => {
    let c: CardState | undefined
    let day = T
    for (let i = 0; i < 8; i++) {
      c = schedule(c, 2, day)
      day = c.due
    }
    expect(c!.ivl).toBeGreaterThanOrEqual(MASTERED_IVL)
    expect(wordStatus(c)).toBe('mastered')
  })

  it('评分越高间隔越长', () => {
    let c = schedule(undefined, 2, T)
    c = schedule(c, 2, c.due)
    const [, hard, good, easy] = nextIntervals(c)
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  it('已记住的词忘记后计入遗忘、降低 ease', () => {
    let c = schedule(undefined, 2, T)
    c = schedule(c, 2, c.due)
    const before = c.ease
    c = schedule(c, 0, c.due)
    expect(c.lapses).toBe(1)
    expect(c.ivl).toBe(0)
    expect(c.ease).toBeLessThan(before)
  })

  it('ease 不低于 1.3', () => {
    let c = schedule(undefined, 2, T)
    for (let i = 0; i < 20; i++) c = schedule(schedule(c, 2, T), 0, T)
    expect(c.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('date', () => {
  it('凌晨 4 点前算前一天', () => {
    const night = new Date(2026, 10, 16, 2, 0).getTime()
    const morning = new Date(2026, 10, 16, 9, 0).getTime()
    expect(dayIndex(morning) - dayIndex(night)).toBe(1)
    expect(dayKey(dayIndex(morning))).toBe('2026-11-16')
  })

  it('formatInterval', () => {
    expect(formatInterval(0)).toBe('稍后')
    expect(formatInterval(3)).toBe('3天')
    expect(formatInterval(21)).toBe('3周')
    expect(formatInterval(90)).toBe('3个月')
  })
})

const words: Word[] = Array.from({ length: 30 }, (_, i) => ({
  w: `word${i}`,
  p: '',
  t: [i % 2 ? `n. 名词${i}` : `v. 动词${i}`],
}))

function data(cards: AppData['cards'] = {}, dailyNew = 5): AppData {
  return {
    version: 1,
    meta: { epoch: 0, settingsAt: 0, removed: {} },
    settings: { book: 'cet4', dailyNew, accent: 'us', voice: 'system', autoPlay: false, order: 'freq' },
    cards,
    starred: {},
    wrong: {},
    days: {},
  }
}

describe('session', () => {
  it('按每日目标取新词，扣除今天已学的数量', () => {
    expect(dailyPlan(words, data(), T, 0).news).toHaveLength(5)
    expect(dailyPlan(words, data(), T, 3).news).toHaveLength(2)
    expect(dailyPlan(words, data(), T, 9).news).toHaveLength(0)
    expect(dailyPlan(words, data(), T, 9, 10).news).toHaveLength(10)
  })

  it('只复习到期的词，拖欠久的在前', () => {
    const c = (due: number) => ({ ...schedule(undefined, 2, T), due })
    const plan = dailyPlan(words, data({ word1: c(T + 1), word2: c(T), word3: c(T - 5) }), T, 0)
    expect(plan.reviews.map((w) => w.w)).toEqual(['word3', 'word2'])
    expect(plan.news.map((w) => w.w)).not.toContain('word1')
  })

  it('复习和新词 2:1 交替', () => {
    const q = buildQueue({ reviews: words.slice(0, 4), news: words.slice(10, 13) })
    expect(q.map((i) => (i.isNew ? 'N' : 'R')).join('')).toBe('RRNRRNN')
  })
})

describe('quiz', () => {
  it('选择题有 4 个不重复选项且包含正确答案', () => {
    const qs = buildQuiz(words.slice(0, 10), words, 10, ['en2zh', 'zh2en'])
    expect(qs).toHaveLength(10)
    for (const q of qs) {
      if (q.type === 'spell') continue
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[q.answer]).toBe(q.type === 'en2zh' ? q.word.t[0] : q.word.w)
    }
  })

  it('拼写忽略大小写和首尾空格', () => {
    expect(checkSpelling('  Abandon ', { w: 'abandon', p: '', t: [] })).toBe(true)
    expect(checkSpelling('abandom', { w: 'abandon', p: '', t: [] })).toBe(false)
  })
})
