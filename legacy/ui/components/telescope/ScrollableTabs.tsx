"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ScrollableTabsProps {
  children: React.ReactNode
  className?: string
}

export function ScrollableTabs({ children, className = "" }: ScrollableTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [showScrollIndicators, setShowScrollIndicators] = useState(false)

  const checkScrollability = () => {
    if (!scrollRef.current) return

    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
    setShowScrollIndicators(scrollWidth > clientWidth)
  }

  useEffect(() => {
    checkScrollability()
    const handleResize = () => checkScrollability()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -120, behavior: "smooth" })
    }
  }

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 120, behavior: "smooth" })
    }
  }

  return (
    <div className="relative">
      {/* Left scroll indicator */}
      {showScrollIndicators && (
        <>
          <div
            className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-800 to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
          />
          <Button
            variant="ghost"
            size="sm"
            className={`absolute left-1 top-1/2 -translate-y-1/2 z-20 h-8 w-6 p-0 bg-gray-700/80 hover:bg-gray-600/80 transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={scrollLeft}
            aria-label="Scroll tabs left"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className={`flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 ${className}`}
        onScroll={checkScrollability}
        style={{
          scrollbarWidth: "thin",
          msOverflowStyle: "none",
        }}
      >
        {children}
      </div>

      {/* Right scroll indicator */}
      {showScrollIndicators && (
        <>
          <div
            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-800 to-transparent z-10 pointer-events-none transition-opacity duration-200 ${
              canScrollRight ? "opacity-100" : "opacity-0"
            }`}
          />
          <Button
            variant="ghost"
            size="sm"
            className={`absolute right-1 top-1/2 -translate-y-1/2 z-20 h-8 w-6 p-0 bg-gray-700/80 hover:bg-gray-600/80 transition-opacity duration-200 ${
              canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={scrollRight}
            aria-label="Scroll tabs right"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      )}

      {/* Scroll hint animation (shows briefly on load) */}
      {showScrollIndicators && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="animate-pulse text-gray-400 text-xs opacity-60">← →</div>
        </div>
      )}
    </div>
  )
}
