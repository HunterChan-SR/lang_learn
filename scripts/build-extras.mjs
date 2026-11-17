#!/usr/bin/env node
/**
 * 生成单词卡的增强资料：例句、常用短语、词根词缀、近义词辨析、英英释义、柯林斯星级/牛津核心词。
 *
 * 数据来源（均为开源数据，需先下载到本地）：
 *   --ecdict    ECDICT 完整词典 ecdict.csv            https://github.com/skywind3000/ECDICT （MIT）
 *   --roots     ECDICT 附带的词根词缀 wordroot.txt      同上
 *   --resemble  ECDICT 附带的近义词辨析 resemble.txt    同上
 *   --tatoeba   manythings.org 的中英句对 cmn.txt       https://www.manythings.org/anki/cmn-eng.zip
 *               （句子来自 Tatoeba，CC-BY 2.0 FR）
 *
 * 用法：
 *   npm run extras -- --ecdict ecdict.csv --roots wordroot.txt --resemble resemble.txt --tatoeba cmn.txt
 *
 * 输出 public/data/x/<首字母>.json，按首字母分片，打开单词详情时按需加载：
 *   {
 *     w: { 单词: { e: [[英, 中]], p: [[短语, 释义]], r: [词根序号], s: [辨析组序号], d: [英英释义], c: 柯林斯星级, o: 1 } },
 *     r: [{ k: 词根, m: 含义, t: 类型, x: [同根词] }],
 *     s: [{ w: [词], i: 说明, d: [[词, 辨析]] }]
 *   }
 */
import fs from 'node:fs'
import path from 'node:path'
import * as OpenCC from 'opencc-js'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const files = { ecdict: opt('ecdict'), roots: opt('roots'), resemble: opt('resemble'), tatoeba: opt('tatoeba') }
const outDir = opt('out') ?? 'public/data/x'
const dataDir = opt('data') ?? 'public/data'
for (const [k, v] of Object.entries(files)) {
  if (!v || !fs.existsSync(v)) {
    console.error(`缺少 --${k} 文件。用法见脚本开头的注释。`)
    process.exit(1)
  }
}

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' })

// ---------------- 词表 ----------------

/** 单词 -> 所有词形（原形 + 词形变化） */
const words = new Map()
for (const book of ['cet4', 'cet6']) {
  for (const [w, , , x] of JSON.parse(fs.readFileSync(path.join(dataDir, `${book}.json`), 'utf8'))) {
    const forms = new Set([w.toLowerCase()])
    for (const part of (x ?? '').split('/')) {
      const v = part.split(':')[1]
      if (v && /^[a-z'-]+$/i.test(v)) forms.add(v.toLowerCase())
    }
    words.set(w, [...forms])
  }
}
const lowerToWord = new Map([...words.keys()].map((w) => [w.toLowerCase(), w]))

/** 不作为短语中心词的虚词 */
const STOP = new Set(
  'a an the of to in on at by for from with into onto upon about as and or but if than then so not no be is are was were been being am do does did done have has had having it its this that these those there here he she they we you i me him her them us my his our your their one ones oneself sb sth someone something somebody anything everything up out off over down away back'.split(
    ' ',
  ),
)

const tokenize = (s) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []

// ---------------- 例句（Tatoeba） ----------------

const sentences = new Map() // 英文句子 -> 中文译文
for (const line of fs.readFileSync(files.tatoeba, 'utf8').split('\n')) {
  const [en, zh] = line.split('\t')
  if (!en || !zh || sentences.has(en)) continue
  sentences.set(en, toSimplified(zh))
}
const sentList = [...sentences].map(([en, zh]) => ({ en, zh, tokens: tokenize(en) }))

const byToken = new Map()
sentList.forEach((s, i) => {
  for (const t of new Set(s.tokens)) {
    if (!byToken.has(t)) byToken.set(t, [])
    byToken.get(t).push(i)
  }
})

/** 例句打分：8~16 个词最合适；太短没语境，太长难读；人名句子稍微降权，避免全是 Tom */
function sentenceScore(s) {
  const n = s.tokens.length
  let score = n < 5 ? 20 : n <= 16 ? Math.abs(n - 11) : 6 + (n - 16) * 2
  if (/\b(Tom|Mary|John|Ken)\b/.test(s.en)) score += 3
  if (/[?!]$/.test(s.en)) score += 1
  return score
}

function pickExamples(forms) {
  const seen = new Set()
  const cands = []
  for (const f of forms) {
    for (const i of byToken.get(f) ?? []) {
      if (seen.has(i)) continue
      seen.add(i)
      cands.push(sentList[i])
    }
  }
  cands.sort((a, b) => sentenceScore(a) - sentenceScore(b) || a.en.length - b.en.length)
  const out = []
  const starts = new Set()
  for (const s of cands) {
    if (s.tokens.length > 24) continue
    // 避免几句开头一样（Tatoeba 里同一模板的句子很多）
    const head = s.tokens.slice(0, 3).join(' ')
    if (starts.has(head)) continue
    starts.add(head)
    out.push([s.en, s.zh])
    if (out.length >= 3) break
  }
  return out
}

// n-gram 计数，用来判断 ECDICT 里的短语是否常用
const ngrams = new Map()
for (const s of sentList) {
  const t = s.tokens
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= t.length; i++) {
      const g = t.slice(i, i + n).join(' ')
      ngrams.set(g, (ngrams.get(g) ?? 0) + 1)
    }
  }
}

