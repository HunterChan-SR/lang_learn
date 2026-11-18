import type { Accent, VoiceSource } from './types'

/**
 * 发音：
 * - system：浏览器自带语音合成（离线可用，iOS/iPadOS/Chrome 均支持）
 * - youdao：有道词典在线真人发音，国内访问快；失败时自动退回系统语音
 */
let voices: SpeechSynthesisVoice[] = []
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

function refreshVoices() {
  if (synth) voices = synth.getVoices()
}
if (synth) {
  refreshVoices()
  synth.addEventListener?.('voiceschanged', refreshVoices)
}

export const speechSupported = !!synth

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
  // 优先使用质量更好的增强/高级语音
  return (
    exact.find((v) => /enhanced|premium|natural|google/i.test(v.name)) ??
    exact.find((v) => v.localService) ??
    exact[0] ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en'))
  )
}

function speakSystem(text: string, accent: Accent) {
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = accent === 'uk' ? 'en-GB' : 'en-US'
  const v = pickVoice(u.lang)
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
