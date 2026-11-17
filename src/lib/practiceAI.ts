import { chat, chatJSON, getAIConfig, type ChatPhase } from './ai'
import {
  LETTERS,
  LISTENING_TYPES,
  newSetId,
  validateSet,
  type Level,
  type ListeningType,
  type MCQ,
  type PracticeKind,
  type PracticeSet,
  type TranslationSet,
  type WritingSet,
} from './practice'

/**
 * 练习模块的 AI 能力：出新题、翻译/作文批改、讲解错题。
 */

const TOPICS = [
  '校园生活与学习方法',
  '科技发展对生活的影响',
  '环境保护与可持续发展',
  '健康、运动与睡眠',
  '心理学与情绪管理',
  '就业、职业规划与职场',
  '城市化与社区生活',
  '人工智能与未来工作',
  '阅读、媒体与信息素养',
  '家庭关系与代际沟通',
  '志愿服务与社会责任',
  '消费观念与理财',
  '旅行、交通与文化交流',
  '饮食文化与食品安全',
  '动物、自然与生物多样性',
  '科学发现与科普',
  '艺术、音乐与审美',
  '教育公平与终身学习',
  '体育精神与团队合作',
  '时间管理与自律',
]

const TRANSLATION_TOPICS = [
  '中国传统节日与习俗',
  '中国历史名城或古建筑',
  '传统手工艺与非物质文化遗产',
  '中国的科技与基础设施发展',
  '中国的饮食文化',
  '中国的自然景观与生态保护',
  '中国的教育发展',
  '中国传统艺术（书法、戏曲、绘画等）',
  '中国的乡村振兴与城市发展',
  '中国古代发明与思想家',
]

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

const SYSTEM_GEN = `你是大学英语四六级的命题专家。你出的题目是原创的，语言地道，难度、题型和格式严格符合 2013 年改革后的四六级真题。
不要照搬真题或已发表的文章；不要编造真实机构、期刊或真实人物的具体数据和引语，需要时使用“一项调查”“一些研究人员”等泛指。
只输出一个 JSON 对象，不要输出 Markdown 代码块标记或任何解释文字。`

const levelName = (l: Level) => (l === 'cet6' ? '六级' : '四级')

function vocabLine(words: string[]): string {
  if (!words.length) return ''
  return `\n请尽量自然地用上下列学生正在背的单词（至少用 5 个，可以使用变化形式）：${words.join(', ')}。`
}

const MCQ_SCHEMA = `{"q": "英文题干", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": 0, "explanation": "中文解析：依据原文哪一句，其他选项错在哪"}`

function specFor(kind: PracticeKind, level: Level, words: string[], listeningType?: ListeningType): string {
  const lv = levelName(level)
  const topic = kind === 'translation' ? pick(TRANSLATION_TOPICS) : pick(TOPICS)
  const six = level === 'cet6'
  switch (kind) {
    case 'banked':
      return `出一套${lv}「选词填空」（阅读 Section A）。话题：${topic}。
短文 ${six ? '250~300' : '200~250'} 词，挖 10 个空，空格在原文中写作 {{1}} 到 {{10}}，按出现顺序编号。
词库 15 个单词，按字母顺序排列；其中 10 个是答案（使用填入后需要的形式，如复数、过去式），5 个是干扰项；词性要混合（名词、动词、形容词、副词），每空只有一个最佳答案。${vocabLine(words)}
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "passage": "……{{1}}……", "options": ["15 个单词"], "answers": [10 个整数，第 i 空答案在 options 中的下标], "explanations": ["10 条中文解析：词性/语法线索 + 语义"]}`
    case 'matching':
      return `出一套${lv}「长篇阅读」（阅读 Section B，段落信息匹配）。话题：${topic}。
文章 ${six ? '9~11 段，共 850~1000 词' : '9~10 段，共 750~900 词'}，段落不要加字母编号。
另写 10 个句子，每句是对某一段信息的同义改写（不要照抄原文措辞），顺序打乱；可以有段落被用两次，也可以有段落不被用到。${vocabLine(words)}
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "paragraphs": ["第一段", "第二段", "……"], "statements": ["10 个句子"], "answers": [10 个整数，对应段落下标，从 0 开始], "explanations": ["10 条中文解析：定位到哪段哪句，说明同义替换"]}`
    case 'reading':
      return `出一篇${lv}「仔细阅读」（阅读 Section C）。话题：${topic}。
文章 ${six ? '400~450' : '320~370'} 词，段落之间用 \\n\\n 分隔；配 5 道单选题，题型混合（细节、推断、主旨、词义、作者态度），正确答案位置分散。${vocabLine(words)}
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "passage": "……", "questions": [5 个 ${MCQ_SCHEMA}]}`
    case 'listening': {
      const type = listeningType ?? 'conversation'
      const rule = {
        news: '一则新闻，播音员朗读，speaker 用 "N"，180~230 词，配 2~3 题',
        conversation: '一段男女对话，speaker 用 "M"（男）和 "W"（女）交替，14~20 轮，共 300~350 词，口语化，配 4 题',
        passage: '一篇短文，speaker 用 "N"，250~300 词，配 3~4 题',
        lecture: '一段大学讲座，speaker 用 "N"，350~400 词，配 3~4 题',
      }[type]
      return `出一套${lv}听力「${LISTENING_TYPES[type]}」。话题：${topic}。
要求：${rule}。原文会用语音合成朗读，所以要像真实口语，不要写舞台说明、括号或难以朗读的缩写。新闻用虚构但合理的地名和人物（如“英国北部的一个小镇”）。
题干是会被读出来的问句，选项简短（像试卷上印的那样）。${vocabLine(words)}
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "type": "${type}", "script": [{"speaker": "M", "text": "……"}], "questions": [${MCQ_SCHEMA}]}`
    }
    case 'translation':
      return `出一道${lv}「段落翻译」（汉译英）。话题：${topic}。
中文段落 ${six ? '180~200' : '140~160'} 个汉字，内容准确，风格像真题。并给出高质量英文参考译文和 5~8 个关键词的译法。
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "source": "中文段落", "reference": "英文参考译文", "keywords": [["中文", "English"]]}`
    case 'writing':
      return `出一道${lv}「写作」题。话题：${topic}。形式可以是议论文、书信或倡议书。
directions 用真题的英文风格，例如 "For this part, you are allowed 30 minutes to write an essay on ... You should write at least ${six ? 150 : 120} words but no more than ${six ? 200 : 180} words."
并给出 2~4 条中文写作提示，以及一篇符合字数要求的高分范文。
输出格式：
{"title": "中文短标题", "topic": "英文关键词", "type": "essay", "directions": "……", "minWords": ${six ? 150 : 120}, "maxWords": ${six ? 200 : 180}, "outline": ["中文提示"], "sample": "范文，段落之间用 \\n\\n 分隔"}`
  }
}

export interface Progress {
  phase: ChatPhase
  chars: number
}

