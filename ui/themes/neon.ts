export const neonTheme = {
  name: 'Neon',
  id: 'neon',
  cssClass: 'theme-neon',
  description: 'Futuristic monochromatic blue-green neon theme with glowing effects',
  colors: {
    primary: '#00FFD4',      // Bright cyan-green neon
    secondary: '#00D9FF',    // Bright cyan-blue neon
    accent: '#00FFF0',       // Aqua neon accent
    background: '#020A0F',   // Deep dark blue-black
    surface: '#0A1A20',      // Dark blue-green surface
    text: '#A0FFE0',         // Light neon text
    border: '#005566',       // Mid-tone blue-green border
    success: '#00FF88',      // Green neon success
    warning: '#00E5FF',      // Cyan warning
    error: '#00FFAA',        // Light green-cyan error
    
    // Additional gradients for neon effects
    glow: {
      primary: 'radial-gradient(circle, rgba(0,255,212,0.4) 0%, rgba(0,255,212,0) 70%)',
      secondary: 'radial-gradient(circle, rgba(0,217,255,0.4) 0%, rgba(0,217,255,0) 70%)',
      accent: 'radial-gradient(circle, rgba(0,255,240,0.4) 0%, rgba(0,255,240,0) 70%)'
    },
    
    // Different shades for depth
    shades: {
      darkest: '#010507',      // Almost black
      darker: '#020A0F',       // Background
      dark: '#0A1A20',         // Surface
      mid: '#1A3340',          // Mid-tone
      light: '#2A5060',        // Light surface
      lighter: '#3A7080',      // Lighter surface
      lightest: '#4A90A0',     // Lightest surface
      
      // Neon shades
      neonDim: '#00AA88',      // Dimmed neon
      neonMid: '#00D4AA',      // Mid neon
      neonBright: '#00FFD4',   // Bright neon
      neonGlow: '#80FFE8'      // Glowing neon
    }
  },
  effects: {
    // CSS custom properties for animations and effects
    glowAnimation: 'neon-glow 2s ease-in-out infinite alternate',
    pulseAnimation: 'neon-pulse 1.5s ease-in-out infinite',
    scanlineAnimation: 'scanline 8s linear infinite',
    textShadow: '0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor',
    boxShadow: '0 0 20px rgba(0,255,212,0.5), inset 0 0 20px rgba(0,255,212,0.1)',
    borderGlow: '0 0 15px rgba(0,255,212,0.6)',
  }
}