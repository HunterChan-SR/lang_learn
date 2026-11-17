import { useEffect, useRef, useState } from 'react'
import { isReady, useAIConfig } from '../../lib/ai'
import { countWords, type TranslationSet, type WritingSet } from '../../lib/practice'
import { gradeComposition, type CompositionGrade, type Progress } from '../../lib/practiceAI'
import { navigate } from '../../lib/router'
import { Icon } from '../Icon'
import { fmtTime, Paragraphs, RunHeader, useElapsed } from './common'

const draftKey = (id: string) => `cet-words:draft:${id}`

function loadDraft(id: string): string {
  try {
    return localStorage.getItem(draftKey(id)) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(id: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(id), text)
    else localStorage.removeItem(draftKey(id))
  } catch {
    // ignore
  }
}

interface Props {
  set: TranslationSet | WritingSet
  /** 提交：AI 评分（满分 15），未评分时 score 为 null */
  onSubmit: (score: number | null, secs: number) => void
  onRetry: () => void
  onNext?: () => void
}

type State =
  | { kind: 'editing' }
  | { kind: 'grading'; progress: Progress }
  | { kind: 'graded'; grade: CompositionGrade }
  | { kind: 'self' }
  | { kind: 'error'; message: string }

export function CompositionRun({ set, onSubmit, onRetry, onNext }: Props) {
  const cfg = useAIConfig()
  const [text, setText] = useState(() => loadDraft(set.id))
  const [state, setState] = useState<State>({ kind: 'editing' })
  const [showHints, setShowHints] = useState(false)
  const [showRef, setShowRef] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  const finished = state.kind === 'graded' || state.kind === 'self'
  const secs = useElapsed(finished || state.kind === 'grading')
  const words = countWords(text)
  const isWriting = set.kind === 'writing'
  const ready = isReady(cfg)

  useEffect(() => {
    const t = setTimeout(() => saveDraft(set.id, text), 500)
    return () => clearTimeout(t)
  }, [set.id, text])

  useEffect(() => () => ctrl.current?.abort(), [])

  const grade = async () => {
    if (words < 10) {
      window.alert('写得太少了，至少写几句再提交吧')
      return
    }
    if (isWriting && words < set.minWords && !window.confirm(`目前 ${words} 词，少于要求的 ${set.minWords} 词，会被扣分。仍然提交吗？`)) return
    if (!ready) {
      setState({ kind: 'self' })
      onSubmit(null, secs)
      return
    }
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setState({ kind: 'grading', progress: { phase: 'waiting', chars: 0 } })
    try {
      const g = await gradeComposition(set, text, c.signal, (progress) => setState({ kind: 'grading', progress }))
      setState({ kind: 'graded', grade: g })
      onSubmit(g.score, secs)
      saveDraft(set.id, '')
    } catch (e) {
      if (!c.signal.aborted) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      else setState({ kind: 'editing' })
    }
  }

  const reference = set.kind === 'translation' ? set.reference : set.sample

  return (
    <div className="run">
      <RunHeader set={set} secs={secs} />
      <div className="run-body split">
        <section className="run-passage card">
          {set.kind === 'translation' ? (
            <>
              <p className="muted small">Directions: 请将下面这段话翻译成英文。</p>
              <p className="source-zh">{set.source}</p>
              {set.keywords && set.keywords.length > 0 && (
                <>
                  <button type="button" className="more-btn" onClick={() => setShowHints((v) => !v)}>
                    {showHints ? '隐藏' : '查看'}关键词译法 <Icon name={showHints ? 'up' : 'down'} size={16} />
                  </button>
                  {showHints && (
                    <ul className="keywords">
                      {set.keywords.map(([zh, en]) => (
                        <li key={zh}>
                          <span>{zh}</span>
                          <strong lang="en">{en}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="directions" lang="en">
                {set.directions}
              </p>
              {set.outline && set.outline.length > 0 && (
                <>
                  <button type="button" className="more-btn" onClick={() => setShowHints((v) => !v)}>
                    {showHints ? '隐藏' : '查看'}写作提示 <Icon name={showHints ? 'up' : 'down'} size={16} />
                  </button>
                  {showHints && (
                    <ul className="outline">
                      {set.outline.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </section>

        <section className="run-questions">
          <div className="compose">
            <textarea
              className="textarea compose-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={state.kind !== 'editing' && state.kind !== 'error'}
              placeholder={isWriting ? 'Write your essay here…' : 'Type your translation here…'}
              lang="en"
              spellCheck={false}
              autoCapitalize="sentences"
            />
            <div className="compose-meta small muted">
              <span>
                {words} 词{isWriting && ` · 要求 ${set.minWords}~${set.maxWords} 词`}
              </span>
              <span>草稿自动保存在本机</span>
            </div>
          </div>

          {(state.kind === 'editing' || state.kind === 'error') && (
            <>
              {state.kind === 'error' && <p className="error small">{state.message}</p>}
              <button className="btn primary lg block" onClick={() => void grade()} disabled={!text.trim()}>
                {ready ? (state.kind === 'error' ? '重新提交批改' : '提交，AI 批改') : '提交，查看参考答案'}
              </button>
              {!ready && (
                <p className="muted small center">
                  配置 AI 后可以按四六级评分标准自动打分和批改。
                  <button type="button" className="link" onClick={() => navigate('/me?ai=1')}>
                    去设置
                  </button>
                </p>
              )}
            </>
          )}

          {state.kind === 'grading' && (
            <div className="ai-panel running">
              <header>
                <span className="ai-title">
                  <Icon name="sparkle" size={16} /> AI 正在批改
                </span>
                <span className="muted small">
                  {state.progress.phase === 'thinking' ? '思考中…' : state.progress.chars ? `已生成 ${state.progress.chars} 字` : '正在连接…'}
                </span>
              </header>
              <div className="ai-skeleton" />
              <button type="button" className="btn sm ghost" onClick={() => ctrl.current?.abort()}>
                取消
              </button>
            </div>
          )}

          {state.kind === 'graded' && <GradeView grade={state.grade} secs={secs} />}

          {finished && (
            <>
              {reference && (
                <section className="card ref">
                  <button type="button" className="more-btn" onClick={() => setShowRef((v) => !v)}>
                    {showRef || state.kind === 'self' ? '' : '查看'}
                    {isWriting ? '参考范文' : '参考译文'} <Icon name={showRef || state.kind === 'self' ? 'up' : 'down'} size={16} />
                  </button>
                  {(showRef || state.kind === 'self') && <Paragraphs text={reference} />}
                </section>
              )}
              {state.kind === 'self' && <p className="muted small">对照参考答案自查：意思是否完整、用词是否准确、语法是否正确。</p>}
              <div className="row gap-sm">
                {!onNext && (
                  <button type="button" className="btn" onClick={onRetry}>
                    重写一遍
                  </button>
                )}
                <button type="button" className="btn primary grow" onClick={onNext ?? (() => navigate('/practice'))}>
                  {onNext ? '下一部分' : '完成'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function GradeView({ grade, secs }: { grade: CompositionGrade; secs: number }) {
  const rate = grade.score / 15
  return (
    <section className="card grade-view">
      <div className="grade-head">
        <div className={`grade-score ${rate >= 0.8 ? 'good' : rate >= 0.6 ? 'ok' : 'low'}`}>
          <strong>{grade.score}</strong>
          <span>/ 15</span>
        </div>
        <div>
          <strong>{grade.band || 'AI 评分'}</strong>
          <p className="muted small">用时 {fmtTime(secs)} · 评分由 AI 按四六级标准给出，仅供参考</p>
        </div>
      </div>
      {grade.summary && <p>{grade.summary}</p>}
      {grade.strengths.length > 0 && (
        <div>
          <h4>优点</h4>
          <ul className="plain-list good">
            {grade.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {grade.issues.length > 0 && (
        <div>
          <h4>需要改进</h4>
          <ul className="issues">
            {grade.issues.map((it, i) => (
              <li key={i}>
                {it.original && (
                  <p className="issue-from" lang="en">
                    {it.original}
                  </p>
                )}
                {it.suggestion && (
                  <p className="issue-to" lang="en">
                    {it.suggestion}
                  </p>
                )}
                {it.reason && <p className="small muted">{it.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {grade.improved && (
        <div>
          <h4>修改后的版本</h4>
          <Paragraphs text={grade.improved} />
        </div>
      )}
    </section>
  )
}
