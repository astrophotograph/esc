import { useState, useEffect } from 'react'
import { MessageCircle, Github, AlertCircle } from 'lucide-react'
import { Badge } from './ui/badge'

interface AppFooterProps {
  version?: string
  buildNumber?: string
}

export function AppFooter({ version = 'v25.09.15', buildNumber = '#1' }: AppFooterProps) {
  const [currentDateTime, setCurrentDateTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }) + ' ' + date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return (
    <footer className="hidden sm:flex items-center justify-between px-4 py-2 bg-card border-t border-border text-sm text-muted-foreground">
      {/* Left Section - Version Info */}
      <div className="flex items-center gap-3">
        <span className="font-medium">ESC {version}</span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          beta
        </Badge>
        <span className="text-muted-foreground/60">•</span>
        <span className="font-mono">{formatDateTime(currentDateTime)}</span>
        <span className="text-muted-foreground/60">•</span>
        <span className="font-mono">{buildNumber}</span>
      </div>

      {/* Right Section - Links */}
      <div className="flex items-center gap-4">
        <a
          href="https://discord.gg/your-server"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Discord</span>
        </a>
        <span className="text-muted-foreground/60">•</span>
        <a
          href="https://github.com/your-repo/esc"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <Github className="h-4 w-4" />
          <span>GitHub</span>
        </a>
        <span className="text-muted-foreground/60">•</span>
        <a
          href="https://github.com/your-repo/esc/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <AlertCircle className="h-4 w-4" />
          <span>Report Issue</span>
        </a>
      </div>
    </footer>
  )
}
