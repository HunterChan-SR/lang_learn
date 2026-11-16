#!/usr/bin/env node
/**
 * 从开源词典 ECDICT (https://github.com/skywind3000/ECDICT, MIT) 生成四六级词库。
 *
 * 用法：
 *   1. 下载 ecdict.csv（约 66MB）
 *   2. npm run wordlist -- /path/to/ecdict.csv
 *
 * 输出 public/data/cet4.json、public/data/cet6.json，格式为
 *   [[单词, 音标, 释义(多行用 \n 分隔), 词形变化], ...]
 * 按 COCA/BNC 词频排序，常用词在前。六级词库只包含四级以外的词。
 */
import fs from 'node:fs'
import path from 'node:path'

const [csvPath, outDir = 'public/data'] = process.argv.slice(2)
if (!csvPath) {
  console.error('用法: npm run wordlist -- <ecdict.csv 路径> [输出目录]')
  process.exit(1)
}

/** 逐字符解析 CSV，支持引号、转义引号和字段内换行 */
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

const POS_FIX = [
  [/^a\.\s*/, 'adj. '],
  [/^ad\.\s*/, 'adv. '],
]

const MAX_SENSES = 6

function cleanTranslation(t) {
  const lines = t
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  // 去掉“[网络]”释义和专业领域释义（如 [医] [计]），除非只剩这些
  const general = lines.filter((l) => !l.startsWith('['))
  const kept = general.length ? general : lines.filter((l) => !l.startsWith('[网络]'))

  // 同一词性合并到一行，并去掉重复义项：'n. 上下文, 背景' + 'n. 上下文' -> 'n. 上下文；背景'
  const groups = new Map()
  for (const raw of kept) {
    const line = POS_FIX.reduce((s, [re, rep]) => s.replace(re, rep), raw)
    const m = line.match(/^([a-z]+\.(?:\s*&\s*[a-z]+\.)?)\s*/i)
    const pos = m ? m[1] : ''
    const body = m ? line.slice(m[0].length) : line
    const senses = body
      .split(/\s*[;；]\s*|,\s+|，/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!groups.has(pos)) groups.set(pos, [])
    const list = groups.get(pos)
    for (const s of senses) if (!list.includes(s)) list.push(s)
  }
  return [...groups]
    .slice(0, 4)
    .map(([pos, senses]) => `${pos ? `${pos} ` : ''}${senses.slice(0, MAX_SENSES).join('；')}`)
    .join('\n')
}

/** ECDICT 的音标混用了西里尔字母和 ASCII 符号，统一成标准 IPA 字符 */
function cleanPhonetic(p) {
  return p
    .split(';')[0] // 多个读音只保留第一个
    .trim()
    .replace(/^,/, 'ˌ')
    .replace(/\^/g, 'g') // 源数据中少量 ɡ 被错误编码为 ^
    .replace(/\\+/g, 'ɜ') // 少量 ɜ 被错误编码为反斜杠
    .replace(/ә/g, 'ə')
    .replace(/є/g, 'ɛ')
    .replace(/'/g, 'ˈ')
    .replace(/\./g, 'ˌ')
    .replace(/:/g, 'ː')
    .replace(/ɡ/g, 'g')
}

const KEEP_EXCHANGE = new Set(['p', 'd', 'i', '3', 'r', 't', 's'])
function cleanExchange(x) {
  return x
    .split('/')
    .filter((part) => KEEP_EXCHANGE.has(part.split(':')[0]))
    .join('/')
}

const text = fs.readFileSync(csvPath, 'utf8')
const rows = parseCSV(text)
const header = rows.next().value
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
for (const need of ['word', 'phonetic', 'translation', 'tag', 'bnc', 'frq', 'exchange']) {
  if (!(need in col)) throw new Error(`CSV 缺少字段 ${need}`)
}

const books = { cet4: new Map(), cet6: new Map() }
let total = 0
for (const r of rows) {
  total++
  const tags = (r[col.tag] || '').split(' ')
  const in4 = tags.includes('cet4')
  const in6 = tags.includes('cet6')
  if (!in4 && !in6) continue
  const word = (r[col.word] || '').trim()
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) continue
  const translation = cleanTranslation(r[col.translation] || '')
  if (!translation) continue
  const frq = Number(r[col.frq]) || 0
  const bnc = Number(r[col.bnc]) || 0
  const entry = {
    w: word,
    p: cleanPhonetic(r[col.phonetic] || ''),
    t: translation,
    x: cleanExchange(r[col.exchange] || ''),
    rank: frq > 0 ? frq : bnc > 0 ? bnc : 1e9,
  }
  const target = in4 ? books.cet4 : books.cet6
  const key = word.toLowerCase()
  const prev = target.get(key)
  // 大小写重复时优先保留小写形式
  if (!prev || (prev.w !== key && word === key)) target.set(key, entry)
}

// 同一个词同时出现在两个列表时，只保留在四级
for (const key of books.cet4.keys()) books.cet6.delete(key)

fs.mkdirSync(outDir, { recursive: true })
for (const [id, map] of Object.entries(books)) {
  const list = [...map.values()].sort((a, b) => a.rank - b.rank || a.w.localeCompare(b.w))
  const lines = list.map((e) => JSON.stringify(e.x ? [e.w, e.p, e.t, e.x] : [e.w, e.p, e.t]))
  const file = path.join(outDir, `${id}.json`)
  fs.writeFileSync(file, `[\n${lines.join(',\n')}\n]\n`)
  console.log(`${id}: ${list.length} 个单词 -> ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)
}
console.log(`共扫描 ${total} 个词条`)
