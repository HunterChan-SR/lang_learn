import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { WordSheet } from '../components/WordSheet'
import { shortMeaning, useAllWords, type BookState } from '../lib/books'
import { navigate } from '../lib/router'
import { speak } from '../lib/speech'
import { wordStatus } from '../lib/srs'
import { toggleStar, useAppData } from '../lib/store'
import type { Word } from '../lib/types'
import { useWordList, WORD_FILTERS, wordFilterOf } from '../lib/useWords'
import { Cm, Code, Ghost, JK, L, Lens, N, S } from './Code'

const PAGE = 120

/**
 * 词库：words.json。
 * 单词的学习状态画在行号旁边（像版本控制的修改标记）：蓝色学习中，绿色已掌握；生词本为行首的星标。
 */
export function CodeWords({ book, query }: { book: BookState; query: URLSearchParams }) {
  const data = useAppData()
  const all = useAllWords()
  const filter = wordFilterOf(query.get('f'))
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim().toLowerCase())
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<Word | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const { counts, list } = useWordList(book.words, all, data, filter, q)

  useEffect(() => {
    setLimit(PAGE)
  }, [filter, q])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list])

  const shown = list.slice(0, limit)
  const say = (w: string) => speak(w, data.settings)

  return (
    <Code>
      <L>{'{'}</L>
      <L i={1}>
        <JK>book</JK>: <S q={'"'}>{data.settings.book}</S>,
      </L>
      <Lens
        i={1}
        items={WORD_FILTERS.map((f) => ({
          label: `${f.id === filter ? '● ' : ''}${f.id} ${counts[f.id]}`,
          onClick: f.id === filter ? undefined : () => navigate(f.id === 'all' ? '/words' : `/words?f=${f.id}`, true),
          title: f.label,
        }))}
      />
      <L i={1}>
        <JK>filter</JK>: <S q={'"'}>{filter}</S>,
      </L>
      <L i={1}>
        <JK>query</JK>:{' '}
        <span className="t-s">
          "
          <input
            className="cx-input"
            style={{ width: `${Math.max(search.length, 14) + 1}ch` }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索英文或中文…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="搜索"
          />
          "
        </span>
        ,
      </L>
      <L i={1}>
        <JK>count</JK>: <N>{list.length}</N>,
      </L>
      <L i={1}>
        <JK>words</JK>: {'{'}
        {(book.loading || !all) && <Ghost> loading…</Ghost>}
        {book.error && <Ghost> {book.error}</Ghost>}
      </L>
      {!book.loading && list.length === 0 && (
        <L i={2}>
          <Cm>
            //{' '}
            {q ? '没有找到匹配的单词' : filter === 'starred' ? '学习时按 S 可以把单词加入生词本' : filter === 'wrong' ? '测验中答错的单词会出现在这里' : '这里还没有单词'}
          </Cm>
        </L>
      )}
      {shown.map((w, k) => {
        const st = wordStatus(data.cards[w.w])
        const starred = !!data.starred[w.w]
        return (
          <L
            key={w.w}
            i={2}
            git={st === 'mastered' ? 'add' : st === 'learning' ? 'mod' : null}
            mark={starred ? 'star' : null}
            onClick={() => setDetail(w)}
            className="cx-row cx-word-row"
            title={`${w.w}  /${w.p}/`}
          >
            <JK>{w.w}</JK>: <S q={'"'}>{shortMeaning(w, 40)}</S>
            {k < shown.length - 1 || shown.length < list.length ? ',' : ''}
            <span className="cx-inline-actions">
              <button
                type="button"
                title="朗读"
                onClick={(e) => {
                  e.stopPropagation()
                  say(w.w)
                }}
              >
                ▶
              </button>
              <button
                type="button"
                title={starred ? '移出生词本' : '加入生词本'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleStar(w.w)
                }}
              >
                {starred ? '★' : '☆'}
              </button>
            </span>
          </L>
        )
      })}
      {limit < list.length && (
        <L i={2} ref={sentinel}>
          <Cm>// … {list.length - limit} more</Cm>
        </L>
      )}
      <L i={1}>{'}'}</L>
      <L>{'}'}</L>
      {detail && <WordSheet word={detail} onClose={() => setDetail(null)} />}
    </Code>
  )
}
