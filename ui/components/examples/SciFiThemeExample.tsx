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
  SciFiAlert,
  LCARSFrame,
  LCARSSidebar,
  LCARSButtonBar,
  LCARSMeter
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
      
      {/* LCARS Curved Elements Section */}
      <h2 className="text-2xl font-bold text-secondary neon-text">LCARS Curved Elements</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LCARS Sidebar */}
        <div>
          <h3 className="text-lg mb-3 text-accent">System Status</h3>
          <LCARSSidebar
            items={[
              { label: 'Core Temp', value: '72°C', color: 'bg-primary' },
              { label: 'CPU Load', value: '45%', color: 'bg-secondary' },
              { label: 'Memory', value: '8.2GB', color: 'bg-accent' },
              { label: 'Network', value: 'Online', color: 'bg-green-400' },
              { label: 'Storage', value: '512GB', color: 'bg-yellow-400' }
            ]}
          />
        </div>
        
        {/* LCARS Curved Panels */}
        <div className="space-y-4">
          <SciFiPanel title="Navigation" variant="lcars">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Bearing</span>
                <span className="font-mono">247.3°</span>
              </div>
              <div className="flex justify-between">
                <span>Distance</span>
                <span className="font-mono">1,247 km</span>
              </div>
              <div className="flex justify-between">
                <span>ETA</span>
                <span className="font-mono">00:47:23</span>
              </div>
            </div>
          </SciFiPanel>
          
          <SciFiPanel title="Sensors" variant="curved">
            <div className="grid grid-cols-2 gap-2">
              <SciFiIndicator label="Pressure" value="1013" unit="hPa" />
              <SciFiIndicator label="Humidity" value="67" unit="%" />
            </div>
          </SciFiPanel>
        </div>
        
        {/* LCARS Meters */}
        <div className="flex gap-4">
          <LCARSMeter value={75} label="Power" color="primary" />
          <LCARSMeter value={42} label="Shield" color="accent" />
          <LCARSMeter value={90} label="Health" color="success" />
        </div>
      </div>
      
      {/* LCARS Frame Example */}
      <LCARSFrame color="secondary">
        <h3 className="text-xl font-bold mb-3">LCARS Frame Component</h3>
        <p className="text-muted-foreground">
          This demonstrates the distinctive LCARS elbow frame with curved corners,
          commonly seen in Star Trek interfaces.
        </p>
      </LCARSFrame>
      
      {/* LCARS Button Bar */}
      <div>
        <h3 className="text-lg mb-3 text-accent">Command Interface</h3>
        <LCARSButtonBar
          buttons={[
            { label: 'Engage', color: 'bg-primary' },
            { label: 'Scan', color: 'bg-accent' },
            { label: 'Shields', color: 'bg-secondary' },
            { label: 'Alert', color: 'bg-yellow-400' },
            { label: 'Emergency', color: 'bg-red-400' }
          ]}
        />
      </div>
      
      <div className="text-sm text-muted-foreground">
        Switch to the SciFi theme using the theme toggle in the header to see the full LCARS-inspired styling
        with curved elements and authentic Star Trek interface design.
      </div>
    </div>
  )
}

export default SciFiThemeExample