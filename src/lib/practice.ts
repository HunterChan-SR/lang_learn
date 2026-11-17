/**
 * 四六级题型练习：题目数据结构、内置题库加载、AI 生成题目的校验与本机保存、客观题判分。
 * 题型按 2013 年改革后的真题结构：选词填空、长篇阅读（段落匹配）、仔细阅读、听力、翻译、写作。
 */

export type Level = 'cet4' | 'cet6'
export type PracticeKind = 'banked' | 'matching' | 'reading' | 'listening' | 'translation' | 'writing'

export interface KindMeta {
  kind: PracticeKind
  name: string
  section: string
  desc: string
  /** 建议用时（分钟） */
  minutes: number
}

export const KINDS: KindMeta[] = [
  { kind: 'listening', name: '听力', section: '听力理解', desc: '新闻、长对话、短文、讲座，语音朗读', minutes: 10 },
  { kind: 'banked', name: '选词填空', section: '阅读 A 节', desc: '15 个词选 10 个填入短文', minutes: 10 },
  { kind: 'matching', name: '长篇阅读', section: '阅读 B 节', desc: '10 个句子匹配到对应段落', minutes: 15 },
  { kind: 'reading', name: '仔细阅读', section: '阅读 C 节', desc: '短文 + 5 道单选题', minutes: 10 },
  { kind: 'translation', name: '翻译', section: '段落汉译英', desc: 'AI 按评分标准打分并给出修改', minutes: 30 },
  { kind: 'writing', name: '写作', section: '短文写作', desc: 'AI 按评分标准打分并给出范文', minutes: 30 },
]

export function kindMeta(kind: PracticeKind): KindMeta {
  return KINDS.find((k) => k.kind === kind)!
}

export const isKind = (s: string | null): s is PracticeKind => KINDS.some((k) => k.kind === s)

export interface AIMeta {
  model: string
  at: number
}

interface Base {
  id: string
  level: Level
  title: string
  topic?: string
  /** AI 生成的题目才有 */
  ai?: AIMeta
}

export interface MCQ {
  q: string
  options: string[]
  answer: number
  explanation?: string
}

export interface BankedSet extends Base {
  kind: 'banked'
  /** 空格写作 {{1}}…{{10}} */
  passage: string
  options: string[]
  answers: number[]
  explanations?: string[]
}

export interface MatchingSet extends Base {
  kind: 'matching'
  paragraphs: string[]
  statements: string[]
  answers: number[]
  explanations?: string[]
}

export interface ReadingSet extends Base {
  kind: 'reading'
  passage: string
  questions: MCQ[]
}

export type ListeningType = 'news' | 'conversation' | 'passage' | 'lecture'
export type Speaker = 'M' | 'W' | 'N'

export interface ListeningSet extends Base {
  kind: 'listening'
  type: ListeningType
  script: { speaker: Speaker; text: string }[]
  questions: MCQ[]
}

export interface TranslationSet extends Base {
  kind: 'translation'
  source: string
  reference?: string
  keywords?: [string, string][]
}

export interface WritingSet extends Base {
  kind: 'writing'
  type?: string
  directions: string
  minWords: number
  maxWords: number
  outline?: string[]
  sample?: string
}

export type PracticeSet = BankedSet | MatchingSet | ReadingSet | ListeningSet | TranslationSet | WritingSet

export const LISTENING_TYPES: Record<ListeningType, string> = {
  news: '新闻',
  conversation: '长对话',
  passage: '短文',
  lecture: '讲座',
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// ---------------- 校验（内置题库和 AI 输出共用） ----------------

class InvalidSet extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new InvalidSet(`缺少 ${name}`)
  return v.trim()
}
const strs = (v: unknown, name: string, min: number): string[] => {
  if (!Array.isArray(v) || v.length < min || !v.every((x) => typeof x === 'string' && x.trim())) {
    throw new InvalidSet(`${name} 格式不正确`)
  }
  return v.map((x: string) => x.trim())
}

