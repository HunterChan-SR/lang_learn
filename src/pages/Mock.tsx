import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { ExamContext, fmtTime } from '../components/practice/common'
import { kindMeta, LISTENING_TYPES, loadAISets, loadBank, type Level, type PracticeKind, type PracticeSet } from '../lib/practice'
import { shuffle } from '../lib/quiz'
import { navigate } from '../lib/router'
import { recordPractice } from '../lib/store'
import { Runner } from './PracticeRun'

/**
 * 模拟整卷：按真题顺序（写作 → 听力 → 阅读 → 翻译）组卷，逐部分作答，最后按 710 分制折算。
 * 分值比例：写作 15%、听力 35%、阅读 35%（选词填空 5%、长篇阅读 10%、仔细阅读 20%）、翻译 15%。
 */

const POINTS: Record<PracticeKind, number> = {
  writing: 106.5,
  listening: 248.5,
  banked: 35.5,
  matching: 71,
  reading: 142,
  translation: 106.5,
}

const SECTIONS: { kind: PracticeKind; count: number; minutes: number }[] = [
  { kind: 'writing', count: 1, minutes: 30 },
  { kind: 'listening', count: 3, minutes: 25 },
  { kind: 'banked', count: 1, minutes: 10 },
  { kind: 'matching', count: 1, minutes: 15 },
  { kind: 'reading', count: 2, minutes: 15 },
  { kind: 'translation', count: 1, minutes: 30 },
]

const LISTEN_ORDER = Object.keys(LISTENING_TYPES)

async function buildPaper(level: Level): Promise<PracticeSet[]> {
  const ai = loadAISets()
  const paper: PracticeSet[] = []
  for (const s of SECTIONS) {
    const pool = [...(await loadBank(s.kind)), ...ai.filter((x) => x.kind === s.kind)].filter((x) => x.level === level)
    let picked = shuffle(pool).slice(0, s.count)
    if (s.kind === 'listening') {
      picked = picked.sort(
        (a, b) => LISTEN_ORDER.indexOf(a.kind === 'listening' ? a.type : '') - LISTEN_ORDER.indexOf(b.kind === 'listening' ? b.type : ''),
      )
    }
    paper.push(...picked)
  }
  return paper
}

interface Result {
  score: number | null
  total: number
}

/** 每套题在 710 分中的分值：同一题型有多套时按题目数分配 */
function pointsOf(paper: PracticeSet[], i: number, totals: number[]): number {
  const kind = paper[i].kind
  const same = paper.map((p, j) => (p.kind === kind ? totals[j] : 0))
  const sum = same.reduce((a, b) => a + b, 0)
  return sum ? (POINTS[kind] * totals[i]) / sum : 0
}

