import { useCallback, useEffect, useRef, useState } from 'react'
import type { Speaker } from './practice'
import { englishVoices } from './speech'
import type { Accent } from './types'

/**
 * 听力朗读：用浏览器语音合成按句朗读原文，男女声区分。
 * 播放时一次性把所有句子排进队列（iOS 只允许在点击事件里开始朗读），暂停时取消队列并记住位置。
 */

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
export const ttsSupported = !!synth

const MALE = /male|daniel|alex|tom|aaron|arthur|guy|david|mark|james|george|oliver|rishi/i
const FEMALE = /female|samantha|karen|victoria|zira|susan|moira|tessa|serena|kate|allison|ava|jenny|aria|libby|sonia|martha|google us english|google uk english female/i

function voicesFor(accent: Accent) {
  // 当前口音排在前面；该口音缺男声或女声时，借用其他口音的真人声，比改音调自然
  const en = englishVoices(accent === 'uk' ? 'en-GB' : 'en-US')
  const male = en.find((v) => MALE.test(v.name) && !/female/i.test(v.name))
  const female = en.find((v) => FEMALE.test(v.name))
  return { male, female, narrator: en[0] }
}

export interface Segment {
  /** 对应原文第几段（用于高亮） */
  turn: number
  speaker: Speaker
  text: string
}

/** 把每段原文切成句子，避免部分浏览器朗读长句时中途停止 */
export function toSegments(script: { speaker: Speaker; text: string }[], extra: string[] = []): Segment[] {
  const out: Segment[] = []
  script.forEach((s, turn) => {
    for (const sentence of s.text.split(/(?<=[.!?])\s+(?=[A-Z"'])/)) {
      if (sentence.trim()) out.push({ turn, speaker: s.speaker, text: sentence.trim() })
    }
  })
  extra.forEach((text) => out.push({ turn: -1, speaker: 'N', text }))
  return out
}

export function useScriptPlayer(segments: Segment[], accent: Accent) {
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const resumeAt = useRef(0)
  const token = useRef(0)

  const stop = useCallback(() => {
    token.current++
    synth?.cancel()
    setPlaying(false)
  }, [])

  useEffect(() => stop, [stop])

  const play = useCallback(
    (from = resumeAt.current) => {
      if (!synth) return
      const my = ++token.current
      synth.cancel()
      const { male, female, narrator } = voicesFor(accent)
      const start = from >= segments.length ? 0 : from
      setPlaying(true)
      setIndex(start)
      for (let i = start; i < segments.length; i++) {
        const seg = segments[i]
        const u = new SpeechSynthesisUtterance(seg.text)
        u.lang = accent === 'uk' ? 'en-GB' : 'en-US'
        const voice = seg.speaker === 'M' ? male : seg.speaker === 'W' ? female : narrator
        if (voice) u.voice = voice
        // 找不到对应性别的声音时，用音调区分男女
        if (seg.speaker === 'M' && !male) u.pitch = 0.75
        if (seg.speaker === 'W' && !female) u.pitch = 1.2
        u.rate = 0.95 * rate
        u.onstart = () => {
          if (token.current !== my) return
          resumeAt.current = i
          setIndex(i)
        }
        u.onend = () => {
          if (token.current !== my || i !== segments.length - 1) return
          resumeAt.current = 0
          setPlaying(false)
          setIndex(-1)
        }
        synth.speak(u)
      }
    },
    [segments, accent, rate],
  )

  const pause = useCallback(() => {
    stop()
  }, [stop])

  const restart = useCallback(() => {
    resumeAt.current = 0
    play(0)
  }, [play])

  return { index, playing, play, pause, restart, rate, setRate, supported: ttsSupported, segment: segments[index] }
}
