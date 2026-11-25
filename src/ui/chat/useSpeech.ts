import { useCallback, useEffect, useRef, useState } from 'react'

interface Rec { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null }

export function useSpeech(onText: (text: string) => void) {
  const Ctor = typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined
  const supported = !!Ctor
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Rec | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  const toggle = useCallback(() => {
    if (!Ctor) return
    if (listening) { rec.current?.stop(); return }
    const r: Rec = new Ctor()
    r.continuous = true
    r.interimResults = false
    r.lang = navigator.language || 'en-US'
    r.onresult = (e) => {
      let t = ''
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript
      if (t.trim()) cb.current(t.trim())
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice input error: ${e.error}`)
    r.onend = () => setListening(false)
    setError(null)
    rec.current = r
    try { r.start(); setListening(true) } catch (e) { setError(String(e)) }
  }, [Ctor, listening])

  useEffect(() => () => rec.current?.abort(), [])
  return { supported, listening, error, toggle }
}
