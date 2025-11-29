import { Moon, Sun, Eye, BookOpen, BookOpenCheck, Tv, Gamepad2, Zap, Cpu, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { useTheme } from '../contexts/ThemeContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { themes } from '../themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  // Icon mapping for each theme
  const getThemeIcon = () => {
    switch (theme) {
      case 'night-vision':
        return <Eye className="h-5 w-5 text-red-500" />
      case 'tufte':
        return <BookOpen className="h-5 w-5" />
      case 'dark-tufte':
        return <BookOpenCheck className="h-5 w-5" />
      case 'green-screen':
        return <Tv className="h-5 w-5 text-green-500" />
      case 'c64':
        return <Gamepad2 className="h-5 w-5 text-blue-400" />
      case 'fallout':
        return <Zap className="h-5 w-5 text-green-400" />
      case 'scifi':
        return <Cpu className="h-5 w-5 text-orange-500" />
      case 'neon':
        return <Sparkles className="h-5 w-5 text-cyan-400" />
      case 'dark':
        return <Moon className="h-5 w-5" />
      default:
        return <Sun className="h-5 w-5" />
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-9 h-9 p-0"
          aria-label={`Current theme: ${themes[theme].name}`}
        >
          {getThemeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('night-vision')}>
          <Eye className="mr-2 h-4 w-4 text-red-500" />
          Night Vision
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('tufte')}>
          <BookOpen className="mr-2 h-4 w-4" />
          Tufte
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark-tufte')}>
          <BookOpenCheck className="mr-2 h-4 w-4" />
          Dark Tufte
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('green-screen')}>
          <Tv className="mr-2 h-4 w-4 text-green-500" />
          Green Screen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('c64')}>
          <Gamepad2 className="mr-2 h-4 w-4 text-blue-400" />
          C64
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('fallout')}>
          <Zap className="mr-2 h-4 w-4 text-green-400" />
          Fallout
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('scifi')}>
          <Cpu className="mr-2 h-4 w-4 text-orange-500" />
          SciFi
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('neon')}>
          <Sparkles className="mr-2 h-4 w-4 text-cyan-400" />
          Neon
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
