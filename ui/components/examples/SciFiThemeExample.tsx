/**
 * Example component showing how to use SciFi theme elements
 * This demonstrates the LCARS-inspired styling and components
 */
import React from 'react'
import { 
  SciFiPanel, 
  SciFiButton, 
  SciFiIndicator, 
  SciFiProgress, 
  SciFiStatusIndicator,
  SciFiAlert 
} from '@/components/ui/scifi-elements'

export const SciFiThemeExample: React.FC = () => {
  return (
    <div className="space-y-6 p-6 bg-background min-h-screen">
      <h1 className="text-3xl font-bold text-primary neon-text">
        ESC - SciFi Theme Demo
      </h1>
      
      {/* Status Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SciFiPanel title="Telescope Status" status="active">
          <div className="space-y-3">
            <SciFiStatusIndicator status="online" label="Connection" />
            <SciFiIndicator label="RA Position" value="12h 34m 56s" status="good" />
            <SciFiIndicator label="DEC Position" value="+45° 12' 30\"" status="good" />
            <SciFiIndicator label="Temperature" value="23" unit="°C" status="good" />
          </div>
        </SciFiPanel>
        
        <SciFiPanel title="Camera System" status="warning">
          <div className="space-y-3">
            <SciFiStatusIndicator status="warning" label="Focus" />
            <SciFiIndicator label="Exposure" value="30" unit="s" status="good" />
            <SciFiIndicator label="Gain" value="80" status="warning" />
            <SciFiProgress value={75} max={100} label="Focus Progress" />
          </div>
        </SciFiPanel>
        
        <SciFiPanel title="Power Systems" status="idle">
          <div className="space-y-3">
            <SciFiStatusIndicator status="online" label="Main Power" />
            <SciFiIndicator label="Battery" value="87" unit="%" status="good" />
            <SciFiProgress value={87} max={100} label="Battery Level" color="success" />
          </div>
        </SciFiPanel>
      </div>
      
      {/* Control Buttons */}
      <div className="flex flex-wrap gap-4">
        <SciFiButton variant="primary">Start Imaging</SciFiButton>
        <SciFiButton variant="secondary">Calibrate</SciFiButton>
        <SciFiButton variant="danger">Emergency Stop</SciFiButton>
      </div>
      
      {/* Alerts */}
      <div className="space-y-4">
        <SciFiAlert>
          <strong>System Status:</strong> All systems nominal. Ready for observation.
        </SciFiAlert>
        
        <SciFiAlert variant="warning">
          <strong>Warning:</strong> Wind speed increasing. Monitor conditions.
        </SciFiAlert>
        
        <SciFiAlert variant="error">
          <strong>Error:</strong> Connection lost to mount. Retrying...
        </SciFiAlert>
      </div>
      
      {/* Data Readouts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 border border-border data-readout">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Altitude</div>
          <div className="text-2xl font-mono font-bold text-primary">45.7°</div>
        </div>
        <div className="bg-card p-4 border border-border data-readout">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Azimuth</div>
          <div className="text-2xl font-mono font-bold text-primary">178.3°</div>
        </div>
        <div className="bg-card p-4 border border-border data-readout">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Focus</div>
          <div className="text-2xl font-mono font-bold text-accent">12,450</div>
        </div>
        <div className="bg-card p-4 border border-border data-readout">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Frames</div>
          <div className="text-2xl font-mono font-bold text-secondary">156/300</div>
        </div>
      </div>
      
      <div className="text-sm text-muted-foreground">
        Switch to the SciFi theme using the theme toggle in the header to see the full LCARS-inspired styling.
      </div>
    </div>
  )
}

export default SciFiThemeExample