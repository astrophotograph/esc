import React from 'react'
import { cn } from '@/lib/utils'

export const SciFiPanel: React.FC<{
  title?: string
  children: React.ReactNode
  className?: string
  status?: 'active' | 'warning' | 'error' | 'idle'
  variant?: 'default' | 'curved' | 'lcars'
}> = ({ title, children, className, status = 'idle', variant = 'default' }) => {
  const statusColors = {
    active: 'border-l-green-400',
    warning: 'border-l-yellow-400', 
    error: 'border-l-red-400',
    idle: 'border-l-primary'
  }

  if (variant === 'lcars') {
    return (
      <div className={cn('relative', className)}>
        <div className="lcars-panel bg-card/90 backdrop-blur-sm">
          {title && (
            <div className="lcars-header bg-primary px-6 py-2">
              <h3 className="text-primary-foreground font-bold uppercase tracking-wider">
                {title}
              </h3>
            </div>
          )}
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'curved') {
    return (
      <div className={cn('relative', className)}>
        <div className="lcars-curved-panel bg-card/80 backdrop-blur-sm">
          {title && (
            <h3 className="text-primary font-bold uppercase tracking-wider mb-3 neon-text px-4 pt-4">
              {title}
            </h3>
          )}
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'relative data-panel',
      'border-l-4',
      statusColors[status],
      'bg-card/80 backdrop-blur-sm',
      'p-4 rounded-r-lg',
      className
    )}>
      {title && (
        <h3 className="text-primary font-bold uppercase tracking-wider mb-3 neon-text">
          {title}
        </h3>
      )}
      <div className="relative">
        {children}
      </div>
      <div className="absolute top-2 right-2 flex gap-1">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <div className="w-2 h-2 bg-yellow-400 rounded-full" />
        <div className="w-2 h-2 bg-cyan-400 rounded-full" />
      </div>
    </div>
  )
}

export const SciFiButton: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
  disabled?: boolean
}> = ({ children, onClick, variant = 'primary', className, disabled }) => {
  const variants = {
    primary: 'bg-primary hover:bg-primary/80 text-primary-foreground btn-primary',
    secondary: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
    danger: 'bg-destructive hover:bg-destructive/80 text-destructive-foreground'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 font-semibold uppercase tracking-wider',
        'transition-all duration-200',
        'hover:shadow-[0_0_20px_rgba(255,138,0,0.5)]',
        'hover:scale-105',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  )
}

export const SciFiIndicator: React.FC<{
  label: string
  value: string | number
  unit?: string
  status?: 'good' | 'warning' | 'critical'
  className?: string
}> = ({ label, value, unit, status = 'good', className }) => {
  const statusColors = {
    good: 'text-green-400 status-online',
    warning: 'text-yellow-400 status-warning',
    critical: 'text-red-400 status-error'
  }

  return (
    <div className={cn('bg-background/50 border border-border p-3 rounded data-readout', className)}>
      <div className="text-muted-foreground text-xs uppercase tracking-widest mb-1">
        {label}
      </div>
      <div className={cn('text-2xl font-mono font-bold', statusColors[status])}>
        {value}
        {unit && <span className="text-lg text-muted-foreground ml-1">{unit}</span>}
      </div>
    </div>
  )
}

