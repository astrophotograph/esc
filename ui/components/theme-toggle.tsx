"use client"

import * as React from "react"
import { Moon, Sun, Monitor, Eye, BookOpen } from "lucide-react"
import { useTheme } from "next-themes"
import { useIsMobile } from "@/hooks/use-mobile"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const isMobile = useIsMobile()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button 
        variant="outline" 
        size={isMobile ? "sm" : "icon"} 
        className={isMobile ? "px-2" : ""}
        disabled
      >
        <Sun className={isMobile ? "h-3 w-3" : "h-[1.2rem] w-[1.2rem]"} />
      </Button>
    )
  }

  // Determine which icon to show based on current theme
  const getThemeIcon = () => {
    if (theme === "night-vision") {
      return <Eye className={`${isMobile ? "h-3 w-3" : "h-[1.2rem] w-[1.2rem]"} text-red-500`} />
    }
    if (theme === "tufte") {
      return <BookOpen className={`${isMobile ? "h-3 w-3" : "h-[1.2rem] w-[1.2rem]"}`} />
    }
    return (
      <>
        <Sun className={`${isMobile ? "h-3 w-3" : "h-[1.2rem] w-[1.2rem]"} rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 night-vision:scale-0 tufte:scale-0`} />
        <Moon className={`absolute ${isMobile ? "h-3 w-3" : "h-[1.2rem] w-[1.2rem]"} rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 night-vision:scale-0 tufte:scale-0`} />
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size={isMobile ? "sm" : "icon"} 
          title="Toggle theme"
          className={isMobile ? "px-2" : ""}
        >
          {getThemeIcon()}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("night-vision")}>
          <Eye className="mr-2 h-4 w-4 text-red-500" />
          Night Vision
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("tufte")}>
          <BookOpen className="mr-2 h-4 w-4" />
          Tufte
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}