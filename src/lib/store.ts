import { useSyncExternalStore } from 'react'
import { dayIndex, dayKey } from './date'
import { schedule } from './srs'
import type { AppData, DayLog, Grade, Settings } from './types'

/**
 * 本地存储层。目前所有进度保存在 localStorage；
 * 以后接入 Supabase 时，只需要在 persist / load 里加上云端同步即可，页面代码不用改。
 */
const STORAGE_KEY = 'cet-words:v1'

export const DEFAULT_SETTINGS: Settings = {
  book: 'cet4',
  dailyNew: 20,
  accent: 'us',
  voice: 'system',
  autoPlay: true,
  order: 'freq',
}

function emptyData(): AppData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, cards: {}, starred: {}, wrong: {}, days: {} }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 校验并补全数据，导入文件和读取旧版本数据都会走这里 */
export function normalize(raw: unknown): AppData | null {
  if (!isObj(raw) || raw.version !== 1) return null
  const base = emptyData()
  return {
    version: 1,
    settings: { ...base.settings, ...(isObj(raw.settings) ? (raw.settings as Partial<Settings>) : {}) },
    cards: isObj(raw.cards) ? (raw.cards as AppData['cards']) : {},
    starred: isObj(raw.starred) ? (raw.starred as AppData['starred']) : {},
    wrong: isObj(raw.wrong) ? (raw.wrong as AppData['wrong']) : {},
    days: isObj(raw.days) ? (raw.days as AppData['days']) : {},
  }
}

function load(): AppData {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (text) return normalize(JSON.parse(text)) ?? emptyData()
  } catch {
    // 隐私模式等情况下 localStorage 可能不可用，退化为仅内存
  }
  return emptyData()
}

let state: AppData = load()
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function flush() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储失败时忽略（空间不足/隐私模式），数据仍保留在内存中
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

function setState(update: (s: AppData) => AppData) {
  state = update(state)
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 300)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getData(): AppData {
  return state
}

/** 订阅整个数据对象；数据不可变更新，未变化时引用保持不变 */
export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData)
}

export function useSettings(): Settings {
  return useAppData().settings
}

const EMPTY_LOG: DayLog = { learned: 0, reviewed: 0, quiz: 0, correct: 0 }

export function getDayLog(data: AppData, key: string): DayLog {
  return data.days[key] ?? EMPTY_LOG
}

function bumpDay(s: AppData, patch: Partial<DayLog>): AppData['days'] {
  const key = dayKey(dayIndex())
  const cur = s.days[key] ?? EMPTY_LOG
  const next = { ...cur }
  for (const k of Object.keys(patch) as (keyof DayLog)[]) next[k] += patch[k] ?? 0
  return { ...s.days, [key]: next }
}

// ---------------- actions ----------------

export function gradeWord(word: string, grade: Grade) {
  setState((s) => {
    const prev = s.cards[word]
    const card = schedule(prev, grade, dayIndex())
    return {
      ...s,
      cards: { ...s.cards, [word]: card },
      days: bumpDay(s, prev ? { reviewed: 1 } : { learned: 1 }),
    }
  })
}

export function toggleStar(word: string) {
  setState((s) => {
    const starred = { ...s.starred }
    if (starred[word]) delete starred[word]
    else starred[word] = Date.now()
    return { ...s, starred }
  })
}

/** 记录一次测验作答，并维护错题本 */
export function recordAnswer(word: string, correct: boolean) {
  setState((s) => {
    const wrong = { ...s.wrong }
    const cur = wrong[word]
    if (!correct) {
      wrong[word] = { n: (cur?.n ?? 0) + 1, streak: 0, last: Date.now() }
    } else if (cur) {
      // 错题连续答对 2 次后自动移出错题本
      if (cur.streak + 1 >= 2) delete wrong[word]
      else wrong[word] = { ...cur, streak: cur.streak + 1, last: Date.now() }
    }
    return { ...s, wrong, days: bumpDay(s, { quiz: 1, correct: correct ? 1 : 0 }) }
  })
}

export function removeWrong(word: string) {
  setState((s) => {
    const wrong = { ...s.wrong }
    delete wrong[word]
    return { ...s, wrong }
  })
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
}

export function exportData(): string {
  return JSON.stringify(state, null, 2)
}

export function importData(text: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return false
  }
  const next = normalize(parsed)
  if (!next) return false
  setState(() => next)
  flush()
  return true
}

export function resetProgress() {
  setState((s) => ({ ...emptyData(), settings: s.settings }))
  flush()
}

/** 连续打卡天数：从今天（今天还没学则从昨天）往前数 */
export function streakDays(data: AppData, today = dayIndex()): number {
  const active = (idx: number) => {
    const log = data.days[dayKey(idx)]
    return !!log && log.learned + log.reviewed > 0
  }
  let idx = active(today) ? today : today - 1
  let n = 0
  while (active(idx)) {
    n += 1
    idx -= 1
  }
  return n
}
