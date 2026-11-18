import { useCallback, useEffect, useRef, useState } from 'react'
import { dayIndex } from './date'
import { getExtras } from './extras'
import { buildQuiz, checkSpelling, shuffle, type Question, type QuizType } from './quiz'
import { navigate } from './router'
import { speak } from './speech'
import { getData, recordAnswer, useAppData } from './store'
import type { AppData, Word } from './types'

/** 测验的题目来源、题型、题量，以及出题和作答逻辑。常规界面和代码皮肤共用。 */

export type Source = 'today' | 'learned' | 'starred' | 'wrong' | 'book'

export const SOURCES: { id: Source; label: string; desc: string }[] = [
  { id: 'today', label: '今日单词', desc: '今天学过和复习过的' },
  { id: 'learned', label: '已学单词', desc: '所有学过的单词' },
  { id: 'wrong', label: '错题本', desc: '连续答对 2 次自动移出' },
  { id: 'starred', label: '生词本', desc: '手动收藏的单词' },
  { id: 'book', label: '整个词库', desc: '随机抽查，含未学的词' },
]

export const ALL_TYPES: QuizType[] = ['en2zh', 'zh2en', 'cloze', 'spell', 'listen']
export const DEFAULT_TYPES: QuizType[] = ['en2zh', 'zh2en', 'cloze', 'spell']
export const COUNTS = [10, 20, 30]

export function pickPool(src: Source, data: AppData, all: Map<string, Word>, book: Word[]): Word[] {
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

export const isSource = (s: string | null): s is Source => SOURCES.some((x) => x.id === s)

/** 从地址参数读出测验设置 */
export function quizParams(query: URLSearchParams) {
  const src: Source = isSource(query.get('src')) ? (query.get('src') as Source) : 'learned'
  const count = Number(query.get('n')) || 10
  const picked = query.get('t')?.split(',').filter((t): t is QuizType => ALL_TYPES.includes(t as QuizType)) ?? DEFAULT_TYPES
  return { src, count, types: picked.length ? picked : DEFAULT_TYPES, run: query.get('run') === '1' }
}

export const quizUrl = (src: Source, count: number, types: QuizType[]) => `/quiz?run=1&src=${src}&n=${count}&t=${types.join(',')}`

/** 题目只在进入时生成一次；干扰项从当前词库里挑。例句填空需要先加载例句 */
export function useQuizQuestions(src: Source, count: number, types: QuizType[], all: Map<string, Word>, book: Word[]): Question[] | null {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  useEffect(() => {
    let alive = true
    // 先抽好题目用的词，例句只需加载这些词的；只考例句填空时多抽一些，优先用有例句的词
    const onlyCloze = types.every((t) => t === 'cloze')
    const candidates = shuffle(pickPool(src, getData(), all, book)).slice(0, onlyCloze ? count * 3 : count)
    const distractors = book.length ? book : [...all.values()]
    const build = (pool: Word[], examples?: Map<string, [string, string][]>) =>
      alive && setQuestions(buildQuiz(pool, distractors, count, types, Math.random, examples))
    if (!types.includes('cloze')) build(candidates)
    else
      getExtras(candidates.map((w) => w.w)).then(
        (m) => {
          const has = (w: Word) => (m.get(w.w)?.examples.length ?? 0) > 0
          const pool = onlyCloze ? [...candidates.filter(has), ...candidates.filter((w) => !has(w))] : candidates
          build(pool.slice(0, count), new Map([...m].map(([w, x]) => [w, x.examples])))
        },
        () => build(candidates.slice(0, count)),
      )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return questions
}

export interface Answer {
  word: Word
  correct: boolean
}

/**
 * 作答：选择题 1-4 选择，拼写题输入后回车提交；答错后回车进入下一题，Esc 退出。
 * autoPlay 为 false 时只有“听音拼写”会自动发音（代码皮肤默认不出声）。
 */
export function useQuizPlay(questions: Question[], opts: { autoPlay: boolean; exitTo?: string }) {
  const settings = useAppData().settings
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [spelling, setSpelling] = useState('')
  const [hint, setHint] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const spokeFirst = useRef(false)
  const autoPlay = opts.autoPlay && settings.autoPlay
  const exitTo = opts.exitTo ?? '/quiz'

  const q = questions[idx]
  const answered = answers.length > idx
  const done = idx >= questions.length
  const say = useCallback((w: string) => speak(w, settings), [settings])
  const wantsAudio = (question: Question | undefined) =>
    !!question && (question.type === 'listen' || ((question.type === 'en2zh' || question.type === 'spell') && autoPlay))

  useEffect(() => {
    if (!spokeFirst.current && q) {
      spokeFirst.current = true
      if (wantsAudio(q)) say(q.word.w)
    }
  })

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  useEffect(() => {
    if ((q?.type === 'spell' || q?.type === 'listen') && !answered) inputRef.current?.focus()
  }, [q, answered])

  const next = useCallback(() => {
    clearTimeout(advanceTimer.current)
    setIdx((i) => i + 1)
    setPicked(null)
    setSpelling('')
    setHint(0)
    const upcoming = questions[idx + 1]
    if (wantsAudio(upcoming)) say(upcoming.word.w)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, questions, say, autoPlay])

  const submit = useCallback(
    (correct: boolean) => {
      if (!q || answered) return
      recordAnswer(q.word.w, correct)
      setAnswers((a) => [...a, { word: q.word, correct }])
      // 常规界面答完后读一遍正确答案（与“自动发音”设置无关）；代码皮肤不出声
      if ((q.type === 'zh2en' || q.type === 'cloze') && opts.autoPlay) say(q.word.w)
      if (correct) advanceTimer.current = setTimeout(next, q.type === 'spell' ? 900 : 700)
    },
    [q, answered, next, say, opts.autoPlay],
  )

  const choose = (i: number) => {
    if (!q || !('options' in q) || answered) return
    setPicked(i)
    submit(i === q.answer)
  }

  const submitSpelling = () => {
    if (q && !answered && spelling.trim()) submit(checkSpelling(spelling, q.word))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !q) return
      if (e.key === 'Escape') return navigate(exitTo)
      if (answered && e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (!answered && 'options' in q && ['1', '2', '3', '4'].includes(e.key)) {
        choose(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const correctCount = answers.filter((a) => a.correct).length
  const lastCorrect = answered ? answers[idx].correct : null

  return {
    q,
    idx,
    answers,
    answered,
    done,
    picked,
    choose,
    spelling,
    setSpelling,
    hint,
    addHint: () => setHint((h) => h + 1),
    submitSpelling,
    next,
    correctCount,
    lastCorrect,
    inputRef,
    say,
  }
}
