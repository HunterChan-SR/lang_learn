import type { AppData, Word } from './types'

export interface QueueItem {
  word: Word
  isNew: boolean
}

export interface DailyPlan {
  reviews: Word[]
  news: Word[]
}

const MAX_REVIEWS = 200

/** 每日任务完成后“再学一组”最多加多少个新词 */
export const MAX_EXTRA = 500

/** 把填写的数量规整成 1..max 的整数；不是正数时返回 0 */
export function clampCount(raw: string | number | null | undefined, max: number): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0
}

/** 步进到 |delta| 的整数倍：步长 5 时 7 → 10 / 5，结果限制在 1..max */
export function stepCount(n: number, delta: number, max: number): number {
  const s = Math.abs(delta)
  const next = delta > 0 ? Math.floor(n / s) * s + s : Math.ceil(n / s) * s - s
  return Math.max(1, Math.min(max, next))
}

/** 统计今天到期的复习词和还能学的新词 */
export function dailyPlan(words: Word[], data: AppData, today: number, learnedToday: number, extraNew = 0): DailyPlan {
  const reviews: Word[] = []
  const news: Word[] = []
  const newQuota = Math.max(0, data.settings.dailyNew - learnedToday) + extraNew
  for (const w of words) {
    const card = data.cards[w.w]
    if (card) {
      if (card.due <= today) reviews.push(w)
    } else if (news.length < newQuota) {
      news.push(w)
    }
  }
  // 拖欠最久的先复习
  reviews.sort((a, b) => data.cards[a.w].due - data.cards[b.w].due)
  return { reviews: reviews.slice(0, MAX_REVIEWS), news }
}

/** 复习词和新词交替出现：每 2 个复习词插入 1 个新词 */
export function buildQueue(plan: DailyPlan): QueueItem[] {
  const out: QueueItem[] = []
  let r = 0
  let n = 0
  while (r < plan.reviews.length || n < plan.news.length) {
    for (let k = 0; k < 2 && r < plan.reviews.length; k++) out.push({ word: plan.reviews[r++], isNew: false })
    if (n < plan.news.length) out.push({ word: plan.news[n++], isNew: true })
  }
  return out
}

/** 统计词库内各状态的数量 */
export function bookStats(words: Word[], data: AppData, masteredIvl: number) {
  let learned = 0
  let mastered = 0
  for (const w of words) {
    const c = data.cards[w.w]
    if (!c) continue
    learned += 1
    if (c.ivl >= masteredIvl) mastered += 1
  }
  return { total: words.length, learned, mastered }
}
