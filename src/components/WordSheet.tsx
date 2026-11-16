import { useEffect } from 'react'
import { dayIndex, formatDue, formatInterval } from '../lib/date'
import { wordStatus } from '../lib/srs'
import { removeWrong, useAppData } from '../lib/store'
import type { Word } from '../lib/types'
import { Icon } from './Icon'
import { Exchange, Meanings, Phonetic, SpeakButton, StarButton } from './WordParts'

const STATUS_TEXT = { new: '未学习', learning: '学习中', mastered: '已掌握' } as const

/** 单词详情：手机上是底部弹层，iPad/PC 上是居中对话框 */
export function WordSheet({ word, onClose }: { word: Word; onClose: () => void }) {
  const data = useAppData()
  const card = data.cards[word.w]
  const wrong = data.wrong[word.w]
  const status = wordStatus(card)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={word.w} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <h2 className="sheet-word">{word.w}</h2>
            <div className="row gap-sm">
              <Phonetic p={word.p} />
              <SpeakButton text={word.w} />
            </div>
          </div>
          <div className="row">
            <StarButton word={word.w} />
            <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <Meanings word={word} />
        <Exchange word={word} />
        <div className="sheet-stats">
          <div>
            <span className={`dot ${status}`} />
            {STATUS_TEXT[status]}
          </div>
          {card && (
            <>
              <div>下次复习：{formatDue(card.due, dayIndex())}</div>
              <div>当前间隔：{formatInterval(card.ivl)}</div>
              <div>复习次数：{card.seen}</div>
              {card.lapses > 0 && <div>遗忘次数：{card.lapses}</div>}
            </>
          )}
        </div>
        {wrong && (
          <div className="sheet-wrong">
            <span>测验中答错 {wrong.n} 次，再连续答对 {2 - wrong.streak} 次将移出错题本</span>
            <button type="button" className="btn ghost sm" onClick={() => removeWrong(word.w)}>
              移出错题本
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
