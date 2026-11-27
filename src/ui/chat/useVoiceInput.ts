import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/store/toast'

interface SpeechAlt { transcript: string }
interface SpeechRes { isFinal: boolean; 0: SpeechAlt }
interface SpeechEvt { resultIndex: number; results: ArrayLike<SpeechRes> }
interface Rec { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: SpeechEvt) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }
type RecCtor = new () => Rec

export function speechCtor(): RecCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** base + finalised speech + live interim speech, with sensible spacing. */
export function joinTranscript(base: string, finals: string, interim: string): string {
  const spoken = `${finals}${interim}`.replace(/\s+/g, ' ').trim()
  if (!spoken) return base
  return base && !/\s$/.test(base) ? `${base} ${spoken}` : `${base}${spoken}`
}

/**
 * Real speech-to-text (Web Speech API). Interim words stream into the textarea as you speak; a toast explains unsupported browsers / denied mic.
 */
export function useVoiceInput(getText: () => string, setText: (t: string) => void) {
  const supported = !!speechCtor()
  const [listening, setListening] = useState(false)
  const rec = useRef<Rec | null>(null)
  const set = useRef(setText); set.current = setText
  const get = useRef(getText); get.current = getText

  const stop = useCallback(() => { rec.current?.stop() }, [])
  const toggle = useCallback(() => {
    const Ctor = speechCtor()
    if (!Ctor) { toast.info('Voice input isn’t supported in this browser', 'Try Chrome, Edge or Safari.'); return }
    if (rec.current && listening) { rec.current.stop(); return }
    const r = new Ctor()
    const base = get.current()
    let finals = ''
    r.continuous = true
    r.interimResults = true
    r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!
        if (res.isFinal) finals += res[0].transcript + ' '
        else interim += res[0].transcript
      }
      set.current(joinTranscript(base, finals, interim))
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.error('Microphone permission denied', 'Allow microphone access in your browser to dictate.')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error('Voice input error', e.error)
    }
    r.onend = () => { setListening(false); rec.current = null }
    rec.current = r
    try { r.start(); setListening(true) } catch (err) { toast.error('Could not start voice input', String(err)) }
  }, [listening])

  useEffect(() => () => rec.current?.abort(), [])
  return { supported, listening, toggle, stop }
}