/** 答案可能是序号、字母（A/B/…）或选项原文 */
function toIndex(v: unknown, options: number | string[], name: string): number {
  const n = typeof options === 'number' ? options : options.length
  let idx = -1
  if (typeof v === 'number' && Number.isInteger(v)) idx = v
  else if (typeof v === 'string') {
    const t = v.trim()
    if (/^[A-Za-z]$/.test(t)) idx = LETTERS.indexOf(t.toUpperCase())
    else if (/^\d+$/.test(t)) idx = Number(t)
    else if (Array.isArray(options)) idx = options.findIndex((o) => o.toLowerCase() === t.toLowerCase())
  }
  if (idx < 0 || idx >= n) throw new InvalidSet(`${name} 超出范围`)
  return idx
}

function mcqs(v: unknown, min: number): MCQ[] {
  if (!Array.isArray(v) || v.length < min) throw new InvalidSet('题目数量不足')
  return v.map((raw, i) => {
    if (!isObj(raw)) throw new InvalidSet('题目格式不正确')
    const options = strs(raw.options, `第 ${i + 1} 题选项`, 4).slice(0, 4).map((o) => o.replace(/^[A-D][.)．、]\s*/, ''))
    return {
      q: str(raw.q ?? raw.question, `第 ${i + 1} 题题干`),
      options,
      answer: toIndex(raw.answer, options, `第 ${i + 1} 题答案`),
      explanation: typeof raw.explanation === 'string' ? raw.explanation : undefined,
    }
  })
}

const level = (v: unknown, fallback: Level): Level => (v === 'cet4' || v === 'cet6' ? v : fallback)

export function validateSet(kind: PracticeKind, raw: unknown, fallbackLevel: Level = 'cet4'): PracticeSet {
  if (!isObj(raw)) throw new InvalidSet('题目格式不正确')
  const base = {
    id: typeof raw.id === 'string' ? raw.id : '',
    level: level(raw.level, fallbackLevel),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '未命名',
    topic: typeof raw.topic === 'string' ? raw.topic : undefined,
    ai: isObj(raw.ai) ? (raw.ai as unknown as AIMeta) : undefined,
  }
  switch (kind) {
    case 'banked': {
      const passage = str(raw.passage, '短文')
      const options = strs(raw.options, '词库', 15).slice(0, 15)
      if (!Array.isArray(raw.answers) || raw.answers.length < 10) throw new InvalidSet('答案数量不足')
      const answers = raw.answers.slice(0, 10).map((a, i) => toIndex(a, options, `第 ${i + 1} 空答案`))
      if (new Set(answers).size !== 10) throw new InvalidSet('答案重复')
      for (let i = 1; i <= 10; i++) if (!passage.includes(`{{${i}}}`)) throw new InvalidSet(`短文缺少第 ${i} 空`)
      return { ...base, kind, passage, options, answers, explanations: Array.isArray(raw.explanations) ? (raw.explanations as string[]) : undefined }
    }
    case 'matching': {
      const paragraphs = strs(raw.paragraphs, '段落', 6).map((p) => p.replace(/^\[?[A-Z]\]?[.)．、]\s+/, ''))
      const statements = strs(raw.statements, '句子', 5)
      if (!Array.isArray(raw.answers) || raw.answers.length !== statements.length) throw new InvalidSet('答案数量不对')
      const answers = raw.answers.map((a, i) => toIndex(a, paragraphs.length, `第 ${i + 1} 句答案`))
      return { ...base, kind, paragraphs, statements, answers, explanations: Array.isArray(raw.explanations) ? (raw.explanations as string[]) : undefined }
    }
    case 'reading':
      return { ...base, kind, passage: str(raw.passage, '短文'), questions: mcqs(raw.questions, 3) }
    case 'listening': {
      if (!Array.isArray(raw.script) || raw.script.length === 0) throw new InvalidSet('缺少听力原文')
      const script = raw.script.map((s) => {
        if (!isObj(s)) throw new InvalidSet('听力原文格式不正确')
        const sp = String(s.speaker ?? 'N').toUpperCase()
        return { speaker: (sp === 'M' || sp === 'W' ? sp : 'N') as Speaker, text: str(s.text, '听力原文') }
      })
      const type = (['news', 'conversation', 'passage', 'lecture'] as const).find((t) => t === raw.type) ?? 'passage'
      return { ...base, kind, type, script, questions: mcqs(raw.questions, 2) }
    }
    case 'translation':
      return {
        ...base,
        kind,
        source: str(raw.source, '中文原文'),
        reference: typeof raw.reference === 'string' ? raw.reference : undefined,
        keywords: Array.isArray(raw.keywords) ? (raw.keywords as [string, string][]) : undefined,
      }
    case 'writing': {
      const lv = base.level
      return {
        ...base,
        kind,
        type: typeof raw.type === 'string' ? raw.type : undefined,
        directions: str(raw.directions, '写作要求'),
        minWords: typeof raw.minWords === 'number' ? raw.minWords : lv === 'cet6' ? 150 : 120,
        maxWords: typeof raw.maxWords === 'number' ? raw.maxWords : lv === 'cet6' ? 200 : 180,
        outline: Array.isArray(raw.outline) ? (raw.outline as string[]) : undefined,
        sample: typeof raw.sample === 'string' ? raw.sample : undefined,
      }
    }
  }
}

