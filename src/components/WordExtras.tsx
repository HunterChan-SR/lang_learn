import { useState } from 'react'
import { splitByForms, useWordExtra, wordForms, type WordExtra } from '../lib/extras'
import { speak } from '../lib/speech'
import { useSettings } from '../lib/store'
import type { Word } from '../lib/types'
import { Icon } from './Icon'

/** 例句：目标词高亮，点击朗读 */
export function Example({ en, zh, forms }: { en: string; zh: string; forms: string[] }) {
  const settings = useSettings()
  return (
    <li className="example">
      <button type="button" className="example-en" onClick={() => speak(en, settings)} aria-label={`朗读：${en}`}>
        {splitByForms(en, forms).map(([t, hit], i) => (hit ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>))}
        <Icon name="speaker" size={15} />
      </button>
      <span className="example-zh">{zh}</span>
    </li>
  )
}

export function Badges({ extra }: { extra: WordExtra | null }) {
  if (!extra || (!extra.collins && !extra.oxford)) return null
  return (
    <div className="badges">
      {extra.collins > 0 && (
        <span className="badge" title="柯林斯词典星级，星越多越常用">
          柯林斯 {'★'.repeat(extra.collins)}
        </span>
      )}
      {extra.oxford && (
        <span className="badge" title="牛津 3000 核心词">
          牛津核心词
        </span>
      )}
    </div>
  )
}

function Roots({ extra, word }: { extra: WordExtra; word: string }) {
  return (
    <ul className="roots">
      {extra.roots.map((r) => (
        <li key={r.key}>
          <div>
            <span className="root-key">{r.key}</span>
            <span className="muted small">{r.kind}</span>
            <span className="root-mean">{r.meaning}</span>
          </div>
          <div className="root-family small">
            {r.examples
              .filter((e) => e.toLowerCase() !== word.toLowerCase())
              .slice(0, 7)
              .map((e) => (
                <span key={e}>{e}</span>
              ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Groups({ extra, word }: { extra: WordExtra; word: string }) {
  return (
    <div className="syn-groups">
      {extra.groups.map((g, i) => (
        <div key={i} className="syn">
          {g.intro && <p className="muted small">{g.intro}</p>}
          <ul>
            {g.items.map(([w, d]) => (
              <li key={w} className={w.toLowerCase() === word.toLowerCase() ? 'self' : undefined}>
                <strong>{w}</strong> {d}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="x-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

/** 单词详情里的完整增强资料 */
export function WordExtras({ word, extra }: { word: Word; extra: WordExtra | null }) {
  if (!extra) return null
  const forms = wordForms(word)
  const empty = !extra.examples.length && !extra.phrases.length && !extra.roots.length && !extra.groups.length && !extra.defs.length
  if (empty) return null
  return (
    <div className="extras">
      {extra.examples.length > 0 && (
        <Section title="例句">
          <ul className="examples">
            {extra.examples.map(([en, zh]) => (
              <Example key={en} en={en} zh={zh} forms={forms} />
            ))}
          </ul>
        </Section>
      )}
      {extra.phrases.length > 0 && (
        <Section title="常用短语">
          <ul className="phrases">
            {extra.phrases.map(([p, m]) => (
              <li key={p}>
                <strong>{p}</strong>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {extra.roots.length > 0 && (
        <Section title="词根词缀">
          <Roots extra={extra} word={word.w} />
        </Section>
      )}
      {extra.groups.length > 0 && (
        <Section title="近义词辨析">
          <Groups extra={extra} word={word.w} />
        </Section>
      )}
      {extra.defs.length > 0 && (
        <Section title="英英释义">
          <ul className="defs">
            {extra.defs.map((d) => (
              <li key={d} lang="en">
                {d}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/** 学习卡片上的精简版：一条例句 + 词根，其余折叠 */
export function StudyExtras({ word }: { word: Word }) {
  const { extra } = useWordExtra(word.w)
  const [more, setMore] = useState(false)
  if (!extra) return null
  const forms = wordForms(word)
  const [first, ...rest] = extra.examples
  const hasMore = rest.length > 0 || extra.phrases.length > 0 || extra.groups.length > 0 || extra.defs.length > 0
  return (
    <div className="study-extras">
      <Badges extra={extra} />
      {first && (
        <ul className="examples">
          <Example en={first[0]} zh={first[1]} forms={forms} />
        </ul>
      )}
      {extra.roots.length > 0 && <Roots extra={{ ...extra, roots: extra.roots.slice(0, 2) }} word={word.w} />}
      {hasMore &&
        (more ? (
          <WordExtras word={word} extra={{ ...extra, examples: rest, roots: [] }} />
        ) : (
          <button type="button" className="more-btn" onClick={() => setMore(true)}>
            更多例句、短语和辨析 <Icon name="down" size={16} />
          </button>
        ))}
    </div>
  )
}
