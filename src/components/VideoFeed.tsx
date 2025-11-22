import { useState, useEffect } from 'react'
import { useTelescopeStore } from '@/stores/telescopeStore'

interface VideoFeedProps {
  telescopeId?: string
  className?: string
}

export function VideoFeed({ telescopeId, className = '' }: VideoFeedProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentTelescopeId = useTelescopeStore(state => state.currentTelescopeId)

  const activeTelescopeId = telescopeId || currentTelescopeId

  useEffect(() => {
    if (!activeTelescopeId) {
      setError('No telescope selected')
      setIsStreaming(false)
      return
    }

    // Clear error when starting stream
    setError(null)
    setIsStreaming(true)

    // Cleanup function
    return () => {
      setIsStreaming(false)
    }
  }, [activeTelescopeId])

  if (!activeTelescopeId) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <p className="text-lg">No telescope selected</p>
          <p className="text-sm mt-2">Please add and connect a telescope to view live feed</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-red-400">
          <p className="text-lg">Stream Error</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    )
  }

  const streamUrl = `http://localhost:8080/stream/${activeTelescopeId}`

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Video stream */}
      <img
        src={streamUrl}
        alt="Telescope live feed"
        className="w-full h-full object-contain"
        onError={() => {
          setError('Failed to load video stream')
          setIsStreaming(false)
        }}
        onLoad={() => {
          setIsStreaming(true)
          setError(null)
        }}
      />

      {/* Status indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-2 rounded-lg">
        <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white text-sm font-medium">
          {isStreaming ? 'LIVE' : 'CONNECTING...'}
        </span>
      </div>

      {/* Telescope ID badge */}
      <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-2 rounded-lg">
        <span className="text-white text-sm font-mono">
          {activeTelescopeId}
        </span>
      </div>
    </div>
  )
}
