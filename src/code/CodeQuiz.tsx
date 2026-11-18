import { useMemo, useState } from 'react'
import { WordSheet } from '../components/WordSheet'
import { splitPos, useAllWords, type BookState } from '../lib/books'
import { QUIZ_TYPE_LABELS, type Question, type QuizType } from '../lib/quiz'
import { navigate } from '../lib/router'
import { useAppData } from '../lib/store'
import type { Word } from '../lib/types'
import {
  ALL_TYPES,
  COUNTS,
  pickPool,
  quizParams,
  quizUrl,
  SOURCES,
  useQuizPlay,
  useQuizQuestions,
  type Source,
} from '../lib/useQuiz'
import { pct } from './CodeHome'
import { Act, C, Cm, Code, F, Ghost, K, L, Lens, N, S, V } from './Code'

export function CodeQuiz({ book, query }: { book: BookState; query: URLSearchParams }) {
  const all = useAllWords()
  const { src, count, types, run } = quizParams(query)
  if (!all || book.loading) {
    return (
      <Code>
        <L>
          <Cm>// loading…</Cm>
        </L>
      </Code>
    )
  }
  if (run) return <QuizRun key={query.toString()} src={src} count={count} types={types} all={all} book={book.words} />
  return <QuizConfig initialSrc={src} all={all} book={book.words} />
}

