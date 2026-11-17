import { useEffect, useId, useRef, useState } from 'react'
import { AI_PRESETS, isReady, listModels, presetOf, saveAIConfig, testAI, useAIConfig, type AIConfig } from '../lib/ai'
import { Icon } from './Icon'

function fromPreset(id: string, keep?: AIConfig | null): AIConfig {
  const p = presetOf(id)
  if (keep && keep.preset === id) return keep
  return { preset: id, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: '', model: p.models[0] ?? '' }
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }

export function AISettings({ highlight = false }: { highlight?: boolean }) {
  const saved = useAIConfig()
  const [form, setForm] = useState<AIConfig>(() => saved ?? fromPreset('deepseek'))
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const ref = useRef<HTMLElement>(null)
  const abort = useRef<AbortController | null>(null)
  const listId = useId()
  const preset = presetOf(form.preset)

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [highlight])

  useEffect(() => () => abort.current?.abort(), [])

  const set = (patch: Partial<AIConfig>) => {
    setForm((f) => ({ ...f, ...patch }))
    setStatus({ kind: 'idle' })
  }

  const choosePreset = (id: string) => {
    setForm(fromPreset(id, saved))
    setModels([])
    setStatus({ kind: 'idle' })
  }

  const run = async <T,>(text: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setStatus({ kind: 'busy', text })
    try {
      return await fn(ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
      return undefined
    }
  }

  const fetchModels = async () => {
    const list = await run('正在获取模型列表…', (signal) => listModels(form, signal))
    if (!list) return
    setModels(list)
    setStatus(list.length ? { kind: 'ok', text: `获取到 ${list.length} 个模型，点击“模型”输入框即可选择` } : { kind: 'error', text: '服务商没有返回模型列表，请手动填写' })
  }

  const saveAndTest = async () => {
    const cfg: AIConfig = { ...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim() }
    if (!isReady(cfg)) {
      setStatus({ kind: 'error', text: '请填写完整：接口地址、API Key 和模型' })
      return
    }
    saveAIConfig(cfg)
    const r = await run('已保存，正在测试连接…', (signal) => testAI(cfg, signal))
    if (r) setStatus({ kind: 'ok', text: `已保存，连接正常（${(r.ms / 1000).toFixed(1)} 秒，回复：${r.reply}）` })
  }

  const clear = () => {
    if (!window.confirm('清除本机保存的 AI 配置（包括 API Key）？')) return
    saveAIConfig(null)
    setForm(fromPreset('deepseek'))
    setModels([])
    setStatus({ kind: 'idle' })
  }

  const suggestions = [...new Set([...preset.models, ...models])]
  const dirty = JSON.stringify(saved) !== JSON.stringify(form)

  return (
    <section ref={ref} className={`card ai-settings${highlight ? ' highlight' : ''}`} id="ai">
      <h3>AI 助手</h3>
      <p className="muted small">
        填入大模型的 API Key 后，可以使用 AI 助记、AI 出题、翻译和作文批改。Key 只保存在这台设备的浏览器里，不会上传、同步或随进度导出。
      </p>

      <label className="field">
        <span>服务商</span>
        <select value={form.preset} onChange={(e) => choosePreset(e.target.value)}>
          {AI_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {(preset.note || preset.keyUrl) && (
        <p className="muted small field-note">
          {preset.note}
          {preset.note && preset.keyUrl && ' · '}
          {preset.keyUrl && (
            <a href={preset.keyUrl} target="_blank" rel="noreferrer">
              获取 API Key
            </a>
          )}
        </p>
      )}

      <label className="field">
        <span>接口地址</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…/v1"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
      </label>

      {form.preset === 'custom' && (
        <label className="field">
          <span>接口协议</span>
          <select value={form.protocol} onChange={(e) => set({ protocol: e.target.value as AIConfig['protocol'] })}>
            <option value="openai">OpenAI 兼容（/chat/completions）</option>
            <option value="anthropic">Anthropic（/v1/messages）</option>
          </select>
        </label>
      )}

      <label className="field">
        <span>API Key</span>
        <div className="input-row">
          <input
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder={form.preset === 'ollama' ? '本机 Ollama 不需要 Key' : 'sk-…'}
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
          <button type="button" className="btn sm ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </label>

      <label className="field">
        <span>模型</span>
        <div className="input-row">
          <input
            list={listId}
            autoComplete="off"
            spellCheck={false}
            placeholder={preset.modelHint ?? '模型名称'}
            value={form.model}
            onChange={(e) => set({ model: e.target.value })}
          />
          <button type="button" className="btn sm ghost" disabled={status.kind === 'busy' || !form.baseUrl.trim()} onClick={() => void fetchModels()}>
            获取列表
          </button>
        </div>
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      {preset.modelHint && <p className="muted small field-note">{preset.modelHint}</p>}

      {status.kind !== 'idle' && (
        <p className={`ai-status ${status.kind}`}>
          {status.kind === 'busy' ? <Icon name="refresh" size={14} /> : status.kind === 'ok' ? <Icon name="check" size={14} /> : <Icon name="close" size={14} />}
          <span>{status.text}</span>
        </p>
      )}

      <div className="row gap-sm wrap">
        <button type="button" className="btn primary" disabled={status.kind === 'busy'} onClick={() => void saveAndTest()}>
          {dirty ? '保存并测试' : '测试连接'}
        </button>
        {saved && (
          <button type="button" className="btn ghost danger" onClick={clear}>
            清除配置
          </button>
        )}
      </div>
      <p className="muted small">
        Kimi、智谱 GLM、Gemini 的官方接口不允许网页直接调用，可以通过 OpenRouter 或硅基流动使用这些模型。
      </p>
    </section>
  )
}
