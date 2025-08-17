'use client';

import {useTheme} from 'next-themes'
import {ReactNode, useEffect, useState} from 'react'
import CrtMonitor from "@/components/CrtMonitor"

export function ThemeWrapper({children}: { children: ReactNode }) {
  const {theme} = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  console.log('ThemeWrapper: theme', theme)

  // if (theme !== 'c64') return <>{children}</>

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-10">
      <CrtMonitor width={1024} height={720} bezelLabel="VINTAGE-3200" curvature={0.15}>
      {children}
      </CrtMonitor>
    </div>
  )
}