/** 测验设置：quiz.config.ts */
function QuizConfig({ initialSrc, all, book }: { initialSrc: Source; all: Map<string, Word>; book: Word[] }) {
  const data = useAppData()
  const [src, setSrc] = useState<Source>(initialSrc)
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<QuizType[]>(['en2zh', 'zh2en', 'cloze', 'spell'])
  const sizes = useMemo(
    () => Object.fromEntries(SOURCES.map((s) => [s.id, pickPool(s.id, data, all, book).length])) as Record<Source, number>,
    [data, all, book],
  )
  const toggle = (t: QuizType) => setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]))
  const ready = sizes[src] > 0
  const start = () => ready && navigate(quizUrl(src, count, types))

  return (
    <Code>
      <L>
        <C>import</C> {'{ '}
        <F>defineConfig</F>
        {' } '}
        <C>from</C> <S>vitest/config</S>
      </L>
      <L />
      <Lens
        items={[
          ready ? { label: `Run tests (${Math.min(count, sizes[src])})`, onClick: start, title: '开始测验' } : { label: '⚠ no words in this source' },
          { label: 'today.ts', onClick: () => navigate('/') },
        ]}
      />
      <L>
        <C>export</C> <C>default</C> <F>defineConfig</F>({'{'}
      </L>
      <L i={1}>
        <V>test</V>: {'{'}
      </L>
      <L i={2}>
        <V>source</V>: <S>{src}</S>, <Cm>// {SOURCES.find((s) => s.id === src)?.label} · {sizes[src]} 个</Cm>
      </L>
      <L i={2}>
        <Cm>
          {'// '}
          {SOURCES.map((s, k) => (
            <span key={s.id}>
              {k > 0 && ' · '}
              {sizes[s.id] > 0 ? (
                <Act onClick={() => setSrc(s.id)} className={s.id === src ? 'on' : ''} title={s.desc}>
                  {s.id} {sizes[s.id]}
                </Act>
              ) : (
                <span className="cx-off">
                  {s.id} 0
                </span>
              )}
            </span>
          ))}
        </Cm>
      </L>
      <L i={2}>
        <V>types</V>: [
        {types.map((t, k) => (
          <span key={t}>
            {k > 0 && ', '}
            <S>{t}</S>
          </span>
        ))}
        ],
      </L>
      <L i={2}>
        <Cm>
          {'// '}
          {ALL_TYPES.map((t, k) => (
            <span key={t}>
              {k > 0 && ' · '}
              <Act onClick={() => toggle(t)} className={types.includes(t) ? 'on' : ''} title="点击加入或移除这种题型">
                {types.includes(t) ? '☑' : '☐'} {t} {QUIZ_TYPE_LABELS[t]}
              </Act>
            </span>
          ))}
        </Cm>
      </L>
      <L i={2}>
        <V>count</V>: <N>{count}</N>,{' '}
        <Cm>
          {'// '}
          {COUNTS.map((n, k) => (
            <span key={n}>
              {k > 0 && ' · '}
              <Act onClick={() => setCount(n)} className={n === count ? 'on' : ''}>
                {n}
              </Act>
            </span>
          ))}
        </Cm>
      </L>
      <L i={1}>{'},'}</L>
      <L>{'})'}</L>
    </Code>
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
  if (!questions) {
    return (
      <Code>
        <L>
          <Cm>// collecting tests…</Cm>
        </L>
      </Code>
    )
  }
  return <QuizPlay {...props} questions={questions} />
}

const DESCRIBE: Record<QuizType, string> = {
  en2zh: 'meaning',
  zh2en: 'word',
  cloze: 'fill',
  spell: 'spell',
  listen: 'listen',
}

/** 测验：quiz.test.ts */
function QuizPlay({ src, count, types, questions }: RunProps & { questions: Question[] }) {
  const [detail, setDetail] = useState<Word | null>(null)
  const p = useQuizPlay(questions, { autoPlay: false })
  const { q, idx, answered, lastCorrect } = p

  const header = (
    <>
      <L>
        <C>import</C> {'{ '}
        <V>describe</V>, <V>expect</V>, <V>it</V>
        {' } '}
        <C>from</C> <S>vitest</S>
      </L>
      <L />
    </>
  )

  if (questions.length === 0) {
    return (
      <Code>
        {header}
        <L>
          <Cm>// No test files found：换一个题目来源试试，或者先去学习一些新词</Cm>
        </L>
        <Lens items={[{ label: 'quiz.config.ts', onClick: () => navigate('/quiz', true) }]} />
        <L>
          <C>export</C> {'{}'}
        </L>
      </Code>
    )
  }

  if (p.done) {
    const failed = p.answers.filter((a) => !a.correct)
    const passed = p.correctCount
    return (
      <Code>
        <L>
          <Cm>/*</Cm>
        </L>
        <L mark={failed.length ? 'fail' : 'pass'}>
          <Cm>
            {' '}Test Files  {failed.length ? '1 failed' : '1 passed'} (1)
          </Cm>
        </L>
        <L>
          <Cm>
            {'      '}Tests  {passed} passed{failed.length ? ` | ${failed.length} failed` : ''} ({questions.length}) · {pct(passed, questions.length)}%
          </Cm>
        </L>
        <L>
          <Cm>{' */'}</Cm>
        </L>
        <L />
        <Lens
          items={[
            failed.length > 0 && { label: 'Re-run failed', onClick: () => navigate(quizUrl('wrong', count, types), true), title: '错题再练（已加入错题本）' },
            { label: 'Run again', onClick: () => navigate(`/quiz?src=${src}`), title: '再来一组' },
            { label: 'today.ts', onClick: () => navigate('/') },
          ]}
        />
        <L>
          <C>export</C> <K>const</K> <V className="t-const">failed</V> = [{failed.length === 0 && ']'}
        </L>
        {failed.map((a) => (
          <L key={a.word.w} i={1} mark="fail" onClick={() => setDetail(a.word)} className="cx-row" title="查看详情">
            <S>{a.word.w}</S>, <Cm>// {a.word.t[0]}</Cm>
          </L>
        ))}
        {failed.length > 0 && <L>]</L>}
        {detail && <WordSheet word={detail} onClose={() => setDetail(null)} />}
      </Code>
    )
  }

  const opts = 'options' in q ? q.options : null
  const mark = answered ? (lastCorrect ? 'pass' : 'fail') : null
  const answerExpr = opts ? (
    <>
      <V>options</V>[{answered && p.picked != null ? <N>{p.picked}</N> : <Ghost>1-4</Ghost>}]
    </>
  ) : (
    <SpellInput p={p} word={q.word} />
  )

  return (
    <Code>
      {header}
      <Lens
        items={[
          { label: `${idx + 1}/${questions.length}`, title: '进度' },
          { label: `✓ ${p.correctCount}` },
          { label: 'speak (R)', onClick: () => p.say(q.word.w), title: '朗读' },
          { label: 'stop (Esc)', onClick: () => navigate('/quiz') },
        ]}
      />
      <L mark="run">
        <F>describe</F>(<S>{QUIZ_TYPE_LABELS[q.type]}</S>, () ={'>'} {'{'}
      </L>
      <L i={1} mark={mark}>
        <F>it</F>(<S>{q.type === 'en2zh' || answered ? q.word.w : `#${idx + 1}`}</S>, () ={'>'} {'{'}
      </L>
      <Prompt q={q} answered={answered} say={p.say} />
      {opts && (
        <>
          <L i={2}>
            <K>const</K> <V className="t-const">options</V> = [
          </L>
          {opts.map((o, i) => {
            const correct = answered && i === (q as { answer: number }).answer
            const wrongPick = answered && i === p.picked && !lastCorrect
            return (
              <L
                key={i}
                i={3}
                mark={correct ? 'pass' : wrongPick ? 'fail' : null}
                onClick={answered ? undefined : () => p.choose(i)}
                className={`cx-row${wrongPick ? ' cx-strike' : ''}`}
                title={answered ? undefined : `选择（${i + 1}）`}
              >
                <S>{o}</S>, <Cm>// {i + 1}</Cm>
              </L>
            )
          })}
          <L i={2}>]</L>
        </>
      )}
      <L i={2} mark={mark}>
        <F>expect</F>(<F>{DESCRIBE[q.type]}</F>({q.type === 'en2zh' ? <S>{q.word.w}</S> : q.type === 'listen' ? <V>audio</V> : <V>{q.type === 'cloze' ? 'sentence' : 'meaning'}</V>})).<F>toBe</F>({answerExpr})
      </L>
      {answered && !lastCorrect && (
        <>
          <L i={2} className="cx-err-line">
            <Cm>// </Cm>
            <span className="t-err">AssertionError: expected '{q.word.w}'</span> <Cm>— {q.word.t.slice(0, 2).join('；')}</Cm>
          </L>
        </>
      )}
      {answered && (
        <Lens
          i={2}
          items={[
            { label: lastCorrect ? '✓ passed' : 'Next (Enter)', onClick: lastCorrect ? undefined : p.next, title: '下一题' },
            { label: q.word.w, onClick: () => setDetail(q.word), title: '查看详情' },
          ]}
        />
      )}
      <L i={1}>{'})'}</L>
      <L>{'})'}</L>
      {detail && <WordSheet word={detail} onClose={() => setDetail(null)} />}
    </Code>
  )
}

/** 题干：每种题型写成不同的常量 */
function Prompt({ q, answered, say }: { q: Question; answered: boolean; say: (t: string) => void }) {
  if (q.type === 'en2zh') {
    return q.word.p ? (
      <L i={2}>
        <Cm>
          {'// '}
          <Act onClick={() => say(q.word.w)} title="朗读">
            /{q.word.p}/
          </Act>
        </Cm>
      </L>
    ) : null
  }
  if (q.type === 'zh2en' || q.type === 'spell') {
    return (
      <>
        <L i={2}>
          <K>const</K> <V className="t-const">meaning</V> = [
        </L>
        {q.word.t.map((line, k) => {
          const [pos, text] = splitPos(line)
          return (
            <L key={k} i={3}>
              <S>
                {pos && <span className="t-pos">{pos} </span>}
                {text}
              </S>
              ,
            </L>
          )
        })}
        <L i={2}>]</L>
      </>
    )
  }
  if (q.type === 'listen') {
    return (
      <L i={2}>
        <K>const</K> <V className="t-const">audio</V> = <F>tts</F>(
        <Act onClick={() => say(q.word.w)} title="播放（R）">
          <Ghost>▶ play</Ghost>
        </Act>
        )
      </L>
    )
  }
  if (q.type !== 'cloze') return null
  return (
    <L i={2}>
      <K>const</K> <V className="t-const">sentence</V> ={' '}
      <S q={'"'}>
        {q.parts.map(([t, blank], k) => (blank ? answered ? <mark key={k} className="cx-hit">{t}</mark> : <span key={k}>____</span> : <span key={k}>{t}</span>))}
      </S>{' '}
      <Cm>// {q.zh}</Cm>
    </L>
  )
}

function SpellInput({ p, word }: { p: ReturnType<typeof useQuizPlay>; word: Word }) {
  const hintText = word.w
    .split('')
    .map((ch, i) => (i < p.hint || ch === ' ' || ch === '-' ? ch : '_'))
    .join('')
  const width = Math.max(word.w.length, p.spelling.length, 4) + 1
  return (
    <span className="t-s cx-spell">
      '
      <form
        className="cx-inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          p.submitSpelling()
        }}
      >
        <input
          ref={p.inputRef}
          className={`cx-input${p.lastCorrect === false ? ' bad' : ''}`}
          style={{ width: `${width}ch` }}
          value={p.spelling}
          onChange={(e) => p.setSpelling(e.target.value)}
          readOnly={p.answered}
          placeholder={p.answered ? '' : hintText}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          lang="en"
          aria-label="拼写"
        />
      </form>
      '
      {!p.answered && p.hint < word.w.length - 1 && (
        <>
          {' '}
          <Act onClick={p.addHint} title="提示一个字母">
            <Ghost>// hint</Ghost>
          </Act>
        </>
      )}
    </span>
  )
}
