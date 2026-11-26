import { useEffect, useState } from 'react'

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(query)
    const h = () => setM(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return m
}
export const useIsMobile = () => useMedia('(max-width: 767px)')
