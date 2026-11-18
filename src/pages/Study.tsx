import { AIButton, AIPanel } from '../components/AICoach'
import { Icon } from '../components/Icon'
import { StudyExtras } from '../components/WordExtras'
import { Exchange, Meanings, Phonetic, SpeakButton, StarButton } from '../components/WordParts'
import type { BookState } from '../lib/books'
import { formatInterval } from '../lib/date'
import { navigate } from '../lib/router'
import type { Grade } from '../lib/types'
import { useStudySession } from '../lib/useStudy'

export const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: 0, label: '忘记了', cls: 'again' },
  { grade: 1, label: '模糊', cls: 'hard' },
  { grade: 2, label: '认识', cls: 'good' },
  { grade: 3, label: '太简单', cls: 'easy' },
]

export function Study({ book, extra }: { book: BookState; extra: number }) {
  const { queue, pos, item, finished, revealed, reveal, grade, tally, newCount, total, intervals } = useStudySession(book, extra, {
    autoPlay: true,
  })

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

      {finished && queue && queue.length > 0 && (
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
              <div className="row gap-sm center wrap">
                <Phonetic p={item.word.p} />
                <SpeakButton text={item.word.w} size="lg" />
                <AIButton word={item.word} onActivate={reveal} />
              </div>
            </div>
            {revealed ? (
              <div className="reveal">
                <Meanings word={item.word} />
                <Exchange word={item.word} />
                <StudyExtras key={item.word.w} word={item.word} />
                <AIPanel word={item.word} />
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
