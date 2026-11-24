import { parseExchange, splitPos, type BookState } from '../lib/books'
import { formatInterval } from '../lib/date'
import { useWordExtra } from '../lib/extras'
import { navigate } from '../lib/router'
import { toggleStar, useAppData } from '../lib/store'
import type { Grade, Word } from '../lib/types'
import { useMoreWords, type MoreWords } from '../lib/useMoreWords'
import { useStudySession } from '../lib/useStudy'
import { AIComment, useAILens } from './CodeAI'
import { bar } from './CodeHome'
import { Act, C, Cm, Code, Ghost, K, L, Lens, N, NumInput, S, T, V } from './Code'

const GRADE_LABELS = ['Forgot', 'Hard', 'Good', 'Easy']

const FORM_KEYS: Record<string, string> = {
  复数: 'plural',
  过去式: 'past',
  过去分词: 'pp',
  现在分词: 'ing',
  三单: 's3',
  比较级: 'er',
  最高级: 'est',
}

/** 单词名做成合法的标识符：break down -> break_down */
export const ident = (w: string) => w.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^(\d)/, '_$1')

/** 背单词：session.ts */
export function CodeStudy({ book, extra }: { book: BookState; extra: number }) {
  const s = useStudySession(book, extra, { autoPlay: false })
  const { queue, pos, item, finished, total } = s
  const more = useMoreWords(s.remainingNew)

  if (book.error) {
    return (
      <Code>
        <L>
          <Cm>// ✗ {book.error}</Cm>
        </L>
        <Lens items={[{ label: 'retry', onClick: book.retry }]} />
        <L>
          <C>export</C> {'{}'}
        </L>
      </Code>
    )
  }

  if (!queue) {
    return (
      <Code>
        <L>
          <Cm>// loading…</Cm>
        </L>
      </Code>
    )
  }

  if (queue.length === 0) {
    return (
      <Code>
        <L>
          <Cm>// 今天没有需要学习的单词：到期的单词都复习完了，新词也已达到每日目标</Cm>
        </L>
        <Lens items={[runMore(more), { label: 'today.ts', onClick: () => navigate('/') }]} />
        {more.max > 0 ? (
          <MoreLine more={more} />
        ) : (
          <L>
            <C>export</C> {'{}'}
          </L>
        )}
      </Code>
    )
  }

  if (finished || !item) {
    return (
      <Code>
        <L>
          <Cm>
            // ✓ session complete · {pos} cards · {s.newCount} new
          </Cm>
        </L>
        <L />
        <Lens
          items={[
            { label: 'Run quiz(today)', onClick: () => navigate('/quiz?src=today&run=1'), title: '测一测今天的单词' },
            { label: 'today.ts', onClick: () => navigate('/') },
          ]}
        />
        <L>
          <C>export</C> <K>const</K> <V className="t-const">result</V> = {'{'}
        </L>
        {GRADE_LABELS.map((g, i) => (
          <L key={g} i={1}>
            <V>{g.toLowerCase()}</V>: <N>{s.tally[i]}</N>,
          </L>
        ))}
        <L>{'}'}</L>
        {more.max > 0 && (
          <>
            <L />
            <Lens items={[runMore(more)]} />
            <MoreLine more={more} />
          </>
        )}
      </Code>
    )
  }

  const tag = item.isNew ? 'new' : item.retry ? 'retry' : 'review'
  return (
    <Code>
      <L>
        <Cm>
          // {bar(total ? pos / total : 0)} {pos + 1}/{total} · {tag}
        </Cm>
      </L>
      <L>
        <C>import</C> <K>type</K> {'{ '}
        <T>Word</T>
        {' } '}
        <C>from</C> <S>./types</S>
      </L>
      <L />
      <Card key={item.word.w} word={item.word} revealed={s.revealed} reveal={s.reveal} say={s.say} />
      {s.revealed && s.intervals && (
        <Lens
          items={GRADE_LABELS.map((g, i) => ({
            label: `${g} · ${formatInterval(s.intervals![i])} (${i + 1})`,
            onClick: () => s.grade(i as Grade),
            title: ['忘记了', '模糊', '认识', '太简单'][i],
          }))}
        />
      )}
      <AIComment word={item.word} />
      <L />
      <L>
        <Cm>// Space 显示释义 · 1–4 评分 · R 朗读 · S 收藏 · Esc 退出</Cm>
      </L>
    </Code>
  )
}