export async function generateSet(
  kind: PracticeKind,
  level: Level,
  words: string[],
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<PracticeSet> {
  const listeningType =
    kind === 'listening' ? pick<ListeningType>(level === 'cet6' ? ['conversation', 'passage', 'lecture'] : ['news', 'conversation', 'passage']) : undefined
  let phase: ChatPhase = 'waiting'
  const set = await chatJSON(
    {
      system: SYSTEM_GEN,
      messages: [{ role: 'user', content: specFor(kind, level, words, listeningType) }],
      signal,
      onPhase: (p) => onProgress({ phase: (phase = p), chars: 0 }),
      onText: (t) => onProgress({ phase, chars: t.length }),
    },
    (v) => validateSet(kind, v, level),
  )
  return { ...set, id: newSetId(), level, ai: { model: getAIConfig()?.model ?? '', at: Date.now() } }
}

// ---------------- 翻译 / 写作批改 ----------------

export interface CompositionGrade {
  score: number
  band: string
  summary: string
  strengths: string[]
  issues: { original: string; suggestion: string; reason: string }[]
  improved: string
}

const RUBRIC = {
  writing: `写作评分标准（满分 15 分，按档给分，可在档内上下浮动）：
- 14 分档（13~15 分）：切题。表达思想清楚，文字通顺、连贯，基本上无语言错误，仅有个别小错。
- 11 分档（10~12 分）：切题。表达思想清楚，文字较连贯，但有少量语言错误。
- 8 分档（7~9 分）：基本切题。有些地方表达思想不够清楚，文字勉强连贯；语言错误相当多，其中有一些是严重错误。
- 5 分档（4~6 分）：基本切题。表达思想不清楚，连贯性差；有较多的严重语言错误。
- 2 分档（1~3 分）：条理不清，思路紊乱，语言支离破碎或大部分句子均有错误，且多数为严重错误。
- 0 分：白卷，作文与题目毫不相关，或只有几个孤立的词而无法表达思想。
字数不足的应酌情扣分。`,
  translation: `翻译评分标准（满分 15 分，按档给分，可在档内上下浮动）：
- 14 分档（13~15 分）：译文准确表达了原文的意思。用词贴切，行文流畅，基本上无语言错误，仅有个别小错。
- 11 分档（10~12 分）：译文基本表达了原文的意思。文字通顺、连贯，无重大语言错误。
- 8 分档（7~9 分）：译文勉强表达了原文的意思。用词欠准确，语言错误相当多，其中有些是严重语言错误。
- 5 分档（4~6 分）：译文仅表达了一小部分原文的意思。用词不准确，有相当多的严重语言错误。
- 2 分档（1~3 分）：译文支离破碎。除个别词语或句子，绝大部分文字没有表达原文意思。
- 0 分：未作答，或只有几个孤立的词，或译文与原文毫不相关。`,
}

const GRADE_SCHEMA = `{"score": 整数0~15, "band": "11分档", "summary": "两三句中文总体评价", "strengths": ["中文写出的优点"], "issues": [{"original": "学生原文中的片段（原样摘录）", "suggestion": "修改后的英文", "reason": "中文说明：语法/用词/逻辑问题"}], "improved": "在学生原文基础上修改润色后的完整英文版本，保留学生的思路和结构"}`

function clampGrade(v: unknown): CompositionGrade {
  const g = (v ?? {}) as Partial<CompositionGrade>
  const score = Math.max(0, Math.min(15, Math.round(Number(g.score))))
  if (!Number.isFinite(score)) throw new Error('评分格式不正确')
  return {
    score,
    band: typeof g.band === 'string' ? g.band : '',
    summary: typeof g.summary === 'string' ? g.summary : '',
    strengths: Array.isArray(g.strengths) ? g.strengths.filter((s) => typeof s === 'string') : [],
    issues: Array.isArray(g.issues)
      ? g.issues
          .filter((i) => i && typeof i === 'object')
          .map((i) => ({ original: String(i.original ?? ''), suggestion: String(i.suggestion ?? ''), reason: String(i.reason ?? '') }))
      : [],
    improved: typeof g.improved === 'string' ? g.improved : '',
  }
}

export async function gradeComposition(
  set: TranslationSet | WritingSet,
  answer: string,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<CompositionGrade> {
  const lv = levelName(set.level)
  const isWriting = set.kind === 'writing'
  const task = isWriting
    ? `题目要求（${lv}写作，${set.minWords}~${set.maxWords} 词）：\n${set.directions}`
    : `中文原文（${lv}段落翻译）：\n${set.source}${set.reference ? `\n\n参考译文（仅供你判断准确性，不要求学生与之一致）：\n${set.reference}` : ''}`
  let phase: ChatPhase = 'waiting'
  return chatJSON(
    {
      system: `你是大学英语四六级阅卷组的资深阅卷老师，评分严格、公正，点评具体、有建设性。\n${RUBRIC[set.kind]}\n只输出一个 JSON 对象，不要输出其他文字。`,
      messages: [
        {
          role: 'user',
          content: `${task}

学生${isWriting ? '作文' : '译文'}（${answer.match(/[A-Za-z]+/g)?.length ?? 0} 词）：
"""
${answer}
"""

请按评分标准给出分数，并逐条指出最重要的问题（最多 8 条，按重要性排序）。输出格式：
${GRADE_SCHEMA}`,
        },
      ],
      signal,
      onPhase: (p) => onProgress({ phase: (phase = p), chars: 0 }),
      onText: (t) => onProgress({ phase, chars: t.length }),
    },
    clampGrade,
  )
}

// ---------------- 讲解选择题 ----------------

export function explainMCQ(
  context: string,
  q: MCQ,
  picked: number | null,
  opts: { signal: AbortSignal; onText: (t: string) => void; onPhase?: (p: ChatPhase) => void },
): Promise<string> {
  const options = q.options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')
  return chat({
    system: '你是耐心的大学英语四六级辅导老师，讲解简洁、有条理，用简体中文。',
    messages: [
      {
        role: 'user',
        content: `${context}

题目：${q.q}
${options}
正确答案：${LETTERS[q.answer]}
学生的选择：${picked === null ? '未作答' : LETTERS[picked]}

请讲解：
1. 正确答案的依据（引用原文相关句子）
2. ${picked !== null && picked !== q.answer ? '学生所选选项错在哪里' : '其他选项为什么不对'}
3. 一句这类题的解题技巧
总共不超过 250 字。`,
      },
    ],
    signal: opts.signal,
    onText: opts.onText,
    onPhase: opts.onPhase,
  })
}