// ---------------- ECDICT ----------------

function* parseCSV(text) {
  let field = ''
  let row = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      yield row
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    yield row
  }
}

const DEF_POS = [
  [/^a\.\s*/, 'adj. '],
  [/^s\.\s*/, 'adj. '],
  [/^r\.\s*/, 'adv. '],
]

function cleanDefinition(d) {
  const out = []
  for (let line of d.split(/\\n|\n/)) {
    line = line.trim()
    if (!line || line.startsWith('[')) continue
    line = DEF_POS.reduce((s, [re, rep]) => s.replace(re, rep), line)
    if (line.length > 100) {
      const cut = line.slice(0, 100)
      const punct = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','))
      line = `${cut.slice(0, punct > 50 ? punct : cut.lastIndexOf(' '))}…`
    }
    out.push(line)
    if (out.length >= 2) break
  }
  return out
}

function cleanPhraseMeaning(t) {
  const line = t
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('['))
  if (!line) return ''
  const senses = line
    .split(/\s*[;；]\s*|,\s*|，/)
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(senses)].slice(0, 3).join('；')
}

const info = new Map() // 单词 -> { d, c, o }
const phraseCands = new Map() // 单词 -> [[短语, 释义, 次数]]
const PLACEHOLDER = /\b(sb|sth|one's|oneself|someone|something|somebody)\b|\.\.\.|…/

const csv = parseCSV(fs.readFileSync(files.ecdict, 'utf8'))
const header = csv.next().value
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))

