"use client"

import { useState, useEffect } from "react"
import { TestPattern } from "./TestPattern"
import { VintageTestPattern } from "./VintageTestPattern"

interface RandomTestPatternProps {
  width?: number
  height?: number
  className?: string
}

export function RandomTestPattern({ width = 800, height = 600, className = "" }: RandomTestPatternProps) {
  const [useVintage, setUseVintage] = useState<boolean>(false)

  // Randomly select pattern on mount
  useEffect(() => {
    const isVintage = Math.random() < 0.5 // 50/50 chance
    setUseVintage(isVintage)
    console.log(`Selected ${isVintage ? 'vintage' : 'modern'} test pattern`)
  }, [])

  if (useVintage) {
    return (
      <VintageTestPattern 
        width={width} 
        height={height} 
        className={className}
      />
    )
  } else {
    return (
      <TestPattern 
        width={width} 
        height={height} 
        className={className}
      />
    )
  }
}