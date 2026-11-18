import { useSyncExternalStore } from 'react'
import { netFetch, proxied } from './host'

/**
 * 大模型接入：用户自己填写服务商、地址、API Key 和模型名，浏览器直接调用。
 * 支持两种协议：
 * - openai：OpenAI 兼容的 /chat/completions（DeepSeek、通义千问、豆包、硅基流动、OpenRouter、Ollama 等）
 * - anthropic：Claude Messages API（用官方 SDK，按需加载）
 *
 * 配置只保存在本机 localStorage，不进入学习进度，不会同步到云端或被导出。
 */

export type AIProtocol = 'openai' | 'anthropic'

export interface AIPreset {
  id: string
  name: string
  protocol: AIProtocol
  baseUrl: string
  /** 推荐的模型，第一个为默认值 */
  models: string[]
  /** 获取 API Key 的页面 */
  keyUrl?: string
  note?: string
  modelHint?: string
  /** 官方接口不允许网页跨域调用，只在桌面版显示 */
  desktopOnly?: boolean
}

export const AI_PRESETS: AIPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '价格低，中英文都很好，推荐',
  },
  {
    id: 'qwen',
    name: '通义千问',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-flash', 'qwen-max'],
    keyUrl: 'https://bailian.console.aliyun.com/',
    note: '阿里云百炼，新用户有免费额度',
  },
  {
    id: 'doubao',
    name: '豆包',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [],
    keyUrl: 'https://console.volcengine.com/ark',
    note: '火山方舟，新用户有免费额度',
    modelHint: '填方舟控制台里已开通的模型 ID，或推理接入点 ID（ep-…）',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '聚合多家开源模型，部分模型免费',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    keyUrl: 'https://openrouter.ai/keys',
    note: '一个 Key 调用各家模型，包括 Kimi、GLM、Gemini',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5-mini', 'gpt-5'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    desktopOnly: true,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    desktopOnly: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [],
    keyUrl: 'https://aistudio.google.com/apikey',
    desktopOnly: true,
  },
  {
    id: 'ollama',
    name: '本机 Ollama',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    note: proxied ? '在本机运行 Ollama 即可' : '需先设置环境变量 OLLAMA_ORIGINS=* 再启动 Ollama；仅电脑上可用',
    modelHint: '如 qwen3:8b，需先用 ollama pull 下载',
  },
  {
    id: 'custom',
    name: '其他（OpenAI 兼容）',
    protocol: 'openai',
    baseUrl: '',
    models: [],
    note: '填写服务商提供的 OpenAI 兼容接口地址，一般以 /v1 结尾',
  },
]

/** 当前环境可用的预设 */
export const VISIBLE_PRESETS = AI_PRESETS.filter((p) => !p.desktopOnly || proxied)

export function presetOf(id: string): AIPreset {
  return AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[AI_PRESETS.length - 1]
}

export interface AIConfig {
  preset: string
  protocol: AIProtocol
  baseUrl: string
  apiKey: string
  model: string
}

// ---------------- 配置存储 ----------------

const KEY = 'cet-words:ai'
const listeners = new Set<() => void>()

function read(): AIConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AIConfig> | null
    if (!raw || typeof raw.apiKey !== 'string') return null
    return {
      preset: raw.preset ?? 'custom',
      protocol: raw.protocol === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl: raw.baseUrl ?? '',
      apiKey: raw.apiKey,
      model: raw.model ?? '',
    }
  } catch {
    return null
  }
}

let config = read()

export function getAIConfig(): AIConfig | null {
  return config
}

/** 已填写完整、可以调用 */
export function isReady(c: AIConfig | null): c is AIConfig {
  return !!c && !!c.model.trim() && !!c.baseUrl.trim() && (!!c.apiKey.trim() || c.preset === 'ollama')
}

export function saveAIConfig(next: AIConfig | null) {
  config = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

if (typeof window !== 'undefined') {
  // 其他标签页修改了配置
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      config = read()
      listeners.forEach((l) => l())
    }
  })
}

export function useAIConfig(): AIConfig | null {
  return useSyncExternalStore(subscribe, getAIConfig, getAIConfig)
}

// ---------------- 调用 ----------------

export class AIError extends Error {
  constructor(
    message: string,
    public readonly kind: 'config' | 'auth' | 'network' | 'rate' | 'server' | 'format' | 'refused' | 'aborted' | 'other' = 'other',
  ) {
    super(message)
    this.name = 'AIError'
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatPhase = 'waiting' | 'thinking' | 'writing'

export interface ChatOptions {
  system?: string
  messages: ChatMessage[]
  signal?: AbortSignal
  /** 每收到一段输出就回调一次，参数为目前为止的完整文本 */
  onText?: (text: string) => void
  onPhase?: (phase: ChatPhase) => void
  config?: AIConfig
}

function normalizeBase(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/v1\/messages$/, '')
}

/** 部分模型（Qwen3、DeepSeek-R1 等）会把思考过程放在 <think> 标签里输出 */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>\s*|$)/g, '').replace(/^\s+/, '')
}

/** 网页版是 HTTPS 页面，浏览器会直接拦截对 http:// 地址的请求（本机 localhost 除外），提前给出明确的提示 */
function blockedByBrowser(cfg: AIConfig): AIError | null {
  if (proxied || typeof location === 'undefined' || location.protocol !== 'https:') return null
  let host: string
  try {
    const u = new URL(normalizeBase(cfg.baseUrl))
    if (u.protocol !== 'http:') return null
    host = u.hostname
  } catch {
    return null
  }
  if (host === 'localhost' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host)) return null
  return new AIError(
    '网页版是 HTTPS 页面，浏览器不允许它访问 http:// 开头的接口（本机 localhost 除外）。请改用桌面版，或者给接口配置 HTTPS 并允许跨域访问',
    'network',
  )
}

export async function chat(opts: ChatOptions): Promise<string> {
  const cfg = opts.config ?? config
  if (!isReady(cfg)) throw new AIError('还没有配置 AI，请先到「我的 → AI 助手」填写', 'config')
  const blocked = blockedByBrowser(cfg)
  if (blocked) throw blocked
  opts.onPhase?.('waiting')
  try {
    const text = cfg.protocol === 'anthropic' ? await chatAnthropic(cfg, opts) : await chatOpenAI(cfg, opts)
    if (!text.trim()) throw new AIError('模型没有返回内容，请重试或换一个模型', 'format')
    return text
  } catch (e) {
    throw await toAIError(e, opts.signal)
  }
}

async function chatOpenAI(cfg: AIConfig, opts: ChatOptions): Promise<string> {
  const messages = [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...opts.messages]
  const res = await netFetch(`${normalizeBase(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model.trim(), messages, stream: true }),
    signal: opts.signal,
  })
  if (!res.ok) throw await httpError(res)

  // 个别服务忽略 stream 参数，直接返回完整 JSON
  if (!res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = stripThink(j.choices?.[0]?.message?.content ?? '')
    opts.onText?.(text)
    return text
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let raw = ''
  let phase: ChatPhase = 'waiting'
  const setPhase = (p: ChatPhase) => {
    if (p !== phase) opts.onPhase?.((phase = p))
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let j: {
        error?: { message?: string }
        choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[]
      }
      try {
        j = JSON.parse(data)
      } catch {
        continue
      }
      if (j.error) throw new AIError(j.error.message ?? '服务返回错误', 'server')
      const d = j.choices?.[0]?.delta
      if (d?.reasoning_content || d?.reasoning) setPhase('thinking')
      if (d?.content) {
        raw += d.content
        const shown = stripThink(raw)
        setPhase(shown ? 'writing' : 'thinking')
        if (shown) opts.onText?.(shown)
      }
    }
  }
  return stripThink(raw)
}

/** 这些 Claude 模型支持服务端备用模型：主模型因安全策略拒答时自动换模型重试 */
const FALLBACK_MODELS = /^claude-(fable-5-[12]|opus-5-5|opus-5|sonnet-5-5)$/

async function chatAnthropic(cfg: AIConfig, opts: ChatOptions): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const base = normalizeBase(cfg.baseUrl)
  const client = new Anthropic({
    apiKey: cfg.apiKey.trim(),
    baseURL: base || undefined,
    // 用户在自己的浏览器里使用自己的 Key
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    fetch: netFetch,
  })
  const model = cfg.model.trim()
  const params = {
    model,
    max_tokens: 16000,
    ...(opts.system ? { system: opts.system } : {}),
    messages: opts.messages,
  }
  const official = /^https:\/\/api\.anthropic\.com$/.test(base)
  const onThinking = () => opts.onPhase?.('thinking')
  const onText = (_delta: string, snapshot: string) => {
    opts.onPhase?.('writing')
    opts.onText?.(snapshot)
  }
  let msg: { stop_reason: string | null; content: { type: string; text?: string }[] }
  if (official && FALLBACK_MODELS.test(model)) {
    const stream = client.beta.messages.stream(
      { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
      { signal: opts.signal },
    )
    stream.on('thinking', onThinking).on('text', onText)
    msg = await stream.finalMessage()
  } else {
    const stream = client.messages.stream(params, { signal: opts.signal })
    stream.on('thinking', onThinking).on('text', onText)
    msg = await stream.finalMessage()
  }
  if (msg.stop_reason === 'refusal') throw new AIError('模型拒绝回答这个请求，可以换个说法再试', 'refused')
  let text = ''
  for (const block of msg.content) if (block.type === 'text') text += block.text ?? ''
  return text
}

async function httpError(res: Response): Promise<AIError> {
  let detail = ''
  try {
    const body = await res.text()
    try {
      const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
      detail = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? ''
    } catch {
      detail = body.slice(0, 200)
    }
  } catch {
    // ignore
  }
  return statusError(res.status, detail)
}

function statusError(status: number, detail: string): AIError {
  const tail = detail ? `（${detail.slice(0, 160)}）` : ''
  if (status === 401 || status === 403) return new AIError(`API Key 无效或没有权限${tail}`, 'auth')
  if (status === 402) return new AIError(`账户余额不足${tail}`, 'auth')
  if (status === 404) return new AIError(`接口地址或模型名不正确${tail}`, 'config')
  if (status === 400 || status === 422) return new AIError(`请求被拒绝，请检查模型名${tail}`, 'config')
  if (status === 429) return new AIError(`请求太频繁或额度已用完，请稍后再试${tail}`, 'rate')
  if (status >= 500) return new AIError(`服务暂时不可用（${status}），请稍后再试`, 'server')
  return new AIError(`请求失败（${status}）${tail}`, 'other')
}

async function toAIError(e: unknown, signal?: AbortSignal): Promise<AIError> {
  if (e instanceof AIError) return e
  if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return new AIError('已停止', 'aborted')
  const err = e as { name?: string; status?: number; message?: string; error?: { error?: { message?: string } } }
  // Anthropic SDK 的错误：带 HTTP 状态码
  if (typeof err?.status === 'number') return statusError(err.status, err.error?.error?.message ?? '')
  if (err?.name === 'APIUserAbortError') return new AIError('已停止', 'aborted')
  if (err?.name === 'APIConnectionError' || err?.name === 'APIConnectionTimeoutError' || e instanceof TypeError) {
    return new AIError(
      proxied
        ? '无法连接到服务：请检查网络和接口地址'
        : '无法连接到服务：请检查网络和接口地址。网页版只能访问允许跨域的接口，Kimi、智谱、Gemini 官方接口和多数自建网关都不允许，可以改用桌面版',
      'network',
    )
  }
  return new AIError(err?.message || '未知错误', 'other')
}

/** 从模型输出中取出 JSON（容忍 ```json 代码块和前后多余文字） */
export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.search(/[[{]/)
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
  if (start < 0 || end < start) throw new AIError('模型返回的格式不正确，请重试', 'format')
  try {
    return JSON.parse(body.slice(start, end + 1)) as T
  } catch {
    throw new AIError('模型返回的格式不正确，请重试', 'format')
  }
}

/** 要求模型返回 JSON；格式不对时自动追问一次 */
export async function chatJSON<T>(opts: ChatOptions, validate: (v: unknown) => T): Promise<T> {
  const first = await chat(opts)
  try {
    return validate(extractJSON(first))
  } catch (e) {
    if (opts.signal?.aborted) throw e
    const retry = await chat({
      ...opts,
      messages: [
        ...opts.messages,
        { role: 'assistant', content: first },
        { role: 'user', content: '你的输出不是符合要求的 JSON。请严格按照要求的结构重新输出，只输出 JSON，不要任何其他文字。' },
      ],
    })
    return validate(extractJSON(retry))
  }
}

/** 获取服务商提供的模型列表 */
export async function listModels(cfg: AIConfig, signal?: AbortSignal): Promise<string[]> {
  const blocked = blockedByBrowser(cfg)
  if (blocked) throw blocked
  try {
    if (cfg.protocol === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({
        apiKey: cfg.apiKey.trim(),
        baseURL: normalizeBase(cfg.baseUrl) || undefined,
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
        fetch: netFetch,
      })
      const ids: string[] = []
      for await (const m of client.models.list({ limit: 100 }, { signal })) ids.push(m.id)
      return ids
    }
    const res = await netFetch(`${normalizeBase(cfg.baseUrl)}/models`, {
      headers: cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {},
      signal,
    })
    if (!res.ok) throw await httpError(res)
    const j = (await res.json()) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] }
    const list = (j.data ?? j.models ?? []).map((m) => m.id ?? (m as { name?: string }).name ?? '').filter(Boolean)
    return [...new Set(list)].sort((a, b) => a.localeCompare(b))
  } catch (e) {
    throw await toAIError(e, signal)
  }
}

/** 测试连接：发一句很短的话，返回耗时 */
export async function testAI(cfg: AIConfig, signal?: AbortSignal): Promise<{ ms: number; reply: string }> {
  const t0 = performance.now()
  const reply = await chat({
    config: cfg,
    signal,
    messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
  })
  return { ms: Math.round(performance.now() - t0), reply: reply.trim().slice(0, 40) }
}
