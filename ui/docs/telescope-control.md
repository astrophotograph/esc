# Telescope Control

Complete guide to controlling your Seestar telescope's movement and positioning.

## Movement Controls

### Directional Pad
The primary method for manual telescope movement:

```
    [↑]        North (Declination +)
[←]  ·  [→]    West ← → East (RA -/+)  
    [↓]        South (Declination -)
```

- **Click**: Single step movement
- **Hold**: Continuous movement
- **Keyboard**: Arrow keys for movement

### Movement Speeds

Select appropriate speed for your task:

1. **1x (Fine)**: 
   - Precise centering
   - Final adjustments
   - ~0.25°/second

2. **2x (Slow)**:
   - General positioning
   - Careful framing
   - ~0.5°/second

3. **4x (Medium)**:
   - Searching for objects
   - Large adjustments
   - ~1°/second

4. **8x (Fast)**:
   - Quick repositioning
   - Horizon to horizon
   - ~2°/second

### Keyboard Control
- **Arrow Keys**: Move in cardinal directions
- **Shift + Arrow**: Move at maximum speed
- **Ctrl + Arrow**: Fine adjustment (1x speed)
- **Space**: Stop all movement

## GoTo Functionality

### Using GoTo

1. **Enter Coordinates**:
   - Right Ascension: HH:MM:SS or decimal degrees
   - Declination: ±DD:MM:SS or decimal degrees
   - Example: RA: 05:34:32, Dec: +22:00:52

2. **Target Selection**:
   - Click "GoTo" button or press Enter
   - Telescope calculates path
   - Movement begins automatically

3. **GoTo Progress**:
   - Progress indicator shows completion
   - Current coordinates update in real-time
   - Automatic stop at target

### GoTo from Catalog

1. **Open Celestial Search**: 
   - Press `Ctrl+K` or `/`
   - Click Search button in toolbar

2. **Select Object**:
   - Search by name (M31, NGC 1234, Vega)
   - Filter by type and visibility
   - Click "GoTo" on selected object

3. **Confirmation**:
   - Coordinates populate automatically
   - Review before confirming
   - Track progress in status

### GoTo Accuracy
- **Typical**: < 0.5° from target
- **Factors**: Alignment, calibration, mechanical precision
- **Improvement**: Use plate solving for refinement

## Tracking

### Sidereal Tracking
Compensates for Earth's rotation:

- **Status**: Shown in control panel
- **Toggle**: Click tracking button
- **Automatic**: Enables after successful GoTo
- **Rate**: 15.041 arcseconds/second

### Tracking Modes

1. **Sidereal** (Default):
   - Stars and deep sky objects
   - Standard tracking rate
   - Most common mode

2. **Lunar**:
   - Moon tracking
   - Adjusted for lunar motion
   - ~13.2°/day eastward

3. **Solar**:
   - Sun tracking (with proper filter!)
   - Compensates for solar motion
   - ~1°/day eastward

4. **Custom**:
   - Comets and asteroids
   - User-defined rates
   - RA and Dec rates separately

### When to Disable Tracking
- Terrestrial viewing
- Panoramic imaging
- Power conservation
- Troubleshooting drift

## Parking

### Park Function
Safely stow the telescope:

1. **Initiate Park**:
   - Click "Park" button
   - Confirm if prompted
   - Movement begins

2. **Park Position**:
   - Default: Level, facing north
   - Protects optics
   - Minimizes stress

3. **Park Status**:
   - "Parking..." during movement
   - "Parked" when complete
   - Controls disabled when parked

### Unparking
- Click "Unpark" button
- Telescope ready for use
- Previous settings restored

## Focus Adjustment

### Focus Controls

1. **Fine Focus** (±10 steps):
   - Small adjustments
   - Final focusing
   - Keyboard: `F`/`G`

2. **Medium Focus** (±50 steps):
   - General focusing
   - Temperature compensation
   - Quick adjustments

3. **Coarse Focus** (±100 steps):
   - Large changes
   - Initial setup
   - Major adjustments

### Focus Position
- **Current Position**: Displayed numerically
- **Range**: 0-10000 (typical)
- **Memory**: Positions can be saved

### Focusing Best Practices

1. **Use a Bright Star**:
   - Magnitude 2-3 ideal
   - High altitude preferred
   - Avoid doubles

2. **Focusing Aids**:
   - Enable 4x zoom
   - Use Bahtinov mask
   - Watch FWHM values

3. **Temperature Compensation**:
   - Refocus every 5°C change
   - Note positions for temperatures
   - Consider automation

## Coordinate Systems

### Right Ascension (RA)
- **Range**: 0h to 24h (0° to 360°)
- **Direction**: East is positive
- **Display**: HH:MM:SS or decimal

### Declination (Dec)
- **Range**: -90° to +90°
- **Direction**: North is positive
- **Display**: ±DD:MM:SS or decimal

### Coordinate Formats

1. **Sexagesimal** (Traditional):
   - RA: 12h 34m 56.7s
   - Dec: +45° 23' 12"

2. **Decimal Degrees**:
   - RA: 188.736°
   - Dec: +45.387°

3. **Conversion**:
   - 1h RA = 15°
   - 1m RA = 15'
   - 1s RA = 15"

## Alignment and Calibration

### Polar Alignment
For accurate tracking:

1. **Physical Alignment**:
   - Level the mount
   - Point to celestial pole
   - Use polar scope if available

2. **Software Assistance**:
   - Drift alignment routine
   - Plate solving refinement
   - Error measurements

### GoTo Calibration

1. **One-Star Alignment**:
   - GoTo bright star
   - Center manually
   - Sync position

2. **Two-Star Alignment**:
   - Improves accuracy
   - Choose stars 90° apart
   - Eastern and western sky

3. **Plate Solving**:
   - Automatic alignment
   - Most accurate method
   - Requires clear sky

## Limits and Safety

### Software Limits
Prevent mechanical damage:

- **Altitude Limits**: 0° to 90°
- **Azimuth Limits**: May vary by mount
- **Meridian Limits**: Prevents cable wrap

### Safety Features

1. **Horizon Limit**:
   - Prevents pointing below horizon
   - Protects from obstacles
   - User configurable

2. **Sun Avoidance**:
   - Blocks pointing near sun
   - Safety margin: typically 15°
   - Override requires confirmation

3. **Emergency Stop**:
   - Space bar or Stop button
   - Immediate halt
   - Maintains position

## Troubleshooting Movement

### Common Issues

1. **GoTo Misses Target**:
   - Check alignment
   - Verify coordinates
   - Confirm time/location

2. **Tracking Drift**:
   - Verify tracking enabled
   - Check polar alignment
   - Balance telescope

3. **Jerky Movement**:
   - Check motor connections
   - Verify power supply
   - Reduce speed setting

### Calibration Tips

1. **Regular Checks**:
   - Verify after transport
   - Check seasonally
   - After firmware updates

2. **Environmental Factors**:
   - Temperature changes
   - Wind effects
   - Ground stability

## Advanced Features

### Custom Movement Patterns

1. **Spiral Search**:
   - Find lost objects
   - Configurable radius
   - Automated pattern

2. **Mosaic Mode**:
   - Grid pattern movement
   - Overlap settings
   - Progress tracking

3. **Satellite Tracking**:
   - TLE input support
   - Real-time tracking
   - Pass predictions

### Scripted Control
- Command sequences
- Timed movements
- Observation plans

---

Next: [Observation Management](./observation-management.md) →