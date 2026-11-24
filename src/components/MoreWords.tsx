import { useMoreWords } from '../lib/useMoreWords'

const STEP = 5

/**
 * 每日任务完成后“再学 N 个”：数量可以填写或用 −/+ 调整（步长 5），默认同每日新词。
 * 词库没有没学过的词时不显示。
 */
export function MoreWords({ remaining, primary = true, replace = false }: { remaining: number; primary?: boolean; replace?: boolean }) {
  const m = useMoreWords(remaining)
  if (m.max === 0) return null
  return (
    <form
      className="more-words"
      onSubmit={(e) => {
        e.preventDefault()
        m.start(replace)
      }}
    >
      <div className="stepper">
        <button type="button" aria-label={`少学 ${STEP} 个`} disabled={m.count <= 1} onClick={() => m.step(-STEP)}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={m.max}
          value={m.value}
          onChange={(e) => m.setValue(e.target.value)}
          onBlur={m.commit}
          onFocus={(e) => e.target.select()}
          aria-label="再学几个新词"
          title={`再学几个新词（1–${m.max}）`}
        />
        <button type="button" aria-label={`多学 ${STEP} 个`} disabled={m.count >= m.max} onClick={() => m.step(STEP)}>
          +
        </button>
      </div>
      <button type="submit" className={`btn${primary ? ' primary' : ''}`} disabled={!m.count}>
        再学 {m.count || ''} 个
      </button>
    </form>
  )
}
