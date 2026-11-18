import { Fragment, useMemo, useState } from 'react'
import { toSegments, useScriptPlayer } from '../../lib/listen'
import {
  gradeObjective,
  LETTERS,
  LISTENING_TYPES,
  type BankedSet,
  type ListeningSet,
  type MatchingSet,
  type ReadingSet,
} from '../../lib/practice'
import { useSettings } from '../../lib/store'
import { Icon } from '../Icon'
import { MCQItem, Paragraphs, RunHeader, ScoreBar, Tokens, useElapsed, useWordPopup } from './common'
import { confirmDialog } from '../../lib/host'

export interface RunProps<T> {
  set: T
  /** 交卷：答对数、总数、用时 */
  onSubmit: (score: number, total: number, secs: number) => void
  onRetry: () => void
  /** 模拟考试中：进入下一部分 */
  onNext?: () => void
}

async function confirmSubmit(unanswered: number): Promise<boolean> {
  return unanswered === 0 || confirmDialog(`还有 ${unanswered} 题没有作答，确定交卷吗？`, '交卷')
}

function useSubmit(total: number, onSubmit: RunProps<unknown>['onSubmit']) {
  const [result, setResult] = useState<boolean[] | null>(null)
  const secs = useElapsed(!!result)
  const submit = async (correct: boolean[], unanswered: number) => {
    if (!(await confirmSubmit(unanswered))) return
    setResult(correct)
    onSubmit(correct.filter(Boolean).length, total, secs)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return { result, secs, submit }
}

// ---------------- 仔细阅读 ----------------

export function ReadingRun({ set, onSubmit, onRetry, onNext }: RunProps<ReadingSet>) {
  const [picks, setPicks] = useState<(number | null)[]>(() => set.questions.map(() => null))
  const { result, secs, submit } = useSubmit(set.questions.length, onSubmit)
  const [onWord, popup] = useWordPopup()
  const done = picks.filter((p) => p !== null).length

  return (
    <div className="run">
      <RunHeader set={set} secs={secs} />
      {result && <ScoreBar score={result.filter(Boolean).length} total={result.length} secs={secs} onRetry={onRetry} onNext={onNext} />}
      <div className="run-body split">
        <section className="run-passage card" onClick={onWord}>
          <p className="muted small run-hint">点击文中单词可以查看释义</p>
          <Paragraphs text={set.passage} />
        </section>
        <section className="run-questions">
          {set.questions.map((q, i) => (
            <MCQItem
              key={i}
              index={i}
              q={q}
              picked={picks[i]}
              submitted={!!result}
              onPick={(v) => setPicks((p) => p.map((x, j) => (j === i ? v : x)))}
              context={`阅读文章：\n${set.passage}`}
            />
          ))}
          {!result && (
            <button className="btn primary lg block" onClick={() => submit(gradeObjective(set, picks), set.questions.length - done)}>
              交卷（已答 {done}/{set.questions.length}）
            </button>
          )}
        </section>
      </div>
      {popup}
    </div>
  )
}

// ---------------- 选词填空 ----------------

export function BankedRun({ set, onSubmit, onRetry, onNext }: RunProps<BankedSet>) {
  const [fills, setFills] = useState<(number | null)[]>(() => set.answers.map(() => null))
  const [active, setActive] = useState<number | null>(0)
  const { result, secs, submit } = useSubmit(set.answers.length, onSubmit)
  const [onWord, popup] = useWordPopup()
  const parts = useMemo(() => set.passage.split(/\{\{(\d+)\}\}/), [set.passage])
  const done = fills.filter((f) => f !== null).length

  const nextEmpty = (after: number, list: (number | null)[]) => {
    for (let k = 1; k <= list.length; k++) {
      const i = (after + k) % list.length
      if (list[i] === null) return i
    }
    return null
  }

  const choose = (opt: number) => {
    if (result) return
    const target = active ?? nextEmpty(-1, fills)
    if (target === null) return
    const next = fills.map((f) => (f === opt ? null : f)) // 每个词只能用一次：从其他空里移走
    next[target] = opt
    setFills(next)
    setActive(nextEmpty(target, next))
  }

  const clickBlank = (i: number) => {
    if (result) return
    if (active === i && fills[i] !== null) {
      setFills((f) => f.map((x, j) => (j === i ? null : x)))
    } else setActive(i)
  }

  const used = new Set(fills.filter((f): f is number => f !== null))

  return (
    <div className="run">
      <RunHeader set={set} secs={secs} />
      {result && <ScoreBar score={result.filter(Boolean).length} total={result.length} secs={secs} onRetry={onRetry} onNext={onNext} />}
      <div className="run-body split">
        <section className="run-passage card" onClick={onWord}>
          <p className="muted small run-hint">先点空格，再点下方的单词填入；再点一次已填的空格可以清空</p>
          <div className="passage banked" lang="en">
            {parts.map((p, i) => {
              if (i % 2 === 0) {
                return (
                  <Fragment key={i}>
                    {p.split(/\n\s*\n/).map((seg, j) => (
                      <Fragment key={j}>
                        {j > 0 && <span className="para-break" />}
                        <Tokens text={seg} />
                      </Fragment>
                    ))}
                  </Fragment>
                )
              }
              const b = Number(p) - 1
              const f = fills[b]
              let cls = 'blank-btn'
              if (result) cls += result[b] ? ' ok' : ' bad'
              else if (active === b) cls += ' active'
              if (f !== null) cls += ' filled'
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  onClick={(e) => {
                    e.stopPropagation()
                    clickBlank(b)
                  }}
                >
                  <span className="blank-no">{b + 1}</span>
                  {f !== null ? set.options[f] : ''}
                  {result && !result[b] && <span className="blank-fix">{set.options[set.answers[b]]}</span>}
                </button>
              )
            })}
          </div>
        </section>
        <section className="run-questions">
          <div className={`word-bank${result ? ' done' : ''}`}>
            {set.options.map((o, i) => (
              <button key={i} type="button" className={`bank-word${used.has(i) ? ' used' : ''}`} disabled={!!result} onClick={() => choose(i)} lang="en">
                <span className="mcq-letter">{LETTERS[i]}</span>
                {o}
              </button>
            ))}
          </div>
          {!result && (
            <button className="btn primary lg block" onClick={() => submit(gradeObjective(set, fills), set.answers.length - done)}>
              交卷（已填 {done}/{set.answers.length}）
            </button>
          )}
          {result && set.explanations && (
            <ol className="explain-list">
              {set.explanations.map((e, i) => (
                <li key={i} className={result[i] ? 'ok' : 'bad'}>
                  <strong lang="en">{set.options[set.answers[i]]}</strong> {e}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {popup}
    </div>
  )
}

// ---------------- 长篇阅读（段落匹配） ----------------

export function MatchingRun({ set, onSubmit, onRetry, onNext }: RunProps<MatchingSet>) {
  const [picks, setPicks] = useState<(number | null)[]>(() => set.statements.map(() => null))
  const { result, secs, submit } = useSubmit(set.statements.length, onSubmit)
  const [onWord, popup] = useWordPopup()
  const done = picks.filter((p) => p !== null).length

  return (
    <div className="run">
      <RunHeader set={set} secs={secs} />
      {result && <ScoreBar score={result.filter(Boolean).length} total={result.length} secs={secs} onRetry={onRetry} onNext={onNext} />}
      <div className="run-body split">
        <section className="run-passage card" onClick={onWord}>
          <p className="muted small run-hint">每个句子对应一个段落；有的段落可能对应多个句子，也可能不对应</p>
          <div className="passage" lang="en">
            {set.paragraphs.map((p, i) => (
              <p key={i}>
                <span className="para-label">{LETTERS[i]}</span>
                <Tokens text={p} />
              </p>
            ))}
          </div>
        </section>
        <section className="run-questions">
          {set.statements.map((s, i) => (
            <div key={i} className={`match-item${result ? (result[i] ? ' ok' : ' bad') : ''}`}>
              <p lang="en">
                <span className="mcq-no">{i + 1}</span>
                {s}
              </p>
              <div className="letter-row">
                {set.paragraphs.map((_, k) => {
                  let cls = 'letter'
                  if (result && k === set.answers[i]) cls += ' correct'
                  else if (result && k === picks[i]) cls += ' wrong'
                  else if (!result && k === picks[i]) cls += ' picked'
                  return (
                    <button key={k} type="button" className={cls} disabled={!!result} onClick={() => setPicks((p) => p.map((x, j) => (j === i ? k : x)))}>
                      {LETTERS[k]}
                    </button>
                  )
                })}
              </div>
              {result && set.explanations?.[i] && <p className="small muted">{set.explanations[i]}</p>}
            </div>
          ))}
          {!result && (
            <button className="btn primary lg block" onClick={() => submit(gradeObjective(set, picks), set.statements.length - done)}>
              交卷（已答 {done}/{set.statements.length}）
            </button>
          )}
        </section>
      </div>
      {popup}
    </div>
  )
}

// ---------------- 听力 ----------------

const SPEAKER = { M: '男', W: '女', N: '' } as const

export function ListeningRun({ set, onSubmit, onRetry, onNext }: RunProps<ListeningSet>) {
  const settings = useSettings()
  const [picks, setPicks] = useState<(number | null)[]>(() => set.questions.map(() => null))
  const { result, secs, submit } = useSubmit(set.questions.length, onSubmit)
  const [showScript, setShowScript] = useState(false)
  const [showStems, setShowStems] = useState(false)
  const [onWord, popup] = useWordPopup()
  const segments = useMemo(
    () => toSegments(set.script, ['Questions.', ...set.questions.map((q, i) => `Question ${i + 1}. ${q.q}`)]),
    [set],
  )
  const player = useScriptPlayer(segments, settings.accent)
  const done = picks.filter((p) => p !== null).length
  const scriptText = set.script.map((s) => `${SPEAKER[s.speaker] ? `${SPEAKER[s.speaker]}：` : ''}${s.text}`).join('\n')
  const scriptVisible = showScript || !!result || !player.supported
  const currentTurn = player.segment?.turn ?? -2

  return (
    <div className="run">
      <RunHeader set={set} secs={secs} />
      {result && <ScoreBar score={result.filter(Boolean).length} total={result.length} secs={secs} onRetry={onRetry} onNext={onNext} />}
      <div className="run-body split">
        <section className="run-passage card">
          <div className="player">
            <button
              type="button"
              className="play-btn"
              aria-label={player.playing ? '暂停' : '播放'}
              disabled={!player.supported}
              onClick={() => (player.playing ? player.pause() : player.play())}
            >
              <Icon name={player.playing ? 'pause' : 'play'} size={30} />
            </button>
            <div className="player-info">
              <strong>
                {LISTENING_TYPES[set.type]}
                {player.playing && player.segment?.turn === -1 && ' · 读题中'}
              </strong>
              <span className="muted small">
                {player.supported
                  ? player.index >= 0
                    ? `第 ${player.index + 1} / ${segments.length} 句`
                    : '点击播放，原文读完后会读题'
                  : '当前浏览器不支持语音朗读，请直接阅读原文'}
              </span>
              <div className="bar thin">
                <div className="bar-fill strong" style={{ width: `${player.index >= 0 ? ((player.index + 1) / segments.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="player-ctrl">
              <button type="button" className="icon-btn sm" aria-label="从头播放" onClick={player.restart} disabled={!player.supported}>
                <Icon name="refresh" size={18} />
              </button>
              <button
                type="button"
                className="chip sm"
                onClick={() => {
                  const next = player.rate === 1 ? 0.8 : player.rate === 0.8 ? 1.15 : 1
                  player.setRate(next)
                }}
              >
                {player.rate}x
              </button>
            </div>
          </div>
          <div className="row gap-sm wrap">
            {!result && player.supported && (
              <button type="button" className="chip sm" aria-pressed={showScript} onClick={() => setShowScript((v) => !v)}>
                {showScript ? '隐藏原文' : '显示原文'}
              </button>
            )}
            {!result && (
              <button type="button" className="chip sm" aria-pressed={showStems} onClick={() => setShowStems((v) => !v)}>
                {showStems ? '隐藏题干' : '显示题干'}
              </button>
            )}
          </div>
          {scriptVisible && (
            <div className="passage script" lang="en" onClick={onWord}>
              {set.script.map((s, i) => (
                <p key={i} className={i === currentTurn ? 'now' : undefined}>
                  {SPEAKER[s.speaker] && <span className="para-label">{SPEAKER[s.speaker]}</span>}
                  <Tokens text={s.text} />
                </p>
              ))}
            </div>
          )}
        </section>
        <section className="run-questions">
          {set.questions.map((q, i) => (
            <MCQItem
              key={i}
              index={i}
              q={q}
              picked={picks[i]}
              submitted={!!result}
              hideStem={!showStems}
              onPick={(v) => setPicks((p) => p.map((x, j) => (j === i ? v : x)))}
              context={`听力原文：\n${scriptText}`}
            />
          ))}
          {!result && (
            <button
              className="btn primary lg block"
              onClick={() => {
                player.pause()
                submit(gradeObjective(set, picks), set.questions.length - done)
              }}
            >
              交卷（已答 {done}/{set.questions.length}）
            </button>
          )}
        </section>
      </div>
      {popup}
    </div>
  )
}
