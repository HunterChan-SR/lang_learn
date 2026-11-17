import { useSyncExternalStore } from 'react'
import { AIError, chat, getAIConfig, type ChatPhase } from './ai'
import type { BookId, Word } from './types'

/**
 * AI 助记：为单词生成记忆卡片（助记、例句、搭配、辨析、词族、考点），Markdown 格式。
 * 结果缓存在本机，再次点击按钮会重新生成并覆盖。
 * 生成过程放在模块里而不是组件里：关掉单词详情也会继续生成并保存。
 */

export interface AINote {
  text: string
  model: string
  at: number
}

export interface AITask {
  text: string
  phase: ChatPhase
  controller: AbortController
}

const KEY = 'cet-words:ai-notes'
const MAX_NOTES = 600

function load(): Record<string, AINote> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, AINote>) : {}
  } catch {
    return {}
  }
}

let notes = load()
const tasks = new Map<string, AITask>()
const errors = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

function persist() {
  const entries = Object.entries(notes)
  if (entries.length > MAX_NOTES) {
    entries.sort((a, b) => b[1].at - a[1].at)
    notes = Object.fromEntries(entries.slice(0, MAX_NOTES))
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(notes))
  } catch {
    // 空间不足时丢掉最旧的一半再试
    const keep = Object.entries(notes)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, Math.floor(MAX_NOTES / 2))
    notes = Object.fromEntries(keep)
    try {
      localStorage.setItem(KEY, JSON.stringify(notes))
    } catch {
      // ignore
    }
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

const getVersion = () => version

export interface AINoteState {
  note: AINote | null
  task: AITask | null
  error: string | null
}

export function useAINote(word: string): AINoteState {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return { note: notes[word] ?? null, task: tasks.get(word) ?? null, error: errors.get(word) ?? null }
}

export function hasAINote(word: string): boolean {
  return !!notes[word]
}

const SYSTEM = `你是一位经验丰富的大学英语四六级辅导老师，擅长用词根词缀、联想和真实语境帮学生又快又牢地记住单词。
要求：用简体中文讲解；英文例句地道自然，话题贴近四六级考试（校园生活、科技、环境、健康、社会、文化、经济等）；内容准确，不编造不存在的词义和搭配；简洁，不写客套话。`

function prompt(word: Word, book: BookId): string {
  const level = book === 'cet6' ? '六级' : '四级'
  return `请为${level}单词「${word.w}」${word.p ? ` /${word.p}/` : ''}写一张记忆卡片。
词典释义：
${word.t.join('\n')}

严格按下面的 Markdown 结构输出，标题照抄，不要输出其他内容：

### 助记
1~3 行。优先用词根词缀拆解，例如“ab-（离开）+ bandon（控制）→ 脱离控制 → 放弃”；拆不出时用联想或画面记忆。不要用生硬的中文谐音。

### 核心含义
一句话说清最常用的意思、语气和使用场景。

### 例句
1. 英文例句，目标词用 **加粗**
   中文翻译
共 3 句，难度接近四六级阅读，尽量覆盖不同含义或词性。

### 常用搭配
- 英文搭配 —— 中文
4~6 个，优先写作和翻译中常用的。

### 近义辨析
1~2 个最容易混淆的词，每个一行说明区别；没有就写“无”。

### 词族
- 派生词 (词性) 中文
3~6 个同根派生词；没有就写“无”。

### 考点
1~2 条：这个词在四六级选词填空、阅读或翻译中常见的考法或易错点。`
}

export async function generateNote(word: Word, book: BookId): Promise<void> {
  if (tasks.has(word.w)) return
  const cfg = getAIConfig()
  const controller = new AbortController()
  const task: AITask = { text: '', phase: 'waiting', controller }
  tasks.set(word.w, task)
  errors.delete(word.w)
  emit()
  try {
    const text = await chat({
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt(word, book) }],
      signal: controller.signal,
      onPhase: (phase) => {
        tasks.set(word.w, { ...tasks.get(word.w)!, phase })
        emit()
      },
      onText: (t) => {
        tasks.set(word.w, { ...tasks.get(word.w)!, text: t, phase: 'writing' })
        emit()
      },
    })
    notes = { ...notes, [word.w]: { text: text.trim(), model: cfg?.model ?? '', at: Date.now() } }
    persist()
  } catch (e) {
    const err = e instanceof AIError ? e : new AIError(String(e))
    if (err.kind !== 'aborted') errors.set(word.w, err.message)
  } finally {
    tasks.delete(word.w)
    emit()
  }
}

export function stopNote(word: string) {
  tasks.get(word)?.controller.abort()
}

export function deleteNote(word: string) {
  if (!notes[word]) return
  const next = { ...notes }
  delete next[word]
  notes = next
  persist()
  emit()
}

export function clearError(word: string) {
  if (errors.delete(word)) emit()
}
