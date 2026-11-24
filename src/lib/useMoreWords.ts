import { useState } from 'react'
import { navigate } from './router'
import { clampCount, MAX_EXTRA, stepCount } from './session'
import { useAppData } from './store'

/**
 * 每日任务完成后“再学一组新词”：数量可以自己填，默认同设置里的每日新词。
 * remainingNew 为词库里还没学过的词数，填的数量不会超过它。
 */
export function useMoreWords(remainingNew: number) {
  const { settings } = useAppData()
  const max = Math.max(0, Math.min(remainingNew, MAX_EXTRA))
  // null 表示还没改过：跟着设置走（词库加载完、改了每日新词都会更新）
  const [text, setText] = useState<string | null>(null)
  const value = text ?? String(Math.min(settings.dailyNew, max))
  const count = clampCount(value, max)

  return {
    max,
    /** 输入框里的文字 */
    value,
    /** 实际会学的数量，0 表示没填 */
    count,
    setValue: (v: string) => setText(v),
    step: (delta: number) => setText(String(stepCount(count, delta, max))),
    /** 失焦时把输入框改成实际会学的数量 */
    commit: () => setText(count ? String(count) : null),
    /** 开始学；在学习页里调用时传 replace，不多留一条历史记录 */
    start: (replace = false) => {
      // 带上时间戳，保证地址变化：学习页按地址重新生成一组，同样的数量再来一组也能生效
      if (count) navigate(`/study?extra=${count}&t=${Date.now()}`, replace)
    },
  }
}

export type MoreWords = ReturnType<typeof useMoreWords>
