import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Meanings, Phonetic, SpeakButton } from '../components/WordParts'
import { WordSheet } from '../components/WordSheet'
import { bookMeta, useAllWords, type BookState } from '../lib/books'
import { QUIZ_TYPE_LABELS, type Question, type QuizType } from '../lib/quiz'
import { navigate } from '../lib/router'
import { useAppData } from '../lib/store'
import type { Word } from '../lib/types'
import {
  ALL_TYPES,
  COUNTS,
  DEFAULT_TYPES,
  pickPool,
  quizParams,
  quizUrl,
  SOURCES,
  useQuizPlay,
  useQuizQuestions,
  type Source,
} from '../lib/useQuiz'

export function Quiz({ book, query }: { book: BookState; query: URLSearchParams }) {
  const all = useAllWords()
  const { src, count, types, run } = quizParams(query)

  if (!all || book.loading) return <div className="page center-box muted">词库加载中…</div>
  if (run) return <QuizRun key={query.toString()} src={src} count={count} types={types} all={all} book={book.words} />
  return <QuizSetup initialSrc={src} all={all} book={book} />
}

function QuizSetup({ initialSrc, all, book }: { initialSrc: Source; all: Map<string, Word>; book: BookState }) {
  const data = useAppData()
  const [src, setSrc] = useState<Source>(initialSrc)
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuizType[]>(DEFAULT_TYPES)
  const sizes = useMemo(
    () => Object.fromEntries(SOURCES.map((s) => [s.id, pickPool(s.id, data, all, book.words).length])) as Record<Source, number>,
    [data, all, book.words],
  )

  const toggleType = (t: QuizType) =>
    setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]))

  const start = () => navigate(quizUrl(src, count, types))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="muted small">当前词库：{bookMeta(data.settings.book).name}</div>
          <h1>单词测验</h1>
        </div>
      </header>

      <section className="card">
        <h3>题目来源</h3>
        <div className="choice-grid">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              className={`choice${src === s.id ? ' on' : ''}`}
              disabled={sizes[s.id] === 0}
              onClick={() => setSrc(s.id)}
            >
              <strong>
                {s.label}
                <span className="count">{sizes[s.id]}</span>
              </strong>
              <span className="muted small">{s.desc}</span>
            </button>
          ))}
        </div>
        {sizes[src] === 0 && <p className="muted small">这里还没有单词，先去学习一会儿吧。</p>}
      </section>

      <section className="card">
        <h3>题型</h3>
        <div className="row gap-sm wrap">
          {ALL_TYPES.map((t) => (
            <button key={t} className={`chip${types.includes(t) ? ' on' : ''}`} aria-pressed={types.includes(t)} onClick={() => toggleType(t)}>
              {types.includes(t) && <Icon name="check" size={16} />}
              {QUIZ_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <h3 className="mt">题量</h3>
        <div className="seg">
          {COUNTS.map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} 题
            </button>
          ))}
        </div>
      </section>

      <button className="btn primary lg block" disabled={sizes[src] === 0} onClick={start}>
        开始测验
      </button>
    </div>
  )
}

interface RunProps {
  src: Source
  count: number
  types: QuizType[]
  all: Map<string, Word>
  book: Word[]
}

function QuizRun(props: RunProps) {
  const questions = useQuizQuestions(props.src, props.count, props.types, props.all, props.book)
  if (!questions) return <div className="study center-box muted">出题中…</div>
  return <QuizPlay {...props} questions={questions} />
}

