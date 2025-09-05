# ESC Themes

This directory contains theme configurations for the ESC telescope control application.

## SciFi Theme

The SciFi theme is a retro-futuristic LCARS-inspired theme with vibrant orange, purple, and cyan colors on a dark background.

### Features

- **Color Palette**: Based on Star Trek LCARS interface colors
  - Primary: Vibrant Orange (#FF8A00) 
  - Secondary: Purple/Lavender (#B88AFF)
  - Accent: Cyan Blue (#00BFFF)
  - Success: Neon Green (#00FF88)
  - Warning: Gold (#FFD700)
  - Error: Red-Orange (#FF4545)

- **Visual Effects**:
  - Neon glow effects on focus and hover
  - Animated scan lines and pulse effects
  - Gradient backgrounds with blur effects
  - Monospace fonts for data readouts
  - Status indicators with animations

- **Components**: Custom SciFi-styled components available:
  - `SciFiPanel` - LCARS-style panels with status indicators (default, curved, lcars variants)
  - `SciFiButton` - Futuristic buttons with glow effects
  - `SciFiIndicator` - Data readouts with status colors
  - `SciFiProgress` - Progress bars with scan animations
  - `SciFiStatusIndicator` - Status lights with pulse effects
  - `SciFiAlert` - Alert panels with tech borders
  - `LCARSFrame` - Distinctive elbow frame with curved corners
  - `LCARSSidebar` - Curved sidebar items with LCARS styling
  - `LCARSButtonBar` - Curved button bar with angular cuts
  - `LCARSMeter` - Vertical meter with LCARS aesthetics

### Usage

1. Select "SciFi" from the theme dropdown in the header
2. Use the SciFi components from `@/components/ui/scifi-elements`
3. Apply CSS classes like `neon-text`, `data-readout`, `data-panel` for enhanced styling

### Example

```tsx
import { SciFiPanel, SciFiIndicator } from '@/components/ui/scifi-elements'

<SciFiPanel title="Telescope Status" status="active">
  <SciFiIndicator label="RA Position" value="12h 34m 56s" status="good" />
</SciFiPanel>
```

The theme automatically applies to all existing ESC components while providing enhanced SciFi-specific styling and animations.