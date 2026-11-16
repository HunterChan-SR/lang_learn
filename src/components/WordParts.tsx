import { parseExchange, splitPos } from '../lib/books'
import { speak } from '../lib/speech'
import { toggleStar, useAppData, useSettings } from '../lib/store'
import type { Word } from '../lib/types'
import { Icon } from './Icon'

export function SpeakButton({ text, size = 'md' }: { text: string; size?: 'sm' | 'md' | 'lg' }) {
  const settings = useSettings()
  return (
    <button
      type="button"
      className={`icon-btn speak ${size}`}
      aria-label={`朗读 ${text}`}
      onClick={(e) => {
        e.stopPropagation()
        speak(text, settings)
      }}
    >
      <Icon name="speaker" size={size === 'lg' ? 26 : size === 'sm' ? 18 : 22} />
    </button>
  )
}

export function StarButton({ word }: { word: string }) {
  const data = useAppData()
  const on = !!data.starred[word]
  return (
    <button
      type="button"
      className={`icon-btn star${on ? ' on' : ''}`}
      aria-label={on ? '移出生词本' : '加入生词本'}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        toggleStar(word)
      }}
    >
      <Icon name="star" filled={on} />
    </button>
  )
}

export function Phonetic({ p }: { p: string }) {
  if (!p) return null
  return <span className="phonetic">/{p}/</span>
}

export function Meanings({ word }: { word: Word }) {
  return (
    <ul className="meanings">
      {word.t.map((line, i) => {
        const [pos, text] = splitPos(line)
        return (
          <li key={i}>
            {pos && <span className="pos">{pos}</span>}
            <span>{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function Exchange({ word }: { word: Word }) {
  const items = parseExchange(word.x)
  if (items.length === 0) return null
  return (
    <div className="exchange">
      {items.map((it) => (
        <span key={it.label}>
          <em>{it.label}</em> {it.value}
        </span>
      ))}
    </div>
  )
}
