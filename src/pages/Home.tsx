import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { ProgressRing } from '../components/ProgressRing'
import { BOOKS, bookMeta, type BookState } from '../lib/books'
import { dayIndex, dayKey, weekdayLabel } from '../lib/date'
import { navigate } from '../lib/router'
import { bookStats, dailyPlan } from '../lib/session'
import { MASTERED_IVL } from '../lib/srs'
import { getDayLog, streakDays, updateSettings, useAppData } from '../lib/store'

function isIOSBrowserTab() {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}

export function Home({ book }: { book: BookState }) {
  const data = useAppData()
  const { settings } = data
  const today = dayIndex()
  const log = getDayLog(data, dayKey(today))
  const [showTip, setShowTip] = useState(() => {
    try {
      return isIOSBrowserTab() && localStorage.getItem('tip:a2hs') !== '1'
    } catch {
      return false
    }
  })

  const plan = useMemo(() => dailyPlan(book.words, data, today, log.learned), [book.words, data, today, log.learned])
  const stats = useMemo(() => bookStats(book.words, data, MASTERED_IVL), [book.words, data])
  const streak = streakDays(data, today)
  const remainingNew = stats.total - stats.learned
  const todo = plan.reviews.length + plan.news.length
  const started = log.learned + log.reviewed > 0

  const week = Array.from({ length: 7 }, (_, i) => {
    const idx = today - 6 + i
    const l = getDayLog(data, dayKey(idx))
    return { idx, count: l.learned + l.reviewed }
  })
  const weekMax = Math.max(10, ...week.map((d) => d.count))

  const now = new Date()
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdayLabel(today)}`

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="muted small">{dateText}</div>
          <h1>今天也要加油</h1>
        </div>
        <div className="seg" role="tablist" aria-label="切换词库">
          {BOOKS.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={settings.book === b.id}
              className={settings.book === b.id ? 'on' : ''}
              onClick={() => updateSettings({ book: b.id })}
            >
              {b.short}
            </button>
          ))}
        </div>
      </header>

      {showTip && (
        <div className="tip">
          <Icon name="bulb" size={18} />
          <span>
            在 Safari 中点击 <b>分享</b> → <b>添加到主屏幕</b>，可以像 App 一样全屏使用。
          </span>
          <button
            className="icon-btn sm"
            aria-label="不再提示"
            onClick={() => {
              setShowTip(false)
              try {
                localStorage.setItem('tip:a2hs', '1')
              } catch {
                /* ignore */
              }
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="grid-home">
        <section className="card today">
          <div className="today-ring">
            <ProgressRing value={settings.dailyNew ? log.learned / settings.dailyNew : 0}>
              <strong>{log.learned}</strong>
              <span className="muted small">/ {settings.dailyNew} 新词</span>
            </ProgressRing>
          </div>
          <div className="today-body">
            <h2>今日任务 · {bookMeta(settings.book).short}</h2>
            {book.loading && <p className="muted">词库加载中…</p>}
            {book.error && (
              <p className="error">
                {book.error}{' '}
                <button className="link" onClick={book.retry}>
                  重试
                </button>
              </p>
            )}
            {!book.loading && !book.error && (
              <>
                <div className="today-counts">
                  <div>
                    <strong>{plan.news.length}</strong>
                    <span>待学新词</span>
                  </div>
                  <div>
                    <strong>{plan.reviews.length}</strong>
                    <span>待复习</span>
                  </div>
                  <div>
                    <strong>{log.reviewed}</strong>
                    <span>今日已复习</span>
                  </div>
                </div>
                {todo > 0 ? (
                  <button className="btn primary lg block" onClick={() => navigate('/study')}>
                    {started ? '继续学习' : '开始学习'}
                    <span className="btn-sub">约 {Math.max(1, Math.round(todo * 0.15))} 分钟</span>
                  </button>
                ) : (
                  <div className="done-box">
                    <p>
                      <Icon name="check" size={18} /> 今日任务已完成
                    </p>
                    <div className="row gap-sm wrap">
                      {remainingNew > 0 && (
                        <button className="btn primary" onClick={() => navigate('/study?extra=10')}>
                          再学 10 个
                        </button>
                      )}
                      <button className="btn" onClick={() => navigate('/quiz')}>
                        做个小测验
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="card stat-grid">
          <div className="stat">
            <span className="stat-icon flame">
              <Icon name="flame" size={20} />
            </span>
            <strong>{streak}</strong>
            <span className="muted small">连续打卡（天）</span>
          </div>
          <div className="stat">
            <strong>{stats.learned}</strong>
            <span className="muted small">已学单词</span>
          </div>
          <div className="stat">
            <strong>{stats.mastered}</strong>
            <span className="muted small">已掌握</span>
          </div>
          <div className="stat wide">
            <div className="row between small">
              <span>{bookMeta(settings.book).name}</span>
              <span className="muted">
                {stats.learned} / {stats.total || '—'}
              </span>
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${stats.total ? (stats.learned / stats.total) * 100 : 0}%` }} />
              <div className="bar-fill strong" style={{ width: `${stats.total ? (stats.mastered / stats.total) * 100 : 0}%` }} />
            </div>
            <div className="legend small muted">
              <span>
                <i className="lg-learning" />
                学习中
              </span>
              <span>
                <i className="lg-mastered" />
                已掌握（间隔 ≥ 21 天）
              </span>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>最近 7 天</h3>
          <div className="week" role="img" aria-label="最近 7 天学习量">
            {week.map((d) => (
              <div key={d.idx} className={`week-col${d.idx === today ? ' today' : ''}`}>
                <span className="week-num">{d.count || ''}</span>
                <div className="week-track">
                  <div className="week-bar" style={{ height: `${(d.count / weekMax) * 100}%` }} />
                </div>
                <span className="week-day">{d.idx === today ? '今' : weekdayLabel(d.idx)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card shortcuts">
          <a className="shortcut" href="#/words?f=starred">
            <span className="stat-icon star">
              <Icon name="star" size={20} filled />
            </span>
            <div>
              <strong>生词本</strong>
              <span className="muted small">{Object.keys(data.starred).length} 个单词</span>
            </div>
          </a>
          <a className="shortcut" href="#/quiz?src=wrong">
            <span className="stat-icon wrong">
              <Icon name="quiz" size={20} />
            </span>
            <div>
              <strong>错题本</strong>
              <span className="muted small">{Object.keys(data.wrong).length} 个单词</span>
            </div>
          </a>
        </section>
      </div>
    </div>
  )
}