for (const r of csv) {
  const entry = r[col.word] ?? ''
  const w = lowerToWord.get(entry.toLowerCase())
  if (w && (entry === w || !info.has(w))) {
    info.set(w, {
      d: cleanDefinition(r[col.definition] ?? ''),
      c: Number(r[col.collins]) || 0,
      o: r[col.oxford] === '1' ? 1 : 0,
    })
    continue
  }
  // 短语：2~4 个词，不含占位符；用 Tatoeba 中的出现次数判断是否常用
  if (!entry.includes(' ') || PLACEHOLDER.test(entry)) continue
  const toks = entry.toLowerCase().split(/\s+/)
  if (toks.length < 2 || toks.length > 4 || !toks.every((t) => /^[a-z]+(?:'[a-z]+)?$/.test(t))) continue
  const meaning = cleanPhraseMeaning(r[col.translation] ?? '')
  if (!meaning) continue
  // 首词是动词时，把它的各种变化形式都算上（gave up / giving up）
  const head = lowerToWord.get(toks[0])
  const variants = head ? words.get(head) : [toks[0]]
  let count = 0
  for (const v of variants) count += ngrams.get([v, ...toks.slice(1)].join(' ')) ?? 0
  if (count < 2) continue
  for (const t of new Set(toks)) {
    const cw = lowerToWord.get(t)
    if (!cw || STOP.has(t)) continue
    if (!phraseCands.has(cw)) phraseCands.set(cw, [])
    phraseCands.get(cw).push([entry, meaning, count])
  }
}

// ---------------- 词根词缀 ----------------

const ROOT_CLASS = {
  root: '词根',
  prefix: '前缀',
  suffix: '后缀',
  'noun-forming suffix': '名词后缀',
  'adjective-forming suffix': '形容词后缀',
  'verb-forming suffix': '动词后缀',
  'adverb-forming suffix': '副词后缀',
}

const rootsRaw = JSON.parse(fs.readFileSync(files.roots, 'utf8'))
const roots = [] // { k, m, t, x }
const rootsOf = new Map() // 单词 -> [roots 下标]
for (const [key, v] of Object.entries(rootsRaw)) {
  const ex = (v.example ?? []).filter((e) => typeof e === 'string')
  const mine = ex.filter((e) => lowerToWord.has(e.toLowerCase()))
  if (!mine.length || !v.meaning) continue
  // 同根词：优先展示四六级词，最多 8 个
  const others = [...mine, ...ex.filter((e) => !lowerToWord.has(e.toLowerCase()))].slice(0, 8)
  const idx = roots.push({ k: key, m: String(v.meaning), t: ROOT_CLASS[v.class] ?? v.class ?? '', x: others }) - 1
  for (const e of mine) {
    const w = lowerToWord.get(e.toLowerCase())
    if (!rootsOf.has(w)) rootsOf.set(w, [])
    rootsOf.get(w).push(idx)
  }
}

// ---------------- 近义词辨析 ----------------

const groups = [] // { w, i, d }
const groupsOf = new Map()
for (const block of fs.readFileSync(files.resemble, 'utf8').split(/\n(?=%)/)) {
  const lines = block.split('\n').map((l) => l.trim())
  if (!lines[0]?.startsWith('%')) continue
  const ws = lines[0]
    .slice(1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const d = []
  let intro = ''
  for (const l of lines.slice(1)) {
    const m = l.match(/^-\s*([^:：]+)[:：]\s*(.+)$/)
    if (m) d.push([m[1].trim(), m[2].trim()])
    else if (l && !d.length) intro = l.replace(/，?其区别是：?$/, '').trim()
  }
  if (d.length < 2) continue
  const mine = ws.filter((x) => lowerToWord.has(x.toLowerCase()))
  if (!mine.length) continue
  const idx = groups.push({ w: ws, i: intro, d }) - 1
  for (const x of mine) {
    const w = lowerToWord.get(x.toLowerCase())
    if (!groupsOf.has(w)) groupsOf.set(w, [])
    if (groupsOf.get(w).length < 3) groupsOf.get(w).push(idx)
  }
}

// ---------------- 组装、分片输出 ----------------

const shards = new Map()
const stats = { e: 0, p: 0, r: 0, s: 0, d: 0 }
for (const [w, forms] of words) {
  const x = {}
  const ex = pickExamples(forms)
  if (ex.length) x.e = ex
  const ph = (phraseCands.get(w) ?? [])
    .sort((a, b) => b[2] - a[2])
    .filter((p, i, arr) => arr.findIndex((q) => q[0].toLowerCase() === p[0].toLowerCase()) === i)
    .slice(0, 5)
    .map(([p, m]) => [p, m])
  if (ph.length) x.p = ph
  const inf = info.get(w)
  if (inf?.d.length) x.d = inf.d
  if (inf?.c) x.c = inf.c
  if (inf?.o) x.o = 1

  const letter = /^[a-z]/i.test(w) ? w[0].toLowerCase() : '_'
  if (!shards.has(letter)) shards.set(letter, { w: {}, r: [], s: [], rMap: new Map(), sMap: new Map() })
  const sh = shards.get(letter)
  const local = (list, map, globalIdx, table) =>
    globalIdx.map((g) => {
      if (!map.has(g)) map.set(g, list.push(table[g]) - 1)
      return map.get(g)
    })
  if (rootsOf.has(w)) x.r = local(sh.r, sh.rMap, rootsOf.get(w), roots)
  if (groupsOf.has(w)) x.s = local(sh.s, sh.sMap, groupsOf.get(w), groups)

  for (const k of Object.keys(stats)) if (x[k]) stats[k]++
  if (Object.keys(x).length) sh.w[w] = x
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
let bytes = 0
for (const [letter, sh] of shards) {
  const file = path.join(outDir, `${letter}.json`)
  fs.writeFileSync(file, JSON.stringify({ w: sh.w, r: sh.r, s: sh.s }))
  bytes += fs.statSync(file).size
}
fs.writeFileSync(
  path.join(outDir, 'SOURCES.txt'),
  [
    '本目录数据由 scripts/build-extras.mjs 生成：',
    '- 英英释义、短语、词根词缀、近义词辨析：ECDICT (https://github.com/skywind3000/ECDICT)，MIT 协议，见 ../ECDICT-LICENSE.txt',
    '- 例句：Tatoeba (https://tatoeba.org) 中英句对，经 manythings.org 整理，CC-BY 2.0 FR 协议；繁体译文已转换为简体',
    '',
  ].join('\n'),
)

const n = words.size
const pct = (k) => `${((stats[k] / n) * 100).toFixed(0)}%`
console.log(`${n} 个单词：例句 ${pct('e')} · 短语 ${pct('p')} · 词根 ${pct('r')} · 辨析 ${pct('s')} · 英英 ${pct('d')}`)
console.log(`${shards.size} 个分片，共 ${(bytes / 1024).toFixed(0)} KB -> ${outDir}`)
