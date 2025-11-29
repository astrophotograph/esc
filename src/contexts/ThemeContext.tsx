import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { themes, ThemeId } from '../themes'

type Theme = ThemeId

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const ALL_THEME_CLASSES = Object.values(themes).map(t => t.cssClass)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Check localStorage for saved theme
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved && saved in themes) return saved

    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  })

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    const currentTheme = themes[theme]

    // Remove all theme classes
    root.classList.remove(...ALL_THEME_CLASSES, 'light', 'dark')

    // Add current theme class
    root.classList.add(currentTheme.cssClass)

    // Apply CSS variables for the theme
    const style = root.style
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      style.setProperty(`--theme-${key}`, value)
    })

    // Apply effects if available
    if (currentTheme.effects) {
      Object.entries(currentTheme.effects).forEach(([key, value]) => {
        if (value) style.setProperty(`--theme-${key}`, value)
      })
    }

    // Save to localStorage
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    // Cycle through popular themes
    const themeOrder: Theme[] = ['light', 'dark', 'night-vision', 'scifi', 'neon']
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    setThemeState(themeOrder[nextIndex])
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
