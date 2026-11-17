import { firstPos, shortMeaning } from './books'
import { splitByForms, wordForms } from './extras'
import type { Word } from './types'

export type QuizType = 'en2zh' | 'zh2en' | 'cloze' | 'spell' | 'listen'

export const QUIZ_TYPE_LABELS: Record<QuizType, string> = {
  en2zh: '看词选义',
  zh2en: '看义选词',
  cloze: '例句填空',
  spell: '看义拼写',
  listen: '听音拼写',
}

export interface ChoiceQuestion {
  type: 'en2zh' | 'zh2en'
  word: Word
  options: string[]
  answer: number
}

/** 例句填空：句子中的目标词挖空，从 4 个词里选 */
export interface ClozeQuestion {
  type: 'cloze'
  word: Word
  /** [文本, 是否为空格处] */
  parts: [string, boolean][]
  zh: string
  options: string[]
  answer: number
}

export interface SpellQuestion {
  type: 'spell' | 'listen'
  word: Word
}

export type Question = ChoiceQuestion | ClozeQuestion | SpellQuestion

type Rng = () => number

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 挑 3 个干扰项：优先同词性，并且释义/拼写不能和正确答案重复 */
function pickDistractors(target: Word, all: Word[], type: 'en2zh' | 'zh2en' | 'cloze', rng: Rng): Word[] {
  const key = (w: Word) => (type === 'en2zh' ? shortMeaning(w) : w.w.toLowerCase())
  const seen = new Set([key(target)])
  const pos = firstPos(target)
  const picked: Word[] = []
  const tryPick = (pool: Word[], attempts: number) => {
    for (let i = 0; i < attempts && picked.length < 3 && pool.length > 0; i++) {
      const w = pool[Math.floor(rng() * pool.length)]
      const k = key(w)
      if (w.w === target.w || seen.has(k) || !k) continue
      seen.add(k)
      picked.push(w)
    }
  }
  const samePos = pos ? all.filter((w) => firstPos(w) === pos) : []
  tryPick(samePos, 60)
  tryPick(all, 200)
  return picked
}

/**
 * 出题。examples 为单词 -> 例句（例句填空用），没有例句的词改出“看词选义”。
 */
export function buildQuiz(
  pool: Word[],
  all: Word[],
  count: number,
  types: QuizType[],
  rng: Rng = Math.random,
  examples?: Map<string, [string, string][]>,
): Question[] {
  const chosen = shuffle(pool, rng).slice(0, count)
  return chosen.map((word, i) => {
    let type = types[Math.floor(rng() * types.length)] ?? types[i % types.length]
    if (type === 'spell' || type === 'listen') return { type, word }
    if (type === 'cloze') {
      const forms = wordForms(word)
      const usable = (examples?.get(word.w) ?? []).filter(([en]) => splitByForms(en, forms).some(([, hit]) => hit))
      if (usable.length) {
        const [en, zh] = usable[Math.floor(rng() * usable.length)]
        const options = shuffle([word, ...pickDistractors(word, all, 'cloze', rng)], rng)
        return { type, word, parts: splitByForms(en, forms), zh, options: options.map((w) => w.w), answer: options.indexOf(word) }
      }
      type = 'en2zh'
    }
    const options = shuffle([word, ...pickDistractors(word, all, type, rng)], rng)
    return {
      type,
      word,
      options: options.map((w) => (type === 'en2zh' ? shortMeaning(w) : w.w)),
      answer: options.indexOf(word),
    }
  })
}

export function normalizeSpelling(s: string): string {
  return s.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ')
}

export function checkSpelling(input: string, word: Word): boolean {
  return normalizeSpelling(input) === normalizeSpelling(word.w)
}
