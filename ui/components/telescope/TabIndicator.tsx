"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface TabIndicatorProps {
  type: "active" | "notification" | "warning" | "info" | "count"
  count?: number
  className?: string
}

export function TabIndicator({ type, count, className }: TabIndicatorProps) {
  if (type === "count" && count && count > 0) {
    return (
      <Badge
        variant="secondary"
        className={cn("ml-1 h-5 min-w-5 px-1.5 text-xs font-medium bg-blue-600 text-white border-0", className)}
      >
        {count > 99 ? "99+" : count}
      </Badge>
    )
  }

  if (type === "active") {
    return <div className={cn("ml-1 w-2 h-2 rounded-full bg-green-500 animate-pulse", className)} />
  }

  if (type === "notification") {
    return <div className={cn("ml-1 w-2 h-2 rounded-full bg-blue-500", className)} />
  }

  if (type === "warning") {
    return <div className={cn("ml-1 w-2 h-2 rounded-full bg-yellow-500 animate-pulse", className)} />
  }

  if (type === "info") {
    return <div className={cn("ml-1 w-2 h-2 rounded-full bg-cyan-500", className)} />
  }

  return null
}
