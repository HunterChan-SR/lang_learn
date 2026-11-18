import { isReady, useAIConfig } from '../lib/ai'
import { clearError, deleteNote, generateNote, stopNote, useAINote } from '../lib/aiNotes'
import { confirmDialog } from '../lib/host'
import { navigate } from '../lib/router'
import { speak } from '../lib/speech'
import { useSettings } from '../lib/store'
import type { Word } from '../lib/types'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

/**
 * 「AI 助记」按钮：放在单词旁边。
 * 没有 AI 内容时生成，已有内容时重新生成，生成中可以停止。
 */
export function AIButton({ word, onActivate }: { word: Word; onActivate?: () => void }) {
  const settings = useSettings()
  const cfg = useAIConfig()
  const { note, task } = useAINote(word.w)
  const ready = isReady(cfg)

  const click = (e: React.MouseEvent) => {
    e.stopPropagation()
    onActivate?.()
    if (task) return stopNote(word.w)
    if (!ready) {
      void confirmDialog('还没有配置 AI。现在去「我的 → AI 助手」填写 API Key 吗？', '去设置').then((ok) => ok && navigate('/me?ai=1'))
      return
    }
    void generateNote(word, settings.book)
  }

  const label = task ? '停止' : note ? '重新生成' : 'AI 助记'
  return (
    <button
      type="button"
      className={`ai-btn${task ? ' running' : ''}`}
      onClick={click}
      title={task ? '停止生成' : note ? '让 AI 重新生成助记内容' : '让 AI 生成助记、例句、搭配和辨析'}
    >
      <Icon name={task ? 'stop' : 'sparkle'} size={16} />
      <span>{label}</span>
    </button>
  )
}

const PHASE_TEXT = { waiting: '正在连接…', thinking: '思考中…', writing: '' } as const

/** AI 助记内容：生成中实时显示，生成完成后缓存在本机 */
export function AIPanel({ word }: { word: Word }) {
  const settings = useSettings()
  const { note, task, error } = useAINote(word.w)
  if (!note && !task && !error) return null

  const say = (s: string) => speak(s, settings)
  const text = task ? task.text : (note?.text ?? '')

  return (
    <section className={`ai-panel${task ? ' running' : ''}`} aria-live="polite">
      <header>
        <span className="ai-title">
          <Icon name="sparkle" size={16} /> AI 助记
        </span>
        {task ? (
          <span className="muted small">{PHASE_TEXT[task.phase] || '生成中…'}</span>
        ) : note ? (
          <span className="muted small ellipsis">
            {note.model}
            <button type="button" className="link-btn" onClick={() => void confirmDialog('删除这条 AI 助记？', '删除').then((ok) => ok && deleteNote(word.w))}>
              删除
            </button>
          </span>
        ) : null}
      </header>
      {error && !task && (
        <div className="ai-error">
          <span>{error}</span>
          <div className="row gap-sm">
            <button type="button" className="btn sm" onClick={() => void generateNote(word, settings.book)}>
              重试
            </button>
            {/AI|Key|接口|模型/.test(error) && (
              <button type="button" className="btn sm ghost" onClick={() => navigate('/me?ai=1')}>
                去设置
              </button>
            )}
            <button type="button" className="btn sm ghost" onClick={() => clearError(word.w)}>
              关闭
            </button>
          </div>
        </div>
      )}
      {text ? <Markdown text={text} speak={say} className="ai-md" /> : task && <div className="ai-skeleton" />}
      {note && !task && <p className="ai-foot muted small">内容由 AI 生成，仅供参考；点英文句子可以朗读</p>}
    </section>
  )
}
