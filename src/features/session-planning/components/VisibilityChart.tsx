import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { toChartData, chartXTicks, eventLabels, twilightIndices } from '../utils/visibilityHelpers'
import type { VisibilityCurveData } from '../utils/visibilityHelpers'

interface VisibilityChartProps {
  data: VisibilityCurveData
  minAltDeg: number
  height?: number
}

export function VisibilityChart({ data, minAltDeg, height = 200 }: VisibilityChartProps) {
  const chartData = toChartData(data.curve, minAltDeg)
  const ticks = chartXTicks(data.curve)
  const labels = eventLabels(data.events)
  const { darkStart, darkEnd } = twilightIndices(data.curve, data.twilight)

  const darkStartLabel = darkStart != null ? data.curve[darkStart]?.time_label : undefined
  const darkEndLabel = darkEnd != null ? data.curve[darkEnd]?.time_label : undefined

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />

          {/* Astronomical darkness shading */}
          {darkStartLabel && darkEndLabel && (
            <ReferenceArea
              x1={darkStartLabel}
              x2={darkEndLabel}
              fill="rgba(99,102,241,0.08)"
              stroke="none"
            />
          )}

          <XAxis
            dataKey="time_label"
            ticks={ticks}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 90]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => `${v}°`}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="bg-popover border rounded px-2 py-1 text-xs space-y-0.5">
                  <div className="font-medium">{d.time_label}</div>
                  <div>Alt: {d.altitude_deg.toFixed(1)}°</div>
                  <div>Az: {d.azimuth_deg.toFixed(1)}°</div>
                  <div className="text-muted-foreground">Sun: {d.sun_altitude_deg.toFixed(1)}°</div>
                </div>
              )
            }}
          />

          {/* Min altitude threshold line */}
          <ReferenceLine
            y={minAltDeg}
            stroke="#f59e0b"
            strokeDasharray="4 2"
            label={{ value: `${minAltDeg}°`, position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }}
          />

          {/* Rise / transit / set markers */}
          {labels.rise && (
            <ReferenceLine x={labels.rise} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="3 3" />
          )}
          {labels.transit && (
            <ReferenceLine x={labels.transit} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="3 3" />
          )}
          {labels.set && (
            <ReferenceLine x={labels.set} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />
          )}

          <Area
            type="monotone"
            dataKey="altDisplay"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#altGradient)"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-1 text-xs text-muted-foreground">
        {labels.rise && <span className="text-green-500">↑ Rise {labels.rise}</span>}
        {labels.transit && <span className="text-blue-400">⊙ Transit {labels.transit}</span>}
        {labels.set && <span className="text-red-400">↓ Set {labels.set}</span>}
        {darkStartLabel && darkEndLabel && (
          <span className="text-indigo-400">◾ Dark {darkStartLabel}–{darkEndLabel}</span>
        )}
      </div>
    </div>
  )
}
