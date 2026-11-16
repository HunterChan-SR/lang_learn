import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Exchange, Meanings, Phonetic, SpeakButton, StarButton } from '../components/WordParts'
import type { BookState } from '../lib/books'
import { dayIndex, formatInterval, todayKey } from '../lib/date'
import { navigate } from '../lib/router'
import { buildQueue, dailyPlan, type QueueItem } from '../lib/session'
import { speak } from '../lib/speech'
import { nextIntervals } from '../lib/srs'
import { getData, getDayLog, gradeWord, toggleStar, useAppData } from '../lib/store'
import type { Grade } from '../lib/types'

interface Item extends QueueItem {
  retry?: boolean
}

const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: 0, label: '忘记了', cls: 'again' },
  { grade: 1, label: '模糊', cls: 'hard' },
  { grade: 2, label: '认识', cls: 'good' },
  { grade: 3, label: '太简单', cls: 'easy' },
]

/** 答“忘记了”的词在几张卡之后再出现一次 */
const RETRY_GAP = 4

export function Study({ book, extra }: { book: BookState; extra: number }) {
  const data = useAppData()
  const { settings } = data
  const [queue, setQueue] = useState<Item[] | null>(null)
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState([0, 0, 0, 0])
  const [newCount, setNewCount] = useState(0)
  const spokeFirst = useRef(false)

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
      if (settings.autoPlay) say(item.word.w)
    }
  }, [item, settings.autoPlay, say])

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
      if (upcoming && settings.autoPlay) say(upcoming.word.w)
    },
    [queue, item, pos, settings.autoPlay, say],
  )

  // 键盘快捷键：空格/回车 显示释义，1-4 评分，R 朗读，S 收藏，Esc 退出
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') return navigate('/')
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
  }, [item, revealed, reveal, grade, say])

  const total = queue?.length ?? 0
  const card = item ? data.cards[item.word.w] : undefined
  const intervals = item ? nextIntervals(card) : null

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" aria-label="退出学习" onClick={() => navigate('/')}>
          <Icon name="close" />
        </button>
        <div className="bar thin" aria-hidden="true">
          <div className="bar-fill strong" style={{ width: `${total ? (Math.min(pos, total) / total) * 100 : 0}%` }} />
        </div>
        <span className="muted small nowrap">
          {Math.min(pos, total)} / {total}
        </span>
      </header>

      {book.error && (
        <div className="center-box">
          <p className="error">{book.error}</p>
          <button className="btn" onClick={book.retry}>
            重试
          </button>
        </div>
      )}

      {!queue && !book.error && <div className="center-box muted">准备中…</div>}

      {queue && queue.length === 0 && (
        <div className="center-box">
          <h2>今天没有需要学习的单词</h2>
          <p className="muted">所有到期的单词都复习完了，新词也已达到每日目标。</p>
          <div className="row gap-sm wrap center">
            <button className="btn primary" onClick={() => navigate('/study?extra=10', true)}>
              再学 10 个新词
            </button>
            <button className="btn" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </div>
      )}

      {finished && queue.length > 0 && (
        <div className="center-box finish">
          <div className="finish-badge">
            <Icon name="check" size={36} />
          </div>
          <h2>本组完成！</h2>
          <p className="muted">
            共 {pos} 张卡片，其中新词 {newCount} 个
          </p>
          <div className="finish-tally">
            {GRADES.map((g) => (
              <div key={g.grade} className={`tally ${g.cls}`}>
                <strong>{tally[g.grade]}</strong>
                <span>{g.label}</span>
              </div>
            ))}
          </div>
          <div className="row gap-sm wrap center">
            <button className="btn primary" onClick={() => navigate('/quiz?src=today&run=1')}>
              测一测今天的单词
            </button>
            <button className="btn" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </div>
      )}

      {item && (
        <>
          <div
            className={`study-card${revealed ? ' revealed' : ''}`}
            onClick={() => !revealed && reveal()}
            role={revealed ? undefined : 'button'}
            aria-label={revealed ? undefined : '显示释义'}
          >
            <div className="study-card-top">
              <span className={`tag ${item.isNew ? 'new' : item.retry ? 'retry' : 'review'}`}>
                {item.isNew ? '新词' : item.retry ? '再记一次' : '复习'}
              </span>
              <StarButton word={item.word.w} />
            </div>
            <div className="study-word-wrap">
              <h1 className="big-word" lang="en">
                {item.word.w}
              </h1>
              <div className="row gap-sm center">
                <Phonetic p={item.word.p} />
                <SpeakButton text={item.word.w} size="lg" />
              </div>
            </div>
            {revealed ? (
              <div className="reveal">
                <Meanings word={item.word} />
                <Exchange word={item.word} />
              </div>
            ) : (
              <p className="hint">先在心里回想它的意思，再点击查看</p>
            )}
          </div>

          <footer className="study-actions">
            {!revealed ? (
              <button className="btn primary lg block" onClick={reveal}>
                查看释义 <kbd>空格</kbd>
              </button>
            ) : (
              <div className="grades">
                {GRADES.map((g) => (
                  <button key={g.grade} className={`grade ${g.cls}`} onClick={() => grade(g.grade)}>
                    <span>{g.label}</span>
                    <small>
                      {intervals && formatInterval(intervals[g.grade])}
                      <kbd>{g.grade + 1}</kbd>
                    </small>
                  </button>
                ))}
              </div>
            )}
          </footer>
        </>
      )}
    </div>
  )
}
