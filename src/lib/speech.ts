import type { Accent, VoiceSource } from './types'

/**
 * 发音：
 * - system：浏览器自带语音合成（离线可用，iOS/iPadOS/Chrome 均支持）
 * - youdao：有道词典在线真人发音，国内访问快；失败时自动退回系统语音
 */
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
// Chrome 首次调用才开始加载语音列表，提前触发一下
synth?.getVoices()

export const speechSupported = !!synth

/**
 * macOS / iOS 自带一批“趣味”和老式机械音（Albert、Bubbles、Zarvox、Fred、Grandma……），
 * 它们同样标着 en-US，而且按字母排在 Samantha 前面，随便取一个就会读得很怪
 */
const ODD_VOICE =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i
/** 系统里另外下载的高质量语音、Edge 的神经网络语音 */
const HQ_VOICE = /enhanced|premium|natural|neural/i

/** 所有可用的英语语音（已去掉怪声音）：指定口音排前面，同口音里音质好的排前面 */
export function englishVoices(lang: string): SpeechSynthesisVoice[] {
  const want = lang.toLowerCase()
  const rank = (v: SpeechSynthesisVoice) =>
    (v.lang.replace('_', '-').toLowerCase() === want ? 0 : 3) + (HQ_VOICE.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2)
  return (synth?.getVoices() ?? [])
    .filter((v) => v.lang.toLowerCase().startsWith('en') && !ODD_VOICE.test(v.name))
    .sort((a, b) => rank(a) - rank(b))
}

function speakSystem(text: string, accent: Accent) {
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = accent === 'uk' ? 'en-GB' : 'en-US'
  // 一个能用的都没有时不指定，交给系统按 lang 选默认语音
  const v = englishVoices(u.lang)[0]
  if (v) u.voice = v
  u.rate = 0.9
  synth.speak(u)
}

let audio: HTMLAudioElement | null = null

function speakYoudao(text: string, accent: Accent) {
  // type=1 英音，type=2 美音
  const url = `https://dict.youdao.com/dictvoice?type=${accent === 'uk' ? 1 : 2}&audio=${encodeURIComponent(text)}`
  audio?.pause()
  audio = new Audio(url)
  audio.play().catch(() => speakSystem(text, accent))
}

/** 停止正在播放的发音（插件的老板键会调用） */
export function stopSpeaking() {
  synth?.cancel()
  audio?.pause()
}

export function speak(text: string, opts: { accent: Accent; voice: VoiceSource }) {
  if (opts.voice === 'youdao') speakYoudao(text, opts.accent)
  else speakSystem(text, opts.accent)
}
