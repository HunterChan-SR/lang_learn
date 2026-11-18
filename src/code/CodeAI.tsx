import { isReady, useAIConfig } from '../lib/ai'
import { clearError, generateNote, stopNote, useAINote } from '../lib/aiNotes'
import { confirmDialog } from '../lib/host'
import { navigate } from '../lib/router'
import { useSettings } from '../lib/store'
import type { Word } from '../lib/types'
import { Cm, L, type LensItem } from './Code'

const PHASE = { waiting: 'connecting…', thinking: 'thinking…', writing: 'generating…' } as const

/** CodeLens 里的 AI 按钮：生成 / 重新生成 / 停止 */
export function useAILens(word: Word): LensItem {
  const settings = useSettings()
  const cfg = useAIConfig()
  const { note, task } = useAINote(word.w)
  if (task) return { label: `■ stop (${PHASE[task.phase]})`, onClick: () => stopNote(word.w), title: '停止生成' }
  return {
    label: note ? '✨ regenerate' : '✨ AI explain',
    title: note ? '让 AI 重新生成助记内容' : '让 AI 生成助记、例句、搭配和辨析',
    onClick: () => {
      if (!isReady(cfg)) {
        void confirmDialog('还没有配置 AI。现在去设置里填写 API Key 吗？', '去设置').then((ok) => ok && navigate('/me?ai=1'))
        return
      }
      void generateNote(word, settings.book)
    },
  }
}

/** AI 助记内容，渲染成文档注释：/** … *\/ */
export function AIComment({ word, i = 0 }: { word: Word; i?: number }) {
  const { note, task, error } = useAINote(word.w)
  if (!note && !task && !error) return null
  const text = task ? task.text : (note?.text ?? '')
  const lines = text ? text.split('\n') : []
  return (
    <>
      <L i={i} />
      <L i={i}>
        <Cm>/**</Cm>
      </L>
      <L i={i}>
        <Cm>
          {' * '}@ai {task ? PHASE[task.phase] : note?.model}
        </Cm>
      </L>
      {error && !task && (
        <L i={i} className="cx-err-line">
          <Cm>{' * '}</Cm>
          <span className="t-err">✗ {error}</span>{' '}
          <button type="button" className="cx-act t-cm" onClick={() => clearError(word.w)}>
            [dismiss]
          </button>
        </L>
      )}
      {lines.map((line, k) => (
        <L key={k} i={i}>
          <Cm>
            {' *'}
            {line ? ` ${line}` : ''}
          </Cm>
        </L>
      ))}
      <L i={i}>
        <Cm>{' */'}</Cm>
      </L>
    </>
  )
}