export function Mock({ query }: { query: URLSearchParams }) {
  const level: Level = query.get('level') === 'cet6' ? 'cet6' : 'cet4'
  const [paper, setPaper] = useState<PracticeSet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(-1)
  const [results, setResults] = useState<(Result | null)[]>([])
  const started = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const saved = useRef(false)

  useEffect(() => {
    let alive = true
    buildPaper(level).then(
      (p) => {
        if (!alive) return
        setPaper(p)
        setResults(p.map(() => null))
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [level])

  const finished = !!paper && step >= paper.length

  useEffect(() => {
    window.scrollTo(0, 0)
    if (finished) setElapsed(Math.round((Date.now() - started.current) / 1000))
  }, [step, finished])

  // 交卷后保存一条总成绩
  useEffect(() => {
    if (!finished || !paper || saved.current) return
    saved.current = true
    const totals = paper.map((_, i) => results[i]?.total ?? 0)
    let score = 0
    let max = 0
    paper.forEach((_, i) => {
      const r = results[i]
      if (r?.score == null) return
      const pts = pointsOf(paper, i, totals)
      score += (pts * r.score) / r.total
      max += pts
    })
    if (max > 0) {
      recordPractice({
        kind: 'mock',
        level,
        set: 'mock',
        title: `模拟考试（${level === 'cet6' ? '六级' : '四级'}）`,
        score: Math.round(score),
        total: Math.round(max),
        at: Date.now(),
        secs: Math.round((Date.now() - started.current) / 1000),
      })
    }
  }, [finished, paper, results, level])

  if (error) {
    return (
      <div className="study center-box">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => navigate('/practice')}>
          返回
        </button>
      </div>
    )
  }
  if (!paper) return <div className="study center-box muted">组卷中…</div>

  const levelName = level === 'cet6' ? '六级' : '四级'

  if (step < 0) {
    const total = SECTIONS.reduce((s, x) => s + x.minutes, 0)
    return (
      <div className="study mock-intro">
        <header className="study-top">
          <button className="icon-btn" aria-label="返回" onClick={() => navigate('/practice')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="center-box">
          <div className="gen-badge">
            <Icon name="clock" size={34} />
          </div>
          <h2>{levelName}模拟考试</h2>
          <p className="muted">按真题顺序组卷，约 {total} 分钟，满分 710 分</p>
          <ol className="mock-sections">
            {SECTIONS.map((s) => {
              const n = paper.filter((p) => p.kind === s.kind).length
              return (
                <li key={s.kind}>
                  <span>
                    {kindMeta(s.kind).name}
                    {n > 1 && ` × ${n}`}
                  </span>
                  <span className="muted small">
                    {Math.round((POINTS[s.kind] / 710) * 100)}% · 约 {s.minutes} 分钟
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="muted small">每部分交卷后可以查看解析再进入下一部分。写作和翻译需要配置 AI 才能评分，未评分的部分不计入总分。</p>
          <button
            className="btn primary lg"
            onClick={() => {
              started.current = Date.now()
              setStep(0)
            }}
          >
            开始考试
          </button>
        </div>
      </div>
    )
  }

  if (finished) {
    const totals = paper.map((_, i) => results[i]?.total ?? 0)
    const rows = paper.map((p, i) => {
      const r = results[i]
      const pts = pointsOf(paper, i, totals)
      return { p, r, pts, got: r?.score == null ? null : (pts * r.score) / r.total }
    })
    const graded = rows.filter((x) => x.got !== null)
    const score = Math.round(graded.reduce((s, x) => s + x.got!, 0))
    const max = Math.round(graded.reduce((s, x) => s + x.pts, 0))
    const allGraded = graded.length === rows.length
    const scaled = allGraded ? score : max ? Math.round((score / max) * 710) : 0
    return (
      <div className="study">
        <div className="center-box finish">
          <div className={`score ${scaled >= 550 ? 'good' : scaled >= 425 ? 'ok' : 'low'}`}>
            <strong>{scaled}</strong>
            <span>分</span>
          </div>
          <h2>{scaled >= 425 ? '达到 425 分及格线' : '还没到 425 分，继续加油'}</h2>
          <p className="muted small">
            {allGraded ? `满分 710 · 总用时 ${fmtTime(elapsed)}` : `已评分部分得 ${score} / ${max} 分，按比例估算为 ${scaled} 分 · 总用时 ${fmtTime(elapsed)}`}
          </p>
          <table className="mock-table">
            <thead>
              <tr>
                <th>部分</th>
                <th>答对</th>
                <th>得分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, r, pts, got }, i) => (
                <tr key={i}>
                  <td>
                    {kindMeta(p.kind).name}
                    <span className="muted small"> {p.title}</span>
                  </td>
                  <td>{r?.score == null ? '未评分' : `${r.score}/${r.total}`}</td>
                  <td>
                    {got === null ? '—' : got.toFixed(1)}
                    <span className="muted small"> / {pts.toFixed(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">按真题分值比例折算，仅供参考；真实考试采用常模参照计分。</p>
          <div className="row gap-sm wrap center">
            <button className="btn primary" onClick={() => navigate('/practice')}>
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ExamContext.Provider value={{ step, total: paper.length }}>
      <Runner
        key={step}
        set={paper[step]}
        onResult={(score, total) => setResults((rs) => rs.map((r, i) => (i === step ? { score, total } : r)))}
        onNext={() => setStep((s) => s + 1)}
      />
    </ExamContext.Provider>
  )
}