function QuizPlay({ src, count, types, questions }: RunProps & { questions: Question[] }) {
  const [detail, setDetail] = useState<Word | null>(null)
  const { q, idx, answers, answered, done, picked, choose, spelling, setSpelling, hint, addHint, submitSpelling, next, correctCount, lastCorrect, inputRef, say } =
    useQuizPlay(questions, { autoPlay: true })

  if (questions.length === 0) {
    return (
      <div className="study">
        <div className="center-box">
          <h2>没有可以出题的单词</h2>
          <p className="muted">换一个题目来源试试，或者先去学习一些新词。</p>
          <button className="btn primary" onClick={() => navigate('/quiz', true)}>
            返回
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    const wrongs = answers.filter((a) => !a.correct)
    const rate = Math.round((correctCount / questions.length) * 100)
    return (
      <div className="study">
        <div className="center-box finish">
          <div className={`score ${rate >= 80 ? 'good' : rate >= 60 ? 'ok' : 'low'}`}>
            <strong>{rate}</strong>
            <span>分</span>
          </div>
          <h2>{rate >= 90 ? '太棒了！' : rate >= 60 ? '不错，继续保持' : '再接再厉'}</h2>
          <p className="muted">
            答对 {correctCount} / {questions.length} 题
          </p>
          {wrongs.length > 0 && (
            <div className="wrong-list">
              <h3>答错的单词（已加入错题本）</h3>
              {wrongs.map((a) => (
                <button key={a.word.w} className="wrong-item" onClick={() => setDetail(a.word)}>
                  <strong>{a.word.w}</strong>
                  <span className="muted ellipsis">{a.word.t[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="row gap-sm wrap center">
            {wrongs.length > 0 && (
              <button className="btn primary" onClick={() => navigate(quizUrl('wrong', count, types), true)}>
                错题再练
              </button>
            )}
            <button className="btn" onClick={() => navigate(`/quiz?src=${src}`)}>
              再来一组
            </button>
            <button className="btn" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </div>
        {detail && <WordSheet word={detail} onClose={() => setDetail(null)} />}
      </div>
    )
  }

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" aria-label="退出测验" onClick={() => navigate('/quiz')}>
          <Icon name="close" />
        </button>
        <div className="bar thin" aria-hidden="true">
          <div className="bar-fill strong" style={{ width: `${(idx / questions.length) * 100}%` }} />
        </div>
        <span className="muted small nowrap">
          {idx + 1} / {questions.length}
        </span>
      </header>

      <div className="quiz-card">
        <span className="tag review">{QUIZ_TYPE_LABELS[q.type]}</span>

        {q.type === 'en2zh' && (
          <div className="study-word-wrap">
            <h1 className="big-word" lang="en">
              {q.word.w}
            </h1>
            <div className="row gap-sm center">
              <Phonetic p={q.word.p} />
              <SpeakButton text={q.word.w} size="lg" />
            </div>
          </div>
        )}

        {q.type === 'zh2en' && (
          <div className="quiz-prompt">
            <Meanings word={q.word} />
          </div>
        )}

        {q.type === 'spell' && (
          <div className="quiz-prompt">
            <Meanings word={q.word} />
            <div className="row gap-sm center">
              <SpeakButton text={q.word.w} size="lg" />
              <span className="muted small">听发音，拼出这个单词</span>
            </div>
          </div>
        )}

        {q.type === 'listen' && (
          <div className="study-word-wrap">
            <button type="button" className="listen-btn" aria-label="再听一遍" onClick={() => say(q.word.w)}>
              <Icon name="speaker" size={40} />
            </button>
            <span className="muted small">听发音，拼出这个单词（点击可重听）</span>
          </div>
        )}

        {q.type === 'cloze' && (
          <div className="quiz-prompt">
            <p className="cloze-sentence" lang="en">
              {q.parts.map(([t, blank], i) =>
                blank ? (
                  answered ? (
                    <mark key={i}>{t}</mark>
                  ) : (
                    <span key={i} className="blank" aria-label="空格">
                      {'\u00a0'.repeat(Math.max(6, t.length))}
                    </span>
                  )
                ) : (
                  <span key={i}>{t}</span>
                ),
              )}
            </p>
            <p className="muted small">{q.zh}</p>
            <p className="muted small">选出空格处的单词（句中可能是它的变化形式）</p>
          </div>
        )}
      </div>

      <footer className="study-actions">
        {'options' in q ? (
          <div className="options">
            {q.options.map((opt, i) => {
              let cls = 'option'
              if (answered && i === q.answer) cls += ' correct'
              else if (answered && i === picked) cls += ' wrong'
              return (
                <button key={i} className={cls} disabled={answered} onClick={() => choose(i)} lang={q.type === 'en2zh' ? undefined : 'en'}>
                  <kbd>{i + 1}</kbd>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <form
            className="spell"
            onSubmit={(e) => {
              e.preventDefault()
              // 已作答时回车由全局快捷键处理“下一题”
              submitSpelling()
            }}
          >
            <div className="spell-hint" aria-label={`共 ${q.word.w.length} 个字母`}>
              {q.word.w.split('').map((ch, i) => (
                <span key={i} className={ch === ' ' ? 'space' : ''}>
                  {answered || i < hint ? ch : ch === ' ' || ch === '-' ? ch : ''}
                </span>
              ))}
            </div>
            <input
              ref={inputRef}
              className={`spell-input${lastCorrect === true ? ' correct' : lastCorrect === false ? ' wrong' : ''}`}
              value={spelling}
              onChange={(e) => setSpelling(e.target.value)}
              readOnly={answered}
              placeholder="输入单词"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              lang="en"
            />
            {!answered && (
              <div className="row gap-sm">
                <button type="button" className="btn" disabled={hint >= q.word.w.length - 1} onClick={addHint}>
                  提示一个字母
                </button>
                <button type="submit" className="btn primary grow" disabled={!spelling.trim()}>
                  提交
                </button>
              </div>
            )}
          </form>
        )}

        {answered && (
          <div className={`feedback ${lastCorrect ? 'ok' : 'bad'}`}>
            <div className="feedback-main">
              <strong>{lastCorrect ? '回答正确' : '回答错误'}</strong>
              <span>
                <b lang="en">{q.word.w}</b> <Phonetic p={q.word.p} />
              </span>
              <span className="muted small ellipsis">{q.word.t.slice(0, 2).join('；')}</span>
            </div>
            {!lastCorrect && (
              <button className="btn primary" onClick={next}>
                下一题 <kbd>↵</kbd>
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  )
}
