import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Meanings, Phonetic, SpeakButton } from '../components/WordParts'
import { WordSheet } from '../components/WordSheet'
import { bookMeta, useAllWords, type BookState } from '../lib/books'
import { dayIndex } from '../lib/date'
import { buildQuiz, checkSpelling, QUIZ_TYPE_LABELS, type Question, type QuizType } from '../lib/quiz'
import { navigate } from '../lib/router'
import { speak } from '../lib/speech'
import { getData, recordAnswer, useAppData } from '../lib/store'
import type { AppData, Word } from '../lib/types'

type Source = 'today' | 'learned' | 'starred' | 'wrong' | 'book'

const SOURCES: { id: Source; label: string; desc: string }[] = [
  { id: 'today', label: '今日单词', desc: '今天学过和复习过的' },
  { id: 'learned', label: '已学单词', desc: '所有学过的单词' },
  { id: 'wrong', label: '错题本', desc: '连续答对 2 次自动移出' },
  { id: 'starred', label: '生词本', desc: '手动收藏的单词' },
  { id: 'book', label: '整个词库', desc: '随机抽查，含未学的词' },
]

const ALL_TYPES: QuizType[] = ['en2zh', 'zh2en', 'spell']
const COUNTS = [10, 20, 30]

function pickPool(src: Source, data: AppData, all: Map<string, Word>, book: Word[]): Word[] {
  const today = dayIndex()
  const fromKeys = (keys: string[]) => keys.map((k) => all.get(k)).filter((w): w is Word => !!w)
  switch (src) {
    case 'today':
      return fromKeys(Object.keys(data.cards).filter((k) => dayIndex(data.cards[k].last) === today))
    case 'learned':
      return fromKeys(Object.keys(data.cards))
    case 'starred':
      return fromKeys(Object.keys(data.starred))
    case 'wrong':
      return fromKeys(Object.keys(data.wrong))
    case 'book':
      return book
  }
}

const isSource = (s: string | null): s is Source => SOURCES.some((x) => x.id === s)

export function Quiz({ book, query }: { book: BookState; query: URLSearchParams }) {
  const all = useAllWords()
  const src: Source = isSource(query.get('src')) ? (query.get('src') as Source) : 'learned'
  const count = Number(query.get('n')) || 10
  const types = (query.get('t')?.split(',').filter((t): t is QuizType => ALL_TYPES.includes(t as QuizType)) ?? ALL_TYPES)
  const run = query.get('run') === '1'

  if (!all || book.loading) return <div className="page center-box muted">词库加载中…</div>
  if (run) return <QuizRun key={query.toString()} src={src} count={count} types={types.length ? types : ALL_TYPES} all={all} book={book.words} />
  return <QuizSetup initialSrc={src} all={all} book={book} />
}

function QuizSetup({ initialSrc, all, book }: { initialSrc: Source; all: Map<string, Word>; book: BookState }) {
  const data = useAppData()
  const [src, setSrc] = useState<Source>(initialSrc)
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuizType[]>(ALL_TYPES)
  const sizes = useMemo(
    () => Object.fromEntries(SOURCES.map((s) => [s.id, pickPool(s.id, data, all, book.words).length])) as Record<Source, number>,
    [data, all, book.words],
  )

  const toggleType = (t: QuizType) =>
    setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]))

  const start = () => navigate(`/quiz?run=1&src=${src}&n=${count}&t=${types.join(',')}`)

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

interface Answer {
  word: Word
  correct: boolean
}

function QuizRun({ src, count, types, all, book }: { src: Source; count: number; types: QuizType[]; all: Map<string, Word>; book: Word[] }) {
  const settings = useAppData().settings
  // 题目只在进入时生成一次；干扰项从当前词库里挑
  const [questions] = useState<Question[]>(() =>
    buildQuiz(pickPool(src, getData(), all, book), book.length ? book : [...all.values()], count, types),
  )
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [spelling, setSpelling] = useState('')
  const [hint, setHint] = useState(0)
  const [detail, setDetail] = useState<Word | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const spokeFirst = useRef(false)

  const q = questions[idx]
  const answered = answers.length > idx
  const done = idx >= questions.length
  const say = useCallback((w: string) => speak(w, settings), [settings])
  const wantsAudio = (question: Question | undefined) => !!question && question.type !== 'zh2en' && settings.autoPlay

  useEffect(() => {
    if (!spokeFirst.current && q) {
      spokeFirst.current = true
      if (wantsAudio(q)) say(q.word.w)
    }
  })

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  useEffect(() => {
    if (q?.type === 'spell' && !answered) inputRef.current?.focus()
  }, [q, answered])

  const next = useCallback(() => {
    clearTimeout(advanceTimer.current)
    setIdx((i) => i + 1)
    setPicked(null)
    setSpelling('')
    setHint(0)
    const upcoming = questions[idx + 1]
    if (wantsAudio(upcoming)) say(upcoming.word.w)
  }, [idx, questions, say, settings.autoPlay])

  const submit = useCallback(
    (correct: boolean) => {
      if (!q || answered) return
      recordAnswer(q.word.w, correct)
      setAnswers((a) => [...a, { word: q.word, correct }])
      if (q.type === 'zh2en') say(q.word.w)
      if (correct) advanceTimer.current = setTimeout(next, q.type === 'spell' ? 900 : 700)
    },
    [q, answered, next, say],
  )

  const choose = (i: number) => {
    if (!q || q.type === 'spell' || answered) return
    setPicked(i)
    submit(i === q.answer)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !q) return
      if (e.key === 'Escape') return navigate('/quiz')
      if (answered && e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (!answered && q.type !== 'spell' && ['1', '2', '3', '4'].includes(e.key)) {
        choose(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  const correctCount = answers.filter((a) => a.correct).length

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
              <button className="btn primary" onClick={() => navigate(`/quiz?run=1&src=wrong&n=${count}&t=${types.join(',')}`, true)}>
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

  const lastCorrect = answered ? answers[idx].correct : null

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
      </div>

      <footer className="study-actions">
        {q.type !== 'spell' ? (
          <div className="options">
            {q.options.map((opt, i) => {
              let cls = 'option'
              if (answered && i === q.answer) cls += ' correct'
              else if (answered && i === picked) cls += ' wrong'
              return (
                <button key={i} className={cls} disabled={answered} onClick={() => choose(i)} lang={q.type === 'zh2en' ? 'en' : undefined}>
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
              if (!answered && spelling.trim()) submit(checkSpelling(spelling, q.word))
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
                <button type="button" className="btn" disabled={hint >= q.word.w.length - 1} onClick={() => setHint((h) => h + 1)}>
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