export const SciFiProgress: React.FC<{
  value: number
  max?: number
  label?: string
  className?: string
  color?: 'primary' | 'success' | 'warning' | 'error'
}> = ({ value, max = 100, label, className, color = 'primary' }) => {
  const percentage = Math.min((value / max) * 100, 100)
  
  const colorStyles = {
    primary: 'bg-primary',
    success: 'bg-green-400',
    warning: 'bg-yellow-400', 
    error: 'bg-red-400'
  }

  return (
    <div className={cn('relative', className)}>
      {label && (
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </div>
      )}
      <div className="relative h-6 bg-muted border border-border overflow-hidden rounded progress-bar">
        <div 
          className={cn(
            'absolute inset-y-0 left-0 transition-all duration-300 progress-fill',
            colorStyles[color]
          )}
          style={{ width: `${percentage}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-sm font-semibold data-readout">
            {Math.round(value)}/{max}
          </span>
        </div>
        {/* Notches for visual detail */}
        <div className="absolute inset-y-0 left-0 right-0 flex">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex-1 border-r border-border/30" />
          ))}
        </div>
      </div>
    </div>
  )
}

export const SciFiStatusIndicator: React.FC<{
  status: 'online' | 'offline' | 'warning' | 'error'
  label?: string
  className?: string
}> = ({ status, label, className }) => {
  const statusConfig = {
    online: { color: 'bg-green-400', animate: 'animate-pulse', glow: 'shadow-[0_0_10px_rgba(34,197,94,0.8)]' },
    offline: { color: 'bg-muted-foreground', animate: '', glow: '' },
    warning: { color: 'bg-yellow-400', animate: 'animate-pulse', glow: 'shadow-[0_0_10px_rgba(234,179,8,0.8)]' },
    error: { color: 'bg-red-400', animate: 'animate-pulse', glow: 'shadow-[0_0_10px_rgba(248,113,113,0.8)]' }
  }

  const config = statusConfig[status]

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div className="relative">
        <div className={cn(
          'w-3 h-3 rounded-full status-indicator',
          config.color,
          config.animate,
          config.glow
        )} />
        {(status === 'online' || status === 'error' || status === 'warning') && (
          <div className={cn(
            'absolute inset-0 rounded-full',
            config.color,
            'animate-ping opacity-75'
          )} />
        )}
      </div>
      {label && (
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  )
}

export const SciFiAlert: React.FC<{
  children: React.ReactNode
  variant?: 'default' | 'warning' | 'error'
  className?: string
}> = ({ children, variant = 'default', className }) => {
  const variants = {
    default: 'alert border-l-primary',
    warning: 'alert alert-warning border-l-yellow-400',
    error: 'alert alert-error border-l-red-400'
  }

  return (
    <div className={cn(variants[variant], 'p-4 rounded-r', className)}>
      {children}
    </div>
  )
}

// LCARS-style curved frame component
export const LCARSFrame: React.FC<{
  children: React.ReactNode
  className?: string
  color?: 'primary' | 'secondary' | 'accent' | 'warning' | 'success'
}> = ({ children, className, color = 'primary' }) => {
  const colorMap = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    accent: 'bg-accent',
    warning: 'bg-yellow-400',
    success: 'bg-green-400'
  }

  return (
    <div className={cn('lcars-frame relative', className)}>
      <div className={cn('lcars-elbow', colorMap[color])} />
      <div className="lcars-content">
        {children}
      </div>
    </div>
  )
}

// LCARS-style sidebar component
export const LCARSSidebar: React.FC<{
  items: Array<{ label: string; value: string | number; color?: string }>
  className?: string
}> = ({ items, className }) => {
  return (
    <div className={cn('lcars-sidebar flex flex-col gap-2', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            'lcars-sidebar-item',
            'px-4 py-2',
            item.color || 'bg-primary'
          )}
        >
          <div className="text-xs uppercase tracking-wider opacity-80">
            {item.label}
          </div>
          <div className="text-lg font-bold">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// LCARS-style curved button bar
export const LCARSButtonBar: React.FC<{
  buttons: Array<{ label: string; onClick?: () => void; color?: string }>
  className?: string
}> = ({ buttons, className }) => {
  return (
    <div className={cn('lcars-button-bar flex gap-2', className)}>
      {buttons.map((button, index) => (
        <button
          key={index}
          onClick={button.onClick}
          className={cn(
            'lcars-bar-button',
            'px-6 py-3',
            'font-bold uppercase tracking-wider',
            'transition-all duration-200',
            button.color || 'bg-primary',
            'hover:brightness-110'
          )}
        >
          {button.label}
        </button>
      ))}
    </div>
  )
}

// LCARS-style curved meter
export const LCARSMeter: React.FC<{
  value: number
  max?: number
  label?: string
  height?: number
  color?: 'primary' | 'success' | 'warning' | 'error'
  className?: string
}> = ({ value, max = 100, label, height = 200, color = 'primary', className }) => {
  const percentage = Math.min((value / max) * 100, 100)
  
  const colorStyles = {
    primary: 'bg-primary',
    success: 'bg-green-400',
    warning: 'bg-yellow-400',
    error: 'bg-red-400'
  }

  return (
    <div className={cn('lcars-meter', className)}>
      {label && (
        <div className="text-xs uppercase tracking-wider mb-2 text-muted-foreground">
          {label}
        </div>
      )}
      <div 
        className="relative bg-muted/30 overflow-hidden"
        style={{ height: `${height}px` }}
      >
        <div className="lcars-meter-track" />
        <div 
          className={cn(
            'lcars-meter-fill absolute bottom-0 left-0 right-0 transition-all duration-500',
            colorStyles[color]
          )}
          style={{ height: `${percentage}%` }}
        >
          <div className="lcars-meter-glow" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold font-mono">
            {Math.round(value)}
          </span>
        </div>
      </div>
    </div>
  )
}