import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isReady, useAIConfig } from '../../lib/ai'
import { useLookup } from '../../lib/lookup'
import { kindMeta, LETTERS, type MCQ, type PracticeSet } from '../../lib/practice'
import { explainMCQ } from '../../lib/practiceAI'
import { navigate } from '../../lib/router'
import type { Word } from '../../lib/types'
import { Icon } from '../Icon'
import { Markdown } from '../Markdown'
import { WordSheet } from '../WordSheet'
import { confirmDialog } from '../../lib/host'

/** 模拟考试进度：在考试中渲染各部分时提供 */
export const ExamContext = createContext<{ step: number; total: number } | null>(null)
export const useExam = () => useContext(ExamContext)

/** 计时（秒），stopped 后停止计时 */
export function useElapsed(stopped: boolean): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (stopped) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [stopped])
  return secs
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function RunHeader({ set, secs }: { set: PracticeSet; secs: number }) {
  const exam = useExam()
  const meta = kindMeta(set.kind)
  const over = secs > meta.minutes * 60
  return (
    <header className="run-top">
      <button
        className="icon-btn"
        aria-label="退出练习"
        onClick={async () => {
          const ok = exam
            ? await confirmDialog('退出模拟考试？已完成的部分会保留在练习记录里。', '退出')
            : secs < 20 || (await confirmDialog('退出后本次作答不会保存，确定退出吗？', '退出'))
          if (ok) navigate('/practice')
        }}
      >
        <Icon name="close" />
      </button>
      <div className="run-title">
        <span className="muted small">
          {exam && `模拟考试 ${exam.step + 1}/${exam.total} · `}
          {meta.name} · {set.level === 'cet6' ? '六级' : '四级'}
          {set.ai && ' · AI 出题'}
        </span>
        <strong className="ellipsis">{set.title}</strong>
      </div>
      <span className={`run-timer${over ? ' over' : ''}`} title={`建议用时 ${meta.minutes} 分钟`}>
        <Icon name="clock" size={16} />
        {fmtTime(secs)}
      </span>
    </header>
  )
}

/** 点击文中单词查看释义 */
export function useWordPopup(): [(e: React.MouseEvent) => void, ReactNode] {
  const lookup = useLookup()
  const [word, setWord] = useState<Word | null>(null)
  const onClick = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest('[data-w]') as HTMLElement | null
    if (!t || !lookup) return
    const w = lookup(t.dataset.w ?? '')
    if (w) setWord(w)
    else {
      t.classList.add('miss')
      setTimeout(() => t.classList.remove('miss'), 600)
    }
  }
  return [onClick, word ? <WordSheet word={word} onClose={() => setWord(null)} /> : null]
}

/** 把文本切成可点击的单词 */
export function Tokens({ text }: { text: string }) {
  const parts = text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} data-w={p} className="tok">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

export function Paragraphs({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`passage ${className}`} lang="en">
      {text
        .split(/\n\s*\n|\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>
            <Tokens text={p.trim()} />
          </p>
        ))}
    </div>
  )
}

/** 单选题；result 为 null 时作答中，否则显示对错和解析 */
export function MCQItem({
  index,
  q,
  picked,
  onPick,
  submitted,
  context,
  hideStem = false,
}: {
  index: number
  q: MCQ
  picked: number | null
  onPick: (i: number) => void
  submitted: boolean
  /** 讲解时提供给 AI 的阅读材料 */
  context: string
  hideStem?: boolean
}) {
  const correct = picked === q.answer
  return (
    <div className={`mcq${submitted ? (correct ? ' ok' : ' bad') : ''}`}>
      <p className="mcq-q">
        <span className="mcq-no">{index + 1}</span>
        <span lang="en">{hideStem && !submitted ? '（听录音作答）' : q.q}</span>
      </p>
      <div className="mcq-options">
        {q.options.map((o, i) => {
          let cls = 'mcq-opt'
          if (submitted && i === q.answer) cls += ' correct'
          else if (submitted && i === picked) cls += ' wrong'
          else if (!submitted && i === picked) cls += ' picked'
          return (
            <button key={i} type="button" className={cls} disabled={submitted} onClick={() => onPick(i)} lang="en">
              <span className="mcq-letter">{LETTERS[i]}</span>
              <span>{o}</span>
            </button>
          )
        })}
      </div>
      {submitted && <Explanation q={q} picked={picked} context={context} />}
    </div>
  )
}

function Explanation({ q, picked, context }: { q: MCQ; picked: number | null; context: string }) {
  const cfg = useAIConfig()
  const [ai, setAI] = useState<{ text: string; busy: boolean; error?: string } | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])

  const ask = () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setAI({ text: '', busy: true })
    explainMCQ(context, q, picked, { signal: c.signal, onText: (text) => setAI({ text, busy: true }) }).then(
      (text) => setAI({ text, busy: false }),
      (e: unknown) => !c.signal.aborted && setAI({ text: '', busy: false, error: e instanceof Error ? e.message : String(e) }),
    )
  }

  return (
    <div className="explain">
      <p className="small">
        <strong>答案 {LETTERS[q.answer]}</strong>
        {picked !== null && picked !== q.answer && <span className="muted">（你选了 {LETTERS[picked]}）</span>}
        {picked === null && <span className="muted">（未作答）</span>}
      </p>
      {q.explanation && <p className="small muted">{q.explanation}</p>}
      {isReady(cfg) && !ai && (
        <button type="button" className="ai-btn" onClick={ask}>
          <Icon name="sparkle" size={14} /> AI 详细讲解
        </button>
      )}
      {ai && (
        <div className="ai-panel compact">
          {ai.error ? <span className="error small">{ai.error}</span> : ai.text ? <Markdown text={ai.text} /> : <div className="ai-skeleton" />}
        </div>
      )}
    </div>
  )
}

/** 交卷后的成绩条 */
export function ScoreBar({
  score,
  total,
  secs,
  onRetry,
  onNext,
}: {
  score: number
  total: number
  secs: number
  onRetry?: () => void
  /** 模拟考试中：进入下一部分 */
  onNext?: () => void
}) {
  const rate = total ? score / total : 0
  return (
    <div className={`score-bar ${rate >= 0.8 ? 'good' : rate >= 0.6 ? 'ok' : 'low'}`}>
      <div>
        <strong>
          {score} / {total}
        </strong>
        <span className="small">
          正确率 {Math.round(rate * 100)}% · 用时 {fmtTime(secs)}
        </span>
      </div>
      <div className="row gap-sm">
        {onRetry && !onNext && (
          <button type="button" className="btn sm" onClick={onRetry}>
            重做
          </button>
        )}
        <button type="button" className="btn sm primary" onClick={onNext ?? (() => navigate('/practice'))}>
          {onNext ? '下一部分' : '完成'}
        </button>
      </div>
    </div>
  )
}
