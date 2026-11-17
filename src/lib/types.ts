export type BookId = 'cet4' | 'cet6'

/** 一个词条。t 为释义行（每行一个词性），x 为 ECDICT 的词形变化串 */
export interface Word {
  w: string
  p: string
  t: string[]
  x?: string
}

/** 词库 JSON 中的原始格式：[单词, 音标, 释义(\n 分行), 词形变化?] */
export type RawWord = [string, string, string, string?]

/** 0 忘记 / 1 模糊 / 2 认识 / 3 太简单 */
export type Grade = 0 | 1 | 2 | 3

/** 单词的记忆状态（间隔重复） */
export interface CardState {
  /** 下次复习的日期（dayIndex） */
  due: number
  /** 当前间隔（天），0 表示刚忘记/刚学 */
  ivl: number
  /** 难度系数，越大间隔增长越快 */
  ease: number
  /** 连续答对次数 */
  reps: number
  /** 遗忘次数 */
  lapses: number
  /** 总共复习过几次 */
  seen: number
  /** 首次学习时间戳 */
  first: number
  /** 最近一次复习时间戳 */
  last: number
}

export interface WrongEntry {
  /** 累计答错次数 */
  n: number
  /** 答错后连续答对次数，达到 2 次自动移出错题本 */
  streak: number
  last: number
}

export interface DayLog {
  learned: number
  reviewed: number
  quiz: number
  correct: number
}

export type Accent = 'us' | 'uk'
export type VoiceSource = 'system' | 'youdao'
export type WordOrder = 'freq' | 'alpha' | 'random'

export interface Settings {
  book: BookId
  dailyNew: number
  accent: Accent
  voice: VoiceSource
  autoPlay: boolean
  order: WordOrder
}

/** 多设备同步用的元信息 */
export interface SyncMeta {
  /** 最近一次重置/导入进度的时间。两份数据纪元不同时不合并，较新的一方整体生效 */
  epoch: number
  /** 设置的最近修改时间，合并时以较新的为准 */
  settingsAt: number
  /** 删除记录（墓碑）：'star:单词' / 'wrong:单词' -> 删除时间，防止被其他设备的旧数据“复活” */
  removed: Record<string, number>
}

/** 一次题型练习的成绩（客观题为答对题数，翻译/写作为 AI 评分，满分 15） */
export interface PracticeRecord {
  kind: string
  level: BookId
  /** 题目 id */
  set: string
  title: string
  score: number
  /** 满分；为 0 表示没有评分（如未配置 AI 时的翻译/写作） */
  total: number
  at: number
  /** 用时（秒） */
  secs?: number
}

export interface AppData {
  version: 1
  meta: SyncMeta
  settings: Settings
  /** 以单词为 key，四六级共用同一份记忆状态 */
  cards: Record<string, CardState>
  /** 生词本：单词 -> 加入时间 */
  starred: Record<string, number>
  /** 错题本 */
  wrong: Record<string, WrongEntry>
  /** 每日记录：YYYY-MM-DD -> 统计 */
  days: Record<string, DayLog>
  /** 题型练习记录：记录 id -> 成绩 */
  practice: Record<string, PracticeRecord>
}
