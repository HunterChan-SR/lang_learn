import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookState } from './books'
import { dayIndex, todayKey } from './date'
import { navigate } from './router'
import { buildQueue, dailyPlan, type QueueItem } from './session'
import { speak } from './speech'
import { nextIntervals } from './srs'
import { getData, getDayLog, gradeWord, toggleStar, useAppData } from './store'
import type { Grade } from './types'

export interface StudyItem extends QueueItem {
  retry?: boolean
}

/** 答“忘记了”的词在几张卡之后再出现一次 */
const RETRY_GAP = 4

/**
 * 背单词的一组学习：队列、翻卡、评分、快捷键。常规界面和代码皮肤共用。
 * autoPlay 为 false 时不自动朗读（代码皮肤默认不出声）。
 */
export function useStudySession(book: BookState, extra: number, opts: { autoPlay: boolean; exitTo?: string }) {
  const data = useAppData()
  const { settings } = data
  const [queue, setQueue] = useState<StudyItem[] | null>(null)
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState([0, 0, 0, 0])
  const [newCount, setNewCount] = useState(0)
  const spokeFirst = useRef(false)
  const autoPlay = opts.autoPlay && settings.autoPlay
  const exitTo = opts.exitTo ?? '/'

  // 进入页面时一次性生成队列，学习过程中不再重新计算
  useEffect(() => {
    if (queue || book.words.length === 0) return
    const d = getData()
    const plan = dailyPlan(book.words, d, dayIndex(), getDayLog(d, todayKey()).learned, extra)
    setQueue(buildQueue(plan))
  }, [book.words, queue, extra])

  const item = queue?.[pos]
  const finished = !!queue && pos >= queue.length

  const say = useCallback((text: string) => speak(text, settings), [settings])

  useEffect(() => {
    if (item && !spokeFirst.current) {
      spokeFirst.current = true
      if (autoPlay) say(item.word.w)
    }
  }, [item, autoPlay, say])

  const reveal = useCallback(() => setRevealed(true), [])

  const grade = useCallback(
    (g: Grade) => {
      if (!queue || !item) return
      gradeWord(item.word.w, g)
      setTally((t) => t.map((n, i) => (i === g ? n + 1 : n)))
      if (item.isNew) setNewCount((n) => n + 1)
      let next = queue
      if (g === 0) {
        next = queue.slice()
        next.splice(Math.min(pos + 1 + RETRY_GAP, next.length), 0, { word: item.word, isNew: false, retry: true })
        setQueue(next)
      }
      setRevealed(false)
      setPos(pos + 1)
      // 在点击事件里直接发音，iOS 才允许播放
      const upcoming = next[pos + 1]
      if (upcoming && autoPlay) say(upcoming.word.w)
    },
    [queue, item, pos, autoPlay, say],
  )

  // 键盘快捷键：空格/回车 显示释义，1-4 评分，R 朗读，S 收藏，Esc 退出
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (e.key === 'Escape') return navigate(exitTo)
      if (!item) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed) reveal()
        else grade(2)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        grade((Number(e.key) - 1) as Grade)
      } else if (e.key === 'r' || e.key === 'R') {
        say(item.word.w)
      } else if (e.key === 's' || e.key === 'S') {
        toggleStar(item.word.w)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, revealed, reveal, grade, say, exitTo])

  const total = queue?.length ?? 0
  const card = item ? data.cards[item.word.w] : undefined
  const intervals = item ? nextIntervals(card) : null

  return { data, queue, pos, item, finished, revealed, reveal, grade, tally, newCount, total, card, intervals, say }
}
