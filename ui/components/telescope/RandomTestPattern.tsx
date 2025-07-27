"use client"

import { useState, useEffect } from "react"
import { TestPattern } from "./TestPattern"
import { VintageTestPattern } from "./VintageTestPattern"
import { VintageColorTestPattern } from "@/components/telescope/VintageColorTestPattern"
import { RCAIndianHeadTestPattern } from "@/components/telescope/RCAIndianHeadTestPattern"

interface RandomTestPatternProps {
  width?: number
  height?: number
  className?: string
  statusText?: string
}

export function RandomTestPattern({ width = 800, height = 600, className = "", statusText }: RandomTestPatternProps) {
  const [patternType, setPatternType] = useState<'modern' | 'vintage' | 'vintageColor' | 'rcaIndianHead'>('modern')

  // Randomly select pattern on mount
  useEffect(() => {
    const random = Math.random()
    let selectedPattern: 'modern' | 'vintage' | 'vintageColor' | 'rcaIndianHead'
    
    if (random < 0.25) {
      selectedPattern = 'modern'
    } else if (random < 0.5) {
      selectedPattern = 'vintage'
    } else if (random < 0.75) {
      selectedPattern = 'vintageColor'
    } else {
      selectedPattern = 'rcaIndianHead'
    }
    
    setPatternType(selectedPattern)
    console.log(`Selected ${selectedPattern} test pattern`)
  }, [])

  switch (patternType) {
    case 'vintage':
      return (
        <VintageTestPattern
          width={width}
          height={height}
          className={className}
          statusText={statusText}
        />
      )
    case 'vintageColor':
      return (
        <VintageColorTestPattern
          width={width}
          height={height}
          className={className}
          statusText={statusText}
        />
      )
    case 'rcaIndianHead':
      return (
        <RCAIndianHeadTestPattern
          width={width}
          height={height}
          className={className}
          statusText={statusText}
        />
      )
    default:
      return (
        <TestPattern
          width={width}
          height={height}
          className={className}
          statusText={statusText}
        />
      )
  }
}
