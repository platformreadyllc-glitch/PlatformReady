import { useEffect, useState } from 'react'

type Theme = 'midnight' | 'studio' | 'light'

const THEMES: Theme[] = ['midnight', 'studio', 'light']

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme
    return THEMES.includes(stored) ? stored : 'midnight'
  })

  useEffect(() => {
    const root = document.documentElement
    THEMES.forEach((t) => root.classList.remove(`theme-${t}`))
    root.classList.add(`theme-${theme}`)
    localStorage.setItem('theme', theme)
  }, [theme])

  function cycleTheme() {
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])
  }

  return { theme, cycleTheme }
}
