import { useSyncExternalStore } from 'react'
import { dayIndex, dayKey } from './date'
import { trimPractice } from './merge'
import { schedule } from './srs'
import type { AppData, DayLog, Grade, PracticeRecord, Settings, SyncMeta } from './types'

/**
 * 本地存储层：进度保存在 localStorage。
 * 登录后由 sync.ts 订阅这里的变化，与云端合并同步，页面代码不感知同步的存在。
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

const emptyMeta = (): SyncMeta => ({ epoch: 0, settingsAt: 0, removed: {} })

function emptyData(): AppData {
  return { version: 1, meta: emptyMeta(), settings: { ...DEFAULT_SETTINGS }, cards: {}, starred: {}, wrong: {}, days: {}, practice: {} }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 校验并补全数据，导入文件和读取旧版本数据都会走这里 */
export function normalize(raw: unknown): AppData | null {
  if (!isObj(raw) || raw.version !== 1) return null
  const base = emptyData()
  const meta = isObj(raw.meta) ? (raw.meta as Partial<SyncMeta>) : {}
  return {
    version: 1,
    meta: {
      epoch: typeof meta.epoch === 'number' ? meta.epoch : 0,
      settingsAt: typeof meta.settingsAt === 'number' ? meta.settingsAt : 0,
      removed: isObj(meta.removed) ? (meta.removed as SyncMeta['removed']) : {},
    },
    settings: { ...base.settings, ...(isObj(raw.settings) ? (raw.settings as Partial<Settings>) : {}) },
    cards: isObj(raw.cards) ? (raw.cards as AppData['cards']) : {},
    starred: isObj(raw.starred) ? (raw.starred as AppData['starred']) : {},
    wrong: isObj(raw.wrong) ? (raw.wrong as AppData['wrong']) : {},
    days: isObj(raw.days) ? (raw.days as AppData['days']) : {},
    practice: isObj(raw.practice) ? (raw.practice as AppData['practice']) : {},
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
  return () => {
    listeners.delete(cb)
  }
}

/** 供同步模块监听本地数据变化 */
export const subscribeData = subscribe

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

function tombstone(s: AppData, key: string): SyncMeta {
  return { ...s.meta, removed: { ...s.meta.removed, [key]: Date.now() } }
}

export function toggleStar(word: string) {
  setState((s) => {
    const starred = { ...s.starred }
    if (starred[word]) {
      delete starred[word]
      return { ...s, starred, meta: tombstone(s, `star:${word}`) }
    }
    starred[word] = Date.now()
    return { ...s, starred }
  })
}

/** 记录一次测验作答，并维护错题本 */
export function recordAnswer(word: string, correct: boolean) {
  setState((s) => {
    const wrong = { ...s.wrong }
    const cur = wrong[word]
    let meta = s.meta
    if (!correct) {
      wrong[word] = { n: (cur?.n ?? 0) + 1, streak: 0, last: Date.now() }
    } else if (cur) {
      // 错题连续答对 2 次后自动移出错题本
      if (cur.streak + 1 >= 2) {
        delete wrong[word]
        meta = tombstone(s, `wrong:${word}`)
      } else wrong[word] = { ...cur, streak: cur.streak + 1, last: Date.now() }
    }
    return { ...s, wrong, meta, days: bumpDay(s, { quiz: 1, correct: correct ? 1 : 0 }) }
  })
}

export function recordPractice(rec: PracticeRecord) {
  const id = `${rec.at.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  setState((s) => ({ ...s, practice: trimPractice({ ...s.practice, [id]: rec }) }))
}

export function removeWrong(word: string) {
  setState((s) => {
    const wrong = { ...s.wrong }
    delete wrong[word]
    return { ...s, wrong, meta: tombstone(s, `wrong:${word}`) }
  })
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch }, meta: { ...s.meta, settingsAt: Date.now() } }))
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
  // 导入视为一次“重置”：开启新纪元，同步时整体覆盖云端，而不是与旧进度合并
  const now = Date.now()
  setState(() => ({ ...next, meta: { epoch: now, settingsAt: now, removed: {} } }))
  flush()
  return true
}

export function resetProgress() {
  const now = Date.now()
  setState((s) => ({ ...emptyData(), settings: s.settings, meta: { epoch: now, settingsAt: s.meta.settingsAt, removed: {} } }))
  flush()
}

/** 用同步合并后的数据替换本地数据 */
export function replaceData(next: AppData) {
  setState(() => next)
  flush()
}

/**
 * 退出登录时清空本机进度（云端已保存），避免下一个登录的人继承上一个人的记录。
 * 纪元归零，再次登录时会直接采用云端数据。
 */
export function clearLocalProgress() {
  setState((s) => ({ ...emptyData(), settings: s.settings, meta: { ...emptyMeta(), settingsAt: s.meta.settingsAt } }))
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
