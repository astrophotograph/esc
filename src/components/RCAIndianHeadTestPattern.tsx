interface RCAIndianHeadTestPatternProps {
  width?: number
  height?: number
  className?: string
  statusText?: string
}

export function RCAIndianHeadTestPattern({
  width = 800,
  height = 600,
  className = '',
  statusText,
}: RCAIndianHeadTestPatternProps) {
  return (
    <div className={`flex items-center justify-center bg-black ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width, height }}>
        {/* SVG Test Pattern */}
        <img
          src="/RCA_Indian_Head_Test_Pattern.svg"
          alt="RCA Indian Head Test Pattern"
          className="w-full h-full object-contain"
          draggable={false}
        />

        {/* Status text overlay */}
        {statusText && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded font-mono text-sm">
            {statusText}
          </div>
        )}

        {/* Vintage TV effect overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Slight static noise */}
          <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxwYXR0ZXJuIGlkPSJub2lzZSIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjEiLz4KICAgICAgPHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMSIvPgogICAgPC9wYXR0ZXJuPgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0idXJsKCNub2lzZSkiLz4KPC9zdmc+')] opacity-5"></div>

          {/* Subtle scanlines effect */}
          <div className="w-full h-full bg-gradient-to-b from-transparent via-black to-transparent opacity-[0.02] bg-[length:100%_3px] bg-repeat-y"></div>
        </div>
      </div>
    </div>
  )
}
