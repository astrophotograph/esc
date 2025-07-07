"use client"

import { useState, useEffect } from "react"
import type { Telescope } from "../types/telescope-types"

interface UseTelescopesReturn {
  telescopes: Telescope[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTelescopes(): UseTelescopesReturn {
  const [telescopes, setTelescopes] = useState<Telescope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTelescopes = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/telescopes")

      if (!response.ok) {
        throw new Error(`Failed to fetch telescopes: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      setTelescopes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred")
      console.error("Error fetching telescopes:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTelescopes()
  }, [])

  return {
    telescopes,
    loading,
    error,
    refetch: fetchTelescopes,
  }
}
