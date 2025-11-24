// Theme definitions for EESC
export interface Theme {
  name: string
  id: string
  cssClass: string
  description: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    text: string
    border: string
    success: string
    warning: string
    error: string
    [key: string]: string
  }
  effects?: {
    glowAnimation?: string
    pulseAnimation?: string
    scanlineAnimation?: string
    textShadow?: string
    boxShadow?: string
    borderGlow?: string
  }
}

export const themes: Record<string, Theme> = {
  light: {
    name: 'Light',
    id: 'light',
    cssClass: 'theme-light',
    description: 'Clean light theme',
    colors: {
      primary: '#000000',
      secondary: '#666666',
      accent: '#0066CC',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#000000',
      border: '#DDDDDD',
      success: '#00AA00',
      warning: '#FF8800',
      error: '#CC0000'
    }
  },
  dark: {
    name: 'Dark',
    id: 'dark',
    cssClass: 'theme-dark',
    description: 'Modern dark theme',
    colors: {
      primary: '#FFFFFF',
      secondary: '#AAAAAA',
      accent: '#4A9EFF',
      background: '#0A0A0A',
      surface: '#1A1A1A',
      text: '#FFFFFF',
      border: '#333333',
      success: '#00DD00',
      warning: '#FFAA00',
      error: '#FF4444'
    }
  },
  'night-vision': {
    name: 'Night Vision',
    id: 'night-vision',
    cssClass: 'theme-night-vision',
    description: 'Red-tinted for night astronomy',
    colors: {
      primary: '#FF0000',
      secondary: '#CC0000',
      accent: '#FF3333',
      background: '#0A0000',
      surface: '#1A0000',
      text: '#FF4444',
      border: '#440000',
      success: '#FF6666',
      warning: '#FF8844',
      error: '#FFAAAA'
    }
  },
  tufte: {
    name: 'Tufte',
    id: 'tufte',
    cssClass: 'theme-tufte',
    description: 'Minimalist typography-focused theme',
    colors: {
      primary: '#111111',
      secondary: '#555555',
      accent: '#004488',
      background: '#FFFFF8',
      surface: '#F9F9F1',
      text: '#111111',
      border: '#DDDDCC',
      success: '#006600',
      warning: '#886600',
      error: '#880000'
    }
  },
  'dark-tufte': {
    name: 'Dark Tufte',
    id: 'dark-tufte',
    cssClass: 'theme-dark-tufte',
    description: 'Dark minimalist typography theme',
    colors: {
      primary: '#EEEEEE',
      secondary: '#AAAAAA',
      accent: '#6699CC',
      background: '#1A1A18',
      surface: '#242422',
      text: '#EEEEEE',
      border: '#444433',
      success: '#66AA66',
      warning: '#CCAA66',
      error: '#CC6666'
    }
  },
  'green-screen': {
    name: 'Green Screen',
    id: 'green-screen',
    cssClass: 'theme-green-screen',
    description: 'Retro terminal aesthetic',
    colors: {
      primary: '#00FF00',
      secondary: '#00CC00',
      accent: '#00FFAA',
      background: '#000000',
      surface: '#001100',
      text: '#00FF00',
      border: '#003300',
      success: '#00FF66',
      warning: '#88FF00',
      error: '#FFFF00'
    },
    effects: {
      textShadow: '0 0 5px #00FF00, 0 0 10px #00FF00',
      scanlineAnimation: 'scanline 8s linear infinite'
    }
  },
  c64: {
    name: 'C64',
    id: 'c64',
    cssClass: 'theme-c64',
    description: 'Commodore 64 classic',
    colors: {
      primary: '#7C70DA',
      secondary: '#A3A3FF',
      accent: '#50459B',
      background: '#40318D',
      surface: '#6C5EB5',
      text: '#7C70DA',
      border: '#50459B',
      success: '#55AA55',
      warning: '#AAAA55',
      error: '#AA5555'
    }
  },
  fallout: {
    name: 'Fallout',
    id: 'fallout',
    cssClass: 'theme-fallout',
    description: 'Post-apocalyptic terminal',
    colors: {
      primary: '#00FF41',
      secondary: '#00CC33',
      accent: '#00FFAA',
      background: '#0A0A08',
      surface: '#1A1A14',
      text: '#00FF41',
      border: '#003311',
      success: '#00FF66',
      warning: '#AAFF00',
      error: '#FF5500'
    },
    effects: {
      textShadow: '0 0 8px #00FF41, 0 0 12px #00FF41',
      scanlineAnimation: 'scanline 6s linear infinite'
    }
  },
  scifi: {
    name: 'SciFi',
    id: 'scifi',
    cssClass: 'theme-scifi',
    description: 'LCARS-inspired interface',
    colors: {
      primary: '#FF8A00',
      secondary: '#B88AFF',
      accent: '#00BFFF',
      background: '#0A0A0F',
      surface: '#1A1A2E',
      text: '#E8E8F0',
      border: '#4A4A5C',
      success: '#00FF88',
      warning: '#FFD700',
      error: '#FF4545'
    }
  },
  neon: {
    name: 'Neon',
    id: 'neon',
    cssClass: 'theme-neon',
    description: 'Futuristic neon glow',
    colors: {
      primary: '#00FFD4',
      secondary: '#00D9FF',
      accent: '#00FFF0',
      background: '#020A0F',
      surface: '#0A1A20',
      text: '#A0FFE0',
      border: '#005566',
      success: '#00FF88',
      warning: '#00E5FF',
      error: '#00FFAA',
      glow: 'radial-gradient(circle, rgba(0,255,212,0.4) 0%, rgba(0,255,212,0) 70%)'
    },
    effects: {
      glowAnimation: 'neon-glow 2s ease-in-out infinite alternate',
      pulseAnimation: 'neon-pulse 1.5s ease-in-out infinite',
      textShadow: '0 0 10px currentColor, 0 0 20px currentColor',
      boxShadow: '0 0 20px rgba(0,255,212,0.5)',
      borderGlow: '0 0 15px rgba(0,255,212,0.6)'
    }
  }
}

export type ThemeId = keyof typeof themes
