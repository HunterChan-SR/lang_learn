import { useMemo } from 'react'
import { BOOKS, bookMeta, type BookState } from '../lib/books'
import { dayIndex, dayKey, weekdayLabel } from '../lib/date'
import { navigate } from '../lib/router'
import { bookStats, dailyPlan } from '../lib/session'
import { MASTERED_IVL } from '../lib/srs'
import { getDayLog, streakDays, updateSettings, useAppData } from '../lib/store'
import { useMoreWords } from '../lib/useMoreWords'
import { Act, C, Cm, Code, F, K, L, Lens, N, NumInput, S, V } from './Code'

const BARS = '▁▂▃▄▅▆▇█'
const DAILY = [10, 20, 30, 50]

/** 进度条注释：████░░░░ */
export function bar(ratio: number, width = 16): string {
  const n = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** 首页：today.ts */
export function CodeHome({ book }: { book: BookState }) {
  const data = useAppData()
  const { settings } = data
  const today = dayIndex()
  const log = getDayLog(data, dayKey(today))
  const plan = useMemo(() => dailyPlan(book.words, data, today, log.learned), [book.words, data, today, log.learned])
  const stats = useMemo(() => bookStats(book.words, data, MASTERED_IVL), [book.words, data])
  const streak = streakDays(data, today)
  const todo = plan.reviews.length + plan.news.length
  const remainingNew = stats.total - stats.learned
  const more = useMoreWords(remainingNew)
  // 今日任务完成后，study() 多一个可以改的参数：再学几个新词
  const extraMode = todo === 0 && more.max > 0
  const meta = bookMeta(settings.book)

  const week = Array.from({ length: 7 }, (_, i) => {
    const l = getDayLog(data, dayKey(today - 6 + i))
    return l.learned + l.reviewed
  })
  const weekMax = Math.max(10, ...week)
  const spark = week.map((n) => (n ? BARS[Math.min(7, Math.round((n / weekMax) * 7))] : '·')).join(' ')
  const days = Array.from({ length: 7 }, (_, i) => (i === 6 ? '今' : weekdayLabel(today - 6 + i))).join(' ')

  const now = new Date()
  const dateText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 星期${weekdayLabel(today)}`
  const nextBook = BOOKS[(BOOKS.findIndex((b) => b.id === settings.book) + 1) % BOOKS.length]
  const nextDaily = DAILY[(DAILY.indexOf(settings.dailyNew) + 1) % DAILY.length]
  const starred = Object.keys(data.starred).length
  const wrong = Object.keys(data.wrong).length

  return (
    <Code>
      <L>
        <Cm>// {dateText} · 今天也要加油</Cm>
      </L>
      <L>
        <C>import</C> {'{ '}
        <V>session</V>
        {' } '}
        <C>from</C> <S>./session</S>
      </L>
      <L>
        <C>import</C> {'{ '}
        <Act onClick={() => navigate('/words?f=starred')} title="生词本">
          <V>starred</V>
        </Act>
        ,{' '}
        <Act onClick={() => navigate('/words?f=wrong')} title="错题本">
          <V>wrong</V>
        </Act>
        {' } '}
        <C>from</C> <S>../data/words.json</S> <Cm>// 生词本 {starred} · 错题本 {wrong}</Cm>
      </L>
      <L />
      <L>
        <C>export</C> <K>const</K> <V className="t-const">config</V> = {'{'}
      </L>
      <L i={1}>
        <V>book</V>:{' '}
        <Act onClick={() => updateSettings({ book: nextBook.id })} title={`切换到${nextBook.name}`}>
          <S>{settings.book}</S>
        </Act>
        , <Cm>// {meta.name}</Cm>
      </L>
      <L i={1}>
        <V>dailyNew</V>:{' '}
        <Act onClick={() => updateSettings({ dailyNew: nextDaily })} title="每日新词数量">
          <N>{settings.dailyNew}</N>
        </Act>
        , <Cm>// 每日新词</Cm>
      </L>
      <L>
        {'} '}
        <C>as</C> <K>const</K>
      </L>
      <L />
      {book.loading && (
        <L>
          <Cm>// loading {settings.book}.json …</Cm>
        </L>
      )}
      {book.error && (
        <L>
          <Cm>// ✗ {book.error} </Cm>
          <Act onClick={book.retry}>
            <F>retry</F>()
          </Act>
        </L>
      )}
      {!book.loading && !book.error && (
        <>
          <L>
            <C>export</C> <K>const</K> <V className="t-const">today</V> = {'{'}
          </L>
          <L i={1}>
            <V>news</V>: <N>{plan.news.length}</N>, <Cm>// 待学新词</Cm>
          </L>
          <L i={1}>
            <V>reviews</V>: <N>{plan.reviews.length}</N>, <Cm>// 待复习</Cm>
          </L>
          <L i={1}>
            <V>learned</V>: <N>{log.learned}</N>, <Cm>// 今日新词 {log.learned} / {settings.dailyNew}</Cm>
          </L>
          <L i={1}>
            <V>reviewed</V>: <N>{log.reviewed}</N>, <Cm>// 今日已复习</Cm>
          </L>
          <L i={1}>
            <V>streak</V>: <N>{streak}</N>, <Cm>// 连续打卡（天）</Cm>
          </L>
          <L>{'}'}</L>
          <L />
          <L>
            <C>export</C> <K>const</K> <V className="t-const">progress</V> = {'{'}
          </L>
          <L i={1}>
            <V>total</V>: <N>{stats.total}</N>,
          </L>
          <L i={1}>
            <V>learned</V>: <N>{stats.learned}</N>, <Cm>// {bar(stats.total ? stats.learned / stats.total : 0)} {pct(stats.learned, stats.total)}%</Cm>
          </L>
          <L i={1}>
            <V>mastered</V>: <N>{stats.mastered}</N>, <Cm>// {bar(stats.total ? stats.mastered / stats.total : 0)} {pct(stats.mastered, stats.total)}%（间隔 ≥ 21 天）</Cm>
          </L>
          <L>{'}'}</L>
          <L />
          <L>
            <Cm>// {days}</Cm>
          </L>
          <L>
            <C>export</C> <K>const</K> <V className="t-const">week</V> = [{week.map((n, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <N>{n}</N>
              </span>
            ))}] <Cm>// {spark}</Cm>
          </L>
          <L />
          <Lens
            items={
              todo > 0
                ? [
                    { label: 'Run study()', onClick: () => navigate('/study'), title: '开始学习（Esc 返回）' },
                    { label: `${plan.news.length} new · ${plan.reviews.length} review · ~${Math.max(1, Math.round(todo * 0.15))} min` },
                  ]
                : [
                    { label: '✓ all done today' },
                    extraMode && more.count > 0 && { label: `Run study(+${more.count})`, onClick: () => more.start(), title: `再学 ${more.count} 个新词` },
                  ]
            }
          />
          <L>
            <C>export</C> <K>async</K> <K>function</K> <F>study</F>(
            {extraMode && (
              <>
                <V>extra</V> ={' '}
                <NumInput
                  value={more.value}
                  onChange={more.setValue}
                  onStep={more.step}
                  onCommit={more.commit}
                  onEnter={() => more.start()}
                  label={`再学几个新词（1–${more.max}），回车开始`}
                />
              </>
            )}
            ) {'{'}
            {extraMode && (
              <>
                {' '}
                <Cm>// 再学几个新词：改数字，回车开始</Cm>
              </>
            )}
          </L>
          <L i={1}>
            <C>await</C> <V>session</V>.<F>start</F>({'{ '}
            <V>news</V>: {extraMode ? <V>extra</V> : <N>{plan.news.length}</N>}, <V>reviews</V>: <N>{plan.reviews.length}</N>
            {' }'})
          </L>
          <L>{'}'}</L>
          <L />
          <Lens
            items={[
              { label: 'Run quiz()', onClick: () => navigate('/quiz'), title: '单词测验' },
              wrong > 0 && { label: `wrong (${wrong})`, onClick: () => navigate('/quiz?run=1&src=wrong'), title: '错题再练' },
              { label: 'Open practice.md', onClick: () => navigate('/practice'), title: '题型练习' },
            ]}
          />
          <L>
            <C>export</C> <K>function</K> <F>quiz</F>() {'{'}
          </L>
          <L i={1}>
            <C>return</C> <V>session</V>.<F>test</F>({'{ '}
            <V>source</V>: <S>learned</S>
            {' }'})
          </L>
          <L>{'}'}</L>
        </>
      )}
    </Code>
  )
}
