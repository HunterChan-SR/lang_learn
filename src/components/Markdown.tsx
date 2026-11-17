import type { ReactNode } from 'react'

/**
 * 极简 Markdown 渲染（AI 输出用）：标题、有序/无序列表（含缩进续行）、段落、
 * 引用、分隔线、**粗体**、*斜体*、`代码`。直接生成 React 元素，不使用 innerHTML。
 * 传入 speak 时，以英文为主的句子可以点击朗读。
 */

type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'ul' | 'ol'; items: string[][] }
  | { type: 'p'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' }

function parse(src: string): Block[] {
  const blocks: Block[] = []
  const lines = src.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (!t) {
      i++
      continue
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2].replace(/#+$/, '').trim() })
      i++
      continue
    }
    if (/^([-*_])\1{2,}$/.test(t)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }
    const isUl = (s: string) => /^\s*[-*•]\s+/.test(s)
    const isOl = (s: string) => /^\s*\d+[.)、]\s*/.test(s)
    if (isUl(line) || isOl(line)) {
      const type = isOl(line) ? 'ol' : 'ul'
      const items: string[][] = []
      while (i < lines.length) {
        const l = lines[i]
        if ((type === 'ul' && isUl(l)) || (type === 'ol' && isOl(l))) {
          items.push([l.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '')])
        } else if (l.trim() && /^\s{2,}|^\t/.test(l) && items.length) {
          // 缩进的续行，如例句下一行的中文翻译
          items[items.length - 1].push(l.trim())
        } else if (!l.trim() && i + 1 < lines.length && (type === 'ul' ? isUl(lines[i + 1]) : isOl(lines[i + 1]))) {
          // 列表项之间的空行
        } else break
        i++
      }
      blocks.push({ type, items })
      continue
    }
    if (t.startsWith('>')) {
      const q: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].trim().replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', lines: q })
      continue
    }
    const p: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)、]\s*|>)/.test(lines[i])) {
      p.push(lines[i].trim())
      i++
    }
    if (p.length === 0) {
      p.push(t)
      i++
    }
    blocks.push({ type: 'p', lines: p })
  }
  return blocks
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] ?? m[2]) out.push(<strong key={k++}>{m[1] ?? m[2]}</strong>)
    else if (m[3]) out.push(<em key={k++}>{m[3]}</em>)
    else out.push(<code key={k++}>{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\*(?!\s)(.+?)\*/g, '$1')

/** 以英文为主的句子（用于判断能否朗读） */
export function isEnglish(s: string): boolean {
  const letters = s.match(/[A-Za-z]/g)?.length ?? 0
  const cjk = s.match(/[一-鿿]/g)?.length ?? 0
  return letters >= 8 && cjk === 0
}

function Line({ text, speak }: { text: string; speak?: (s: string) => void }) {
  if (speak && isEnglish(text)) {
    return (
      <span className="md-say" role="button" tabIndex={0} onClick={() => speak(plain(text))} onKeyDown={(e) => e.key === 'Enter' && speak(plain(text))}>
        {inline(text)}
      </span>
    )
  }
  return <>{inline(text)}</>
}

export function Markdown({ text, speak, className = '' }: { text: string; speak?: (s: string) => void; className?: string }) {
  const blocks = parse(text)
  return (
    <div className={`md ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': {
            const Tag = b.level <= 2 ? 'h3' : 'h4'
            return <Tag key={i}>{inline(b.text)}</Tag>
          }
          case 'hr':
            return <hr key={i} />
          case 'quote':
            return (
              <blockquote key={i}>
                {b.lines.map((l, j) => (
                  <p key={j}>{inline(l)}</p>
                ))}
              </blockquote>
            )
          case 'p':
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    <Line text={l} speak={speak} />
                  </span>
                ))}
              </p>
            )
          default: {
            const Tag = b.type
            return (
              <Tag key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    {item.map((l, n) => (
                      <span key={n} className={n > 0 ? 'md-sub' : undefined}>
                        <Line text={l} speak={speak} />
                      </span>
                    ))}
                  </li>
                ))}
              </Tag>
            )
          }
        }
      })}
    </div>
  )
}
