import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { isReady, useAIConfig } from '../lib/ai'
import { formatDate } from '../lib/date'
import { deleteAISet, KINDS, kindMeta, loadAISets, loadBank, type Level, type PracticeKind, type PracticeSet } from '../lib/practice'
import { navigate } from '../lib/router'
import { useAppData } from '../lib/store'
import type { PracticeRecord } from '../lib/types'

const KIND_ICON: Record<PracticeKind, IconName> = {
  listening: 'headphones',
  banked: 'doc',
  matching: 'search',
  reading: 'book',
  translation: 'refresh',
  writing: 'pen',
}

interface KindStats {
  attempts: number
  /** 客观题正确率 / 主观题得分率，没有评分记录时为 null */
  rate: number | null
  /** 每套题的最好成绩 */
  best: Map<string, PracticeRecord>
}

function statsFor(records: PracticeRecord[], kind: PracticeKind, level: Level): KindStats {
  const mine = records.filter((r) => r.kind === kind && r.level === level)
  const scored = mine.filter((r) => r.total > 0)
  const best = new Map<string, PracticeRecord>()
  for (const r of mine) {
    const b = best.get(r.set)
    if (!b || (r.total > 0 && r.score / r.total > (b.total ? b.score / b.total : -1))) best.set(r.set, r)
  }
  // 正确率只看最近 10 次，更能反映当前水平
  const recent = scored.sort((a, b) => b.at - a.at).slice(0, 10)
  const rate = recent.length ? recent.reduce((s, r) => s + r.score / r.total, 0) / recent.length : null
  return { attempts: mine.length, rate, best }
}

const pct = (r: number) => `${Math.round(r * 100)}%`

