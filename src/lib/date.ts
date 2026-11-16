const DAY_MS = 86_400_000
/** 每天凌晨 4 点才算“新的一天”，熬夜背单词不会被算到第二天 */
const CUTOFF_HOURS = 4

/** 本地日期对应的整数天序号，便于做间隔计算 */
export function dayIndex(ts = Date.now()): number {
  const d = new Date(ts - CUTOFF_HOURS * 3_600_000)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

/** dayIndex -> 'YYYY-MM-DD' */
export function dayKey(idx: number): string {
  return new Date(idx * DAY_MS).toISOString().slice(0, 10)
}

export function todayKey(): string {
  return dayKey(dayIndex())
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayLabel(idx: number): string {
  return WEEKDAYS[new Date(idx * DAY_MS).getUTCDay()]
}

/** 把间隔天数格式化为“3天 / 2周 / 1个月” */
export function formatInterval(days: number): string {
  if (days <= 0) return '稍后'
  if (days < 14) return `${days}天`
  if (days < 60) return `${Math.round(days / 7)}周`
  if (days < 365) return `${Math.round(days / 30)}个月`
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}年`
}

/** 距今天还有几天，用于“下次复习”展示 */
export function formatDue(due: number, today = dayIndex()): string {
  const diff = due - today
  if (diff <= 0) return '今天'
  if (diff === 1) return '明天'
  return `${formatInterval(diff)}后`
}
