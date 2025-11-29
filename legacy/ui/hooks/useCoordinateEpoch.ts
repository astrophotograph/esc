import { useState, useCallback, useEffect } from 'react'
import { j2000ToJNow, jNowToJ2000, type ProperMotion } from '../utils/coordinate-precession'
import { parseRA, parseDec } from '../utils/celestial-calculations'

export type CoordinateEpoch = 'J2000' | 'JNow'

interface CoordinateConversionOptions {
  includeNutation?: boolean
  properMotion?: ProperMotion | null
}

export function useCoordinateEpoch(defaultEpoch: CoordinateEpoch = 'J2000') {
  // Store the user's preference in localStorage
  const [epoch, setEpoch] = useState<CoordinateEpoch>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('coordinate-epoch')
      return (stored as CoordinateEpoch) || defaultEpoch
    }
    return defaultEpoch
  })

  // Update localStorage when epoch changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('coordinate-epoch', epoch)
    }
  }, [epoch])

  // Convert coordinates from J2000 to current epoch if needed
  const convertFromJ2000 = useCallback((
    ra: number | string,
    dec: number | string,
    options: CoordinateConversionOptions = {}
  ) => {
    // Parse string coordinates if needed
    const raNum = typeof ra === 'string' ? parseRA(ra) : ra
    const decNum = typeof dec === 'string' ? parseDec(dec) : dec

    if (epoch === 'J2000') {
      return { ra: raNum, dec: decNum }
    }

    // Convert to JNow
    return j2000ToJNow(
      { ra: raNum, dec: decNum },
      new Date(),
      options.properMotion || null,
      options.includeNutation !== false // Default to true
    )
  }, [epoch])

  // Convert coordinates from current epoch to J2000 if needed
  const convertToJ2000 = useCallback((
    ra: number | string,
    dec: number | string,
    options: CoordinateConversionOptions = {}
  ) => {
    // Parse string coordinates if needed
    const raNum = typeof ra === 'string' ? parseRA(ra) : ra
    const decNum = typeof dec === 'string' ? parseDec(dec) : dec

    if (epoch === 'J2000') {
      return { ra: raNum, dec: decNum }
    }

    // Convert from JNow to J2000
    return jNowToJ2000(
      { ra: raNum, dec: decNum },
      new Date(),
      options.properMotion || null,
      options.includeNutation !== false // Default to true
    )
  }, [epoch])

  // Format coordinates for display with epoch label
  const formatWithEpoch = useCallback((
    ra: number | string,
    dec: number | string
  ): string => {
    const raNum = typeof ra === 'string' ? parseRA(ra) : ra
    const decNum = typeof dec === 'string' ? parseDec(dec) : dec

    const epochLabel = epoch === 'JNow' 
      ? `J${new Date().getFullYear()}.${Math.floor((new Date().getMonth() + 1) / 12 * 10)}`
      : 'J2000'

    return `${epochLabel}`
  }, [epoch])

  // Toggle between epochs
  const toggleEpoch = useCallback(() => {
    setEpoch(prev => prev === 'J2000' ? 'JNow' : 'J2000')
  }, [])

  return {
    epoch,
    setEpoch,
    toggleEpoch,
    convertFromJ2000,
    convertToJ2000,
    formatWithEpoch,
    isJ2000: epoch === 'J2000',
    isJNow: epoch === 'JNow'
  }
}