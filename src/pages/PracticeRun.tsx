import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { CompositionRun } from '../components/practice/Composition'
import { BankedRun, ListeningRun, MatchingRun, ReadingRun } from '../components/practice/Objective'
import { isReady, useAIConfig } from '../lib/ai'
import { findSet, isKind, kindMeta, saveAISet, totalOf, type Level, type PracticeKind, type PracticeSet } from '../lib/practice'
import { generateSet, type Progress } from '../lib/practiceAI'
import { navigate } from '../lib/router'
import { shuffle } from '../lib/quiz'
import { getData, recordPractice } from '../lib/store'

export function PracticeRun({ query }: { query: URLSearchParams }) {
  const kindParam = query.get('kind')
  const id = query.get('id')
  const level: Level = query.get('level') === 'cet6' ? 'cet6' : 'cet4'
  if (!isKind(kindParam)) return <Missing />
  if (query.get('new') === '1') return <Generate key={query.toString()} kind={kindParam} level={level} />
  if (!id) return <Missing />
  return <Loader key={`${kindParam}:${id}`} kind={kindParam} id={id} />
}

function Missing({ message = '找不到这套题目' }: { message?: string }) {
  return (
    <div className="study center-box">
      <h2>{message}</h2>
      <button className="btn primary" onClick={() => navigate('/practice', true)}>
        返回练习
      </button>
    </div>
  )
}

function Loader({ kind, id }: { kind: PracticeKind; id: string }) {
  const [set, setSet] = useState<PracticeSet | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    findSet(kind, id).then(
      (s) => alive && setSet(s),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [kind, id])
  if (error) return <Missing message={error} />
  if (set === undefined) return <div className="study center-box muted">加载中…</div>
  if (set === null) return <Missing />
  return <Runner set={set} />
}

/**
 * 运行一套题；“重做”时换 key 重新挂载。
 * 模拟考试中传入 onResult（汇总成绩）和 onNext（进入下一部分）。
 */
export function Runner({
  set,
  onResult,
  onNext,
}: {
  set: PracticeSet
  onResult?: (score: number | null, total: number) => void
  onNext?: () => void
}) {
  const [round, setRound] = useState(0)
  const retry = () => {
    setRound((r) => r + 1)
    window.scrollTo(0, 0)
  }
  const save = (score: number, total: number, secs: number) => {
    recordPractice({ kind: set.kind, level: set.level, set: set.id, title: set.title, score, total, at: Date.now(), secs })
    onResult?.(total ? score : null, totalOf(set))
  }

  switch (set.kind) {
    case 'reading':
      return <ReadingRun key={round} set={set} onSubmit={save} onRetry={retry} onNext={onNext} />
    case 'banked':
      return <BankedRun key={round} set={set} onSubmit={save} onRetry={retry} onNext={onNext} />
    case 'matching':
      return <MatchingRun key={round} set={set} onSubmit={save} onRetry={retry} onNext={onNext} />
    case 'listening':
      return <ListeningRun key={round} set={set} onSubmit={save} onRetry={retry} onNext={onNext} />
    case 'translation':
    case 'writing':
      return (
        <CompositionRun
          key={round}
          set={set}
          onSubmit={(score, secs) => save(score ?? 0, score === null ? 0 : totalOf(set), secs)}
          onRetry={retry}
          onNext={onNext}
        />
      )
  }
}

/** 让 AI 生成学生正在学的词，优先最近学过和答错的 */
function studyWords(): string[] {
  const d = getData()
  const recent = Object.entries(d.cards)
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, 60)
    .map(([w]) => w)
  const wrong = Object.keys(d.wrong)
  return [...new Set([...shuffle(wrong).slice(0, 4), ...shuffle(recent)])].slice(0, 14)
}

function Generate({ kind, level }: { kind: PracticeKind; level: Level }) {
  const cfg = useAIConfig()
  const [progress, setProgress] = useState<Progress>({ phase: 'waiting', chars: 0 })
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const ctrl = useRef<AbortController | null>(null)
  const meta = kindMeta(kind)
  const ready = isReady(cfg)

  useEffect(() => {
    if (!ready) return
    const c = new AbortController()
    ctrl.current = c
    setError(null)
    setProgress({ phase: 'waiting', chars: 0 })
    generateSet(kind, level, studyWords(), c.signal, setProgress).then(
      (set) => {
        saveAISet(set)
        navigate(`/practice/run?kind=${kind}&id=${set.id}`, true)
      },
      (e: unknown) => !c.signal.aborted && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => c.abort()
    // 只在进入页面和点“重试”时生成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ready])

  if (!ready) {
    return (
      <div className="study center-box">
        <h2>需要先配置 AI</h2>
        <p className="muted">在「我的 → AI 助手」填写 API Key 后，就可以让 AI 出新题。</p>
        <div className="row gap-sm wrap center">
          <button className="btn primary" onClick={() => navigate('/me?ai=1')}>
            去设置
          </button>
          <button className="btn" onClick={() => navigate('/practice')}>
            返回
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="study center-box">
      <div className={`gen-badge${error ? ' bad' : ''}`}>
        <Icon name={error ? 'close' : 'sparkle'} size={34} />
      </div>
      <h2>{error ? '出题失败' : `AI 正在出一套${level === 'cet6' ? '六级' : '四级'}${meta.name}`}</h2>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <p className="muted">
          {progress.phase === 'thinking' ? '思考中…' : progress.chars ? `已生成 ${progress.chars} 字` : '正在连接…'}
          <br />
          <span className="small">一般需要 20 秒到 2 分钟，会尽量用上你最近学的单词</span>
        </p>
      )}
      <div className="row gap-sm wrap center">
        {error && (
          <button className="btn primary" onClick={() => setAttempt((a) => a + 1)}>
            重试
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            ctrl.current?.abort()
            navigate('/practice')
          }}
        >
          {error ? '返回' : '取消'}
        </button>
      </div>
    </div>
  )
}
