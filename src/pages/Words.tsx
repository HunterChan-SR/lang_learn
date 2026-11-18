import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { SpeakButton, StarButton } from '../components/WordParts'
import { WordSheet } from '../components/WordSheet'
import { bookMeta, shortMeaning, useAllWords, type BookState } from '../lib/books'
import { navigate } from '../lib/router'
import { wordStatus } from '../lib/srs'
import { useAppData } from '../lib/store'
import type { Word } from '../lib/types'
import { useWordList, WORD_FILTERS, wordFilterOf } from '../lib/useWords'

const PAGE = 80

export function Words({ book, query }: { book: BookState; query: URLSearchParams }) {
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

  // 滚动到底部时自动加载更多，避免一次渲染几千行
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE)
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list])

  const shown = list.slice(0, limit)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="muted small">{bookMeta(data.settings.book).name}</div>
          <h1>词库</h1>
        </div>
      </header>

      <div className="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索英文或中文释义"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className="chips-scroll" role="tablist">
        {WORD_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`chip${filter === f.id ? ' on' : ''}`}
            onClick={() => navigate(f.id === 'all' ? '/words' : `/words?f=${f.id}`, true)}
          >
            {f.label}
            <span className="count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {book.loading && <p className="muted center">词库加载中…</p>}
      {book.error && (
        <p className="error center">
          {book.error}{' '}
          <button className="link" onClick={book.retry}>
            重试
          </button>
        </p>
      )}

      {!book.loading && list.length === 0 && (
        <div className="empty">
          <p className="muted">{q ? '没有找到匹配的单词' : filter === 'starred' ? '学习时点击 ☆ 可以把单词加入生词本' : filter === 'wrong' ? '测验中答错的单词会出现在这里' : '这里还没有单词'}</p>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="list-meta muted small">共 {list.length} 个</div>
          <ul className="word-list card flush">
            {shown.map((w) => {
              const st = wordStatus(data.cards[w.w])
              return (
                <li key={w.w}>
                  <button className="word-row" onClick={() => setDetail(w)}>
                    <span className={`dot ${st}`} aria-label={st} />
                    <span className="word-row-main">
                      <strong lang="en">{w.w}</strong>
                      <span className="muted small ellipsis">{shortMeaning(w, 40)}</span>
                    </span>
                  </button>
                  <SpeakButton text={w.w} size="sm" />
                  <StarButton word={w.w} />
                </li>
              )
            })}
          </ul>
          {limit < list.length && <div ref={sentinel} className="sentinel muted small">加载中…</div>}
        </>
      )}

      {detail && <WordSheet word={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