// ---------------- 内置题库 ----------------

const bankCache = new Map<PracticeKind, Promise<PracticeSet[]>>()

export function loadBank(kind: PracticeKind): Promise<PracticeSet[]> {
  let p = bankCache.get(kind)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/practice/${kind}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`题库加载失败（${r.status}）`)
        return r.json() as Promise<unknown[]>
      })
      .then((rows) =>
        rows.flatMap((row) => {
          try {
            return [validateSet(kind, row)]
          } catch {
            return []
          }
        }),
      )
    p.catch(() => bankCache.delete(kind))
    bankCache.set(kind, p)
  }
  return p
}

// ---------------- AI 生成的题目（只保存在本机） ----------------

const AI_KEY = 'cet-words:ai-sets'
const MAX_AI_SETS = 40

export function loadAISets(): PracticeSet[] {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_KEY) ?? '[]') as { kind: PracticeKind }[]
    return raw.flatMap((r) => {
      try {
        return isKind(r.kind) ? [validateSet(r.kind, r)] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

export function saveAISet(set: PracticeSet) {
  const list = [set, ...loadAISets().filter((s) => s.id !== set.id)].slice(0, MAX_AI_SETS)
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(list))
  } catch {
    // 空间不足时只保留一半
    try {
      localStorage.setItem(AI_KEY, JSON.stringify(list.slice(0, MAX_AI_SETS / 2)))
    } catch {
      // ignore
    }
  }
}

export function deleteAISet(id: string) {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(loadAISets().filter((s) => s.id !== id)))
  } catch {
    // ignore
  }
}

export async function findSet(kind: PracticeKind, id: string): Promise<PracticeSet | null> {
  if (id.startsWith('ai-')) return loadAISets().find((s) => s.id === id && s.kind === kind) ?? null
  return (await loadBank(kind)).find((s) => s.id === id) ?? null
}

// ---------------- 判分与工具 ----------------

/** 题目数（客观题）；翻译和写作按 15 分制 */
export function totalOf(set: PracticeSet): number {
  switch (set.kind) {
    case 'banked':
      return set.answers.length
    case 'matching':
      return set.answers.length
    case 'reading':
    case 'listening':
      return set.questions.length
    default:
      return 15
  }
}

/** 客观题判分：返回每题是否正确 */
export function gradeObjective(set: PracticeSet, picks: (number | null)[]): boolean[] {
  switch (set.kind) {
    case 'banked':
    case 'matching':
      return set.answers.map((a, i) => picks[i] === a)
    case 'reading':
    case 'listening':
      return set.questions.map((q, i) => picks[i] === q.answer)
    default:
      return []
  }
}

/** 英文单词数（写作字数统计） */
export function countWords(text: string): number {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0
}

export function newSetId(): string {
  return `ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
