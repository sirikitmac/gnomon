import { useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
// New key: the old one stored 'system' for everyone by default, which put many visitors in dark mode.
const KEY = 'gnomon-theme'

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    // Light by default, like the landing page; dark only when someone picks it (or picked system).
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light'
  } catch {
    return 'light'
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    try { localStorage.setItem(KEY, pref) } catch { /* storage unavailable */ }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
  return [pref, setPref] as const
}
