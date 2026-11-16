import type { AppData, CardState, DayLog, WrongEntry } from './types'

/** 删除记录保留 90 天，过期后清理 */
const TOMBSTONE_TTL = 90 * 86_400_000

/**
 * 合并两台设备的进度，结果与参数顺序无关：
 * - 纪元（重置/导入时间）不同：较新的一方整体生效
 * - 单词记忆状态：取最近复习过的那份
 * - 生词本/错题本：按时间戳合并，删除记录比添加时间新则视为已删除
 * - 每日统计：各字段取较大值（避免重复同步导致翻倍）
 * - 设置：取最近修改的一方
 */
export function mergeData(a: AppData, b: AppData, now = Date.now()): AppData {
  if (a.meta.epoch !== b.meta.epoch) return a.meta.epoch > b.meta.epoch ? a : b

  const removed: Record<string, number> = {}
  for (const src of [a.meta.removed, b.meta.removed]) {
    for (const [k, t] of Object.entries(src)) {
      if (now - t < TOMBSTONE_TTL && t > (removed[k] ?? 0)) removed[k] = t
    }
  }

  const cards: Record<string, CardState> = {}
  for (const k of keys(a.cards, b.cards)) cards[k] = newerCard(a.cards[k], b.cards[k])

  const starred: Record<string, number> = {}
  for (const k of keys(a.starred, b.starred)) {
    const t = Math.max(a.starred[k] ?? 0, b.starred[k] ?? 0)
    if (t > (removed[`star:${k}`] ?? 0)) starred[k] = t
  }

  const wrong: Record<string, WrongEntry> = {}
  for (const k of keys(a.wrong, b.wrong)) {
    const x = a.wrong[k]
    const y = b.wrong[k]
    const e = !x ? y : !y ? x : y.last > x.last || (y.last === x.last && y.n > x.n) ? y : x
    if (e.last > (removed[`wrong:${k}`] ?? 0)) wrong[k] = e
  }

  const days: Record<string, DayLog> = {}
  for (const k of keys(a.days, b.days)) {
    const x = a.days[k]
    const y = b.days[k]
    days[k] = !x
      ? y
      : !y
        ? x
        : {
            learned: Math.max(x.learned, y.learned),
            reviewed: Math.max(x.reviewed, y.reviewed),
            quiz: Math.max(x.quiz, y.quiz),
            correct: Math.max(x.correct, y.correct),
          }
  }

  const newerSettings = b.meta.settingsAt > a.meta.settingsAt ? b : a
  return {
    version: 1,
    meta: { epoch: a.meta.epoch, settingsAt: newerSettings.meta.settingsAt, removed },
    settings: newerSettings.settings,
    cards,
    starred,
    wrong,
    days,
  }
}

function keys(...objs: Record<string, unknown>[]): Set<string> {
  const s = new Set<string>()
  for (const o of objs) for (const k of Object.keys(o)) s.add(k)
  return s
}

function newerCard(x: CardState | undefined, y: CardState | undefined): CardState {
  if (!x) return y!
  if (!y) return x
  if (y.last !== x.last) return y.last > x.last ? y : x
  return y.seen > x.seen ? y : x
}

/** 键排序后的 JSON，用来判断两份数据是否相同（与属性插入顺序无关） */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k]
      return sorted
    }
    return v
  })
}