export function Practice() {
  const data = useAppData()
  const cfg = useAIConfig()
  const aiReady = isReady(cfg)
  const [level, setLevel] = useState<Level>(data.settings.book)
  const [banks, setBanks] = useState<Partial<Record<PracticeKind, PracticeSet[]>>>({})
  const [bankError, setBankError] = useState<string | null>(null)
  const [aiSets, setAISets] = useState(loadAISets)
  const records = useMemo(() => Object.values(data.practice), [data.practice])

  useEffect(() => {
    let alive = true
    for (const k of KINDS) {
      loadBank(k.kind).then(
        (sets) => alive && setBanks((b) => ({ ...b, [k.kind]: sets })),
        (e: unknown) => alive && setBankError(e instanceof Error ? e.message : String(e)),
      )
    }
    return () => {
      alive = false
    }
  }, [])

  const stats = useMemo(
    () => Object.fromEntries(KINDS.map((k) => [k.kind, statsFor(records, k.kind, level)])) as Record<PracticeKind, KindStats>,
    [records, level],
  )
  const weakest = KINDS.filter((k) => stats[k.kind].rate !== null).sort((a, b) => stats[a.kind].rate! - stats[b.kind].rate!)[0]
  const recent = [...records].sort((a, b) => b.at - a.at).slice(0, 8)
  const mocks = records.filter((r) => r.kind === 'mock' && r.level === level).sort((a, b) => b.at - a.at)
  const myAISets = aiSets.filter((s) => s.level === level)

  const open = (s: PracticeSet) => navigate(`/practice/run?kind=${s.kind}&id=${s.id}`)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="muted small">按四六级真题题型的原创练习</div>
          <h1>题型练习</h1>
        </div>
        <div className="seg" role="tablist" aria-label="切换级别">
          {(['cet4', 'cet6'] as const).map((l) => (
            <button key={l} role="tab" aria-selected={level === l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l === 'cet4' ? '四级' : '六级'}
            </button>
          ))}
        </div>
      </header>

      <section className="card overview">
        <h3>各题型正确率（最近 10 次）</h3>
        <div className="skill-bars">
          {KINDS.map((k) => {
            const r = stats[k.kind].rate
            return (
              <div key={k.kind} className="skill">
                <span className="skill-name">{k.name}</span>
                <div className="bar">
                  <div className={`bar-fill strong ${r === null ? '' : r >= 0.8 ? 'good' : r >= 0.6 ? 'ok' : 'low'}`} style={{ width: `${(r ?? 0) * 100}%` }} />
                </div>
                <span className="skill-val small muted">{r === null ? '—' : pct(r)}</span>
              </div>
            )
          })}
        </div>
        <p className="muted small">
          {weakest && stats[weakest.kind].rate! < 0.8
            ? `最需要加强：${weakest.name}（${pct(stats[weakest.kind].rate!)}），建议多练几套。`
            : records.length
              ? '各题型都不错，继续保持。'
              : '每做完一套题都会记录成绩，这里会显示你的薄弱题型。'}
          {!aiReady && ' 翻译和写作需要配置 AI 才能自动打分。'}
        </p>
      </section>

      <section className="card mock-card">
        <div className="kind-head">
          <span className="kind-icon mock">
            <Icon name="clock" size={20} />
          </span>
          <div>
            <strong>模拟整卷</strong>
            <span className="muted small">写作 → 听力 → 阅读 → 翻译 · 约 125 分钟 · 710 分制</span>
          </div>
        </div>
        {mocks.length > 0 && (
          <p className="small">
            最近一次 <strong>{mocks[0].total === 710 ? mocks[0].score : Math.round((mocks[0].score / mocks[0].total) * 710)}</strong> 分
            {mocks.length > 1 && <span className="muted"> · 共考过 {mocks.length} 次</span>}
            {mocks[0].total !== 710 && <span className="muted">（按已评分部分估算）</span>}
          </p>
        )}
        <div className="row gap-sm wrap">
          <button type="button" className="btn sm primary" onClick={() => navigate(`/practice/mock?level=${level}`)}>
            开始模拟考试
          </button>
        </div>
      </section>

      {bankError && <p className="error small">{bankError}</p>}

      <div className="kind-grid">
        {KINDS.map((k) => {
          const sets = (banks[k.kind] ?? []).filter((s) => s.level === level)
          const st = stats[k.kind]
          const next = sets.find((s) => !st.best.has(s.id)) ?? sets[0]
          return (
            <section key={k.kind} className="card kind-card">
              <div className="kind-head">
                <span className={`kind-icon ${k.kind}`}>
                  <Icon name={KIND_ICON[k.kind]} size={20} />
                </span>
                <div>
                  <strong>{k.name}</strong>
                  <span className="muted small">
                    {k.section} · 约 {k.minutes} 分钟
                  </span>
                </div>
              </div>
              <p className="muted small">{k.desc}</p>
              <ul className="set-list">
                {sets.map((s) => {
                  const b = st.best.get(s.id)
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => open(s)}>
                        <span className="ellipsis">{s.title}</span>
                        {b ? (
                          <span className="set-score small">{b.total ? `${b.score}/${b.total}` : '已完成'}</span>
                        ) : (
                          <span className="muted small">未做</span>
                        )}
                      </button>
                    </li>
                  )
                })}
                {!banks[k.kind] && !bankError && <li className="muted small">加载中…</li>}
              </ul>
              <div className="row gap-sm wrap">
                {next && (
                  <button type="button" className="btn sm primary" onClick={() => open(next)}>
                    {st.best.has(next.id) ? '再练一次' : '开始练习'}
                  </button>
                )}
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => navigate(`/practice/run?kind=${k.kind}&new=1&level=${level}`)}
                  title={aiReady ? '让 AI 出一套新题' : '需要先配置 AI'}
                >
                  <Icon name="sparkle" size={14} /> AI 出新题
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {myAISets.length > 0 && (
        <section className="card">
          <h3>AI 出的题（保存在本机）</h3>
          <ul className="record-list">
            {myAISets.map((s) => {
              const b = stats[s.kind].best.get(s.id)
              return (
                <li key={s.id}>
                  <button type="button" className="record-main" onClick={() => open(s)}>
                    <span className="tag review">{kindMeta(s.kind).name}</span>
                    <span className="ellipsis">{s.title}</span>
                    <span className="muted small nowrap">{b ? (b.total ? `${b.score}/${b.total}` : '已完成') : '未做'}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label="删除"
                    onClick={() => {
                      if (!window.confirm(`删除「${s.title}」？`)) return
                      deleteAISet(s.id)
                      setAISets(loadAISets())
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card">
          <h3>最近练习</h3>
          <ul className="record-list">
            {recent.map((r) => (
              <li key={`${r.at}-${r.set}`}>
                <div className="record-main">
                  <span className="tag review">{r.kind === 'mock' ? '模考' : (KINDS.find((k) => k.kind === r.kind)?.name ?? r.kind)}</span>
                  <span className="ellipsis">{r.title}</span>
                  <span className="muted small nowrap">
                    {r.kind === 'mock' ? `${r.score} 分` : r.total ? `${r.score}/${r.total}` : '已完成'} · {formatDate(r.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small about">
        内置题目均为原创，题型和难度参照 2013 年改革后的四六级真题；听力使用设备的语音朗读。点击文章中的单词可以查看释义。
      </p>
    </div>
  )
}