/** “再学一组”的 CodeLens 项（在学习页里，换一组不多留历史记录） */
function runMore(more: MoreWords) {
  return more.count > 0 && { label: `Run study(+${more.count})`, onClick: () => more.start(true), title: `再学 ${more.count} 个新词` }
}

/** export const extra = 20 // 再学几个新词：数字可以直接改 */
function MoreLine({ more }: { more: MoreWords }) {
  return (
    <L>
      <C>export</C> <K>const</K> <V className="t-const">extra</V> ={' '}
      <NumInput
        value={more.value}
        onChange={more.setValue}
        onStep={more.step}
        onCommit={more.commit}
        onEnter={() => more.start(true)}
        label={`再学几个新词（1–${more.max}），回车开始`}
      />{' '}
      <Cm>// 再学几个新词：改数字，回车开始</Cm>
    </L>
  )
}

function Card({ word, revealed, reveal, say }: { word: Word; revealed: boolean; reveal: () => void; say: (t: string) => void }) {
  const starred = !!useAppData().starred[word.w]
  const ai = useAILens(word)
  const { extra } = useWordExtra(word.w)
  const forms = parseExchange(word.x)
  const examples = extra?.examples.slice(0, 2) ?? []
  const phrases = extra?.phrases.slice(0, 3) ?? []
  const root = extra?.roots[0]

  return (
    <>
      <Lens
        items={[
          { label: 'speak (R)', onClick: () => say(word.w), title: '朗读' },
          { label: starred ? '★ starred (S)' : '☆ star (S)', onClick: () => toggleStar(word.w), title: starred ? '移出生词本' : '加入生词本' },
          ai,
          { label: 'exit (Esc)', onClick: () => navigate('/') },
        ]}
      />
      <L mark={starred ? 'star' : null}>
        <C>export</C> <K>const</K>{' '}
        <Act onClick={() => say(word.w)} title="朗读">
          <V className="t-const cx-word">{ident(word.w)}</V>
        </Act>
        : <T>Word</T> = {'{'}
      </L>
      {word.w !== ident(word.w) && (
        <L i={1}>
          <V>text</V>: <S>{word.w}</S>,
        </L>
      )}
      {word.p && (
        <L i={1}>
          <V>phonetic</V>: <S>/{word.p}/</S>,
        </L>
      )}
      {!revealed ? (
        <L i={1} onClick={reveal} className="cx-reveal" title="显示释义（Space）">
          <V>meaning</V>: <Ghost>press Space to reveal</Ghost>
        </L>
      ) : (
        <>
          <L i={1}>
            <V>meaning</V>: [
          </L>
          {word.t.map((line, k) => {
            const [pos, text] = splitPos(line)
            return (
              <L key={k} i={2}>
                <S>
                  {pos && <span className="t-pos">{pos} </span>}
                  {text}
                </S>
                ,
              </L>
            )
          })}
          <L i={1}>],</L>
          {forms.length > 0 && (
            <L i={1}>
              <V>forms</V>: {'{ '}
              {forms.map((f, k) => (
                <span key={f.label}>
                  {k > 0 && ', '}
                  <V>{FORM_KEYS[f.label] ?? f.label}</V>: <S>{f.value}</S>
                </span>
              ))}
              {' }'},
            </L>
          )}
          {root && (
            <L i={1}>
              <V>root</V>: <S>{root.key}</S>, <Cm>// {root.kind}：{root.meaning}</Cm>
            </L>
          )}
          {examples.length > 0 && (
            <>
              <L i={1}>
                <V>examples</V>: [
              </L>
              {examples.map(([en, zh], k) => (
                <L key={k} i={2}>
                  <Act onClick={() => say(en)} title="朗读例句">
                    <S q={'"'}>{en}</S>
                  </Act>
                  , <Cm>// {zh}</Cm>
                </L>
              ))}
              <L i={1}>],</L>
            </>
          )}
          {phrases.length > 0 && (
            <>
              <L i={1}>
                <V>phrases</V>: {'{'}
              </L>
              {phrases.map(([en, zh], k) => (
                <L key={k} i={2}>
                  <S>{en}</S>: <S>{zh}</S>,
                </L>
              ))}
              <L i={1}>{'},'}</L>
            </>
          )}
        </>
      )}
      <L>{'}'}</L>
    </>
  )
}
