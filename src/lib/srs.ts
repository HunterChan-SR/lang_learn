import type { CardState, Grade } from './types'

/** 间隔达到 21 天视为“已掌握” */
export const MASTERED_IVL = 21
const MIN_EASE = 1.3
const MAX_EASE = 3.0
const MAX_IVL = 365

export type WordStatus = 'new' | 'learning' | 'mastered'

export function wordStatus(card: CardState | undefined): WordStatus {
  if (!card) return 'new'
  return card.ivl >= MASTERED_IVL ? 'mastered' : 'learning'
}

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100))

/**
 * 计算各评分对应的下一次间隔（天）。顺序：[忘记, 模糊, 认识, 太简单]。
 * 简化版 SM-2：
 * - 第一次见到的新词：模糊 1 天 / 认识 2 天 / 太简单 6 天
 * - 刚忘记过（reps=0）：模糊 1 天 / 认识 1 天 / 太简单 4 天
 * - 之后按 ease 系数递增，并保证 模糊 < 认识 < 太简单
 */
export function nextIntervals(prev: CardState | undefined): [number, number, number, number] {
  if (!prev) return [0, 1, 2, 6]
  if (prev.reps === 0) return [0, 1, 1, 4]
  const ivl = Math.max(1, prev.ivl)
  const hard = Math.max(ivl + 1, Math.round(ivl * 1.2))
  const good = Math.max(hard + 1, Math.round(ivl * prev.ease))
  const easy = Math.max(good + 1, Math.round(ivl * prev.ease * 1.3))
  return [0, Math.min(hard, MAX_IVL), Math.min(good, MAX_IVL), Math.min(easy, MAX_IVL)]
}

export function schedule(
  prev: CardState | undefined,
  grade: Grade,
  today: number,
  now = Date.now(),
): CardState {
  const ivl = nextIntervals(prev)[grade]
  const base: CardState = prev
    ? { ...prev }
    : { due: today, ivl: 0, ease: 2.5, reps: 0, lapses: 0, seen: 0, first: now, last: now }

  base.seen += 1
  base.last = now
  base.ivl = ivl
  base.due = today + ivl

  if (grade === 0) {
    // 之前记住过才算一次“遗忘”
    if (prev && prev.reps > 0) base.lapses += 1
    base.reps = 0
    base.ease = clampEase(base.ease - 0.2)
  } else {
    base.reps += 1
    if (grade === 1) base.ease = clampEase(base.ease - 0.15)
    if (grade === 3) base.ease = clampEase(base.ease + 0.15)
  }
  return base
}

export function isDue(card: CardState | undefined, today: number): boolean {
  return !!card && card.due <= today
}
