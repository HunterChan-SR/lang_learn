import { useRef, type ReactNode } from 'react'
import { AccountCard } from '../components/Account'
import { Icon } from '../components/Icon'
import { BOOKS } from '../lib/books'
import { todayKey } from '../lib/date'
import { speak, speechSupported } from '../lib/speech'
import { exportData, importData, resetProgress, updateSettings, useAppData } from '../lib/store'
import { useSync } from '../lib/sync'
import type { Settings } from '../lib/types'

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={value === o.v ? 'on' : ''} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {desc && <span className="muted small">{desc}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

export function Me() {
  const data = useAppData()
  const signedIn = useSync().auth === 'signedIn'
  const s = data.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Settings>) => updateSettings(patch)

  const doExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `四六级单词-进度-${todayKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const scope = signedIn ? '当前账号（包括云端）' : '当前设备上'
    if (!window.confirm(`导入会覆盖${scope}的全部学习进度，确定继续吗？`)) return
    window.alert(importData(text) ? '导入成功' : '文件格式不正确，导入失败')
  }

  const learned = Object.keys(data.cards).length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="muted small">已学习 {learned} 个单词</div>
          <h1>我的</h1>
        </div>
      </header>

      <AccountCard />

      <section className="card">
        <h3>学习</h3>
        <Row label="词库">
          <Seg value={s.book} options={BOOKS.map((b) => ({ v: b.id, label: b.short }))} onChange={(book) => set({ book })} />
        </Row>
        <Row label="每日新词" desc="复习词数量由记忆算法自动安排">
          <Seg value={s.dailyNew} options={[10, 20, 30, 50].map((v) => ({ v, label: String(v) }))} onChange={(dailyNew) => set({ dailyNew })} />
        </Row>
        <Row label="新词顺序">
          <Seg
            value={s.order}
            options={[
              { v: 'freq', label: '常用优先' },
              { v: 'alpha', label: '字母序' },
              { v: 'random', label: '乱序' },
            ]}
            onChange={(order) => set({ order })}
          />
        </Row>
      </section>

      <section className="card">
        <h3>发音</h3>
        <Row label="口音">
          <Seg
            value={s.accent}
            options={[
              { v: 'us', label: '美音' },
              { v: 'uk', label: '英音' },
            ]}
            onChange={(accent) => set({ accent })}
          />
        </Row>
        <Row label="音源" desc={s.voice === 'youdao' ? '有道词典在线发音，需要联网' : speechSupported ? '设备自带语音，可离线使用' : '当前浏览器不支持系统语音'}>
          <Seg
            value={s.voice}
            options={[
              { v: 'system', label: '系统' },
              { v: 'youdao', label: '在线' },
            ]}
            onChange={(voice) => set({ voice })}
          />
        </Row>
        <Row label="自动发音" desc="显示新单词时自动朗读">
          <label className="switch">
            <input type="checkbox" checked={s.autoPlay} onChange={(e) => set({ autoPlay: e.target.checked })} />
            <span />
          </label>
        </Row>
        <div className="set-row">
          <button className="btn sm" onClick={() => speak('vocabulary', s)}>
            <Icon name="speaker" size={18} /> 试听
          </button>
        </div>
      </section>

      <section className="card">
        <h3>数据</h3>
        <p className="muted small">
          {signedIn
            ? '已登录，进度会自动同步到云端。导出的文件可以作为额外备份。'
            : '未登录时进度只保存在本设备的浏览器里。换设备前可以先导出，再在新设备上导入。'}
        </p>
        <div className="row gap-sm wrap">
          <button className="btn" onClick={doExport}>
            导出进度
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            导入进度
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void doImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              const scope = signedIn ? '（包括云端）' : ''
              if (window.confirm(`确定清空所有学习记录、生词本和错题本${scope}吗？此操作无法撤销。`)) resetProgress()
            }}
          >
            重置进度
          </button>
        </div>
      </section>

      <section className="card about muted small">
        <p>
          词库数据来自开源词典{' '}
          <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">
            ECDICT
          </a>
          （MIT 协议），按 COCA/BNC 词频排序。
        </p>
        <p>快捷键：空格 查看释义 · 1–4 评分 · R 朗读 · S 收藏 · Esc 退出</p>
      </section>
    </div>
  )
}
