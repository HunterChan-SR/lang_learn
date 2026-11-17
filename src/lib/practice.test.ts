import { describe, expect, it } from 'vitest'
import { gradeObjective, KINDS, totalOf, validateSet, type BankedSet } from './practice'

const files = import.meta.glob<unknown[]>('../../public/data/practice/*.json', { eager: true, import: 'default' })

describe('内置题库', () => {
  for (const { kind } of KINDS) {
    it(`${kind}.json 每套题都能通过校验，四六级都有`, () => {
      const rows = files[`../../public/data/practice/${kind}.json`]
      expect(rows).toBeTruthy()
      const sets = rows.map((r) => validateSet(kind, r))
      expect(sets.length).toBeGreaterThan(0)
      expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length)
      expect(sets.some((s) => s.level === 'cet4')).toBe(true)
      expect(sets.some((s) => s.level === 'cet6')).toBe(true)
    })
  }
})

describe('validateSet', () => {
  it('答案可以是字母或选项原文', () => {
    const s = validateSet('reading', {
      title: 't',
      passage: 'x',
      questions: [
        { q: 'a', options: ['A. one', 'B. two', 'C. three', 'D. four'], answer: 'C' },
        { q: 'b', options: ['one', 'two', 'three', 'four'], answer: 'four' },
        { q: 'c', options: ['one', 'two', 'three', 'four'], answer: 1 },
      ],
    })
    expect(s.kind === 'reading' && s.questions.map((q) => q.answer)).toEqual([2, 3, 1])
    expect(s.kind === 'reading' && s.questions[0].options[0]).toBe('one')
  })

  it('选词填空缺空或答案重复时报错', () => {
    const options = 'a b c d e f g h i j k l m n o'.split(' ')
    const passage = Array.from({ length: 10 }, (_, i) => `{{${i + 1}}}`).join(' ')
    const ok = validateSet('banked', { title: 't', passage, options, answers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }) as BankedSet
    expect(totalOf(ok)).toBe(10)
    expect(gradeObjective(ok, [0, 1, 2, 3, 4, 5, 6, 7, 8, 14]).filter(Boolean)).toHaveLength(9)
    expect(() => validateSet('banked', { title: 't', passage, options, answers: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9] })).toThrow()
    expect(() => validateSet('banked', { title: 't', passage: '{{1}}', options, answers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).toThrow()
  })
})
