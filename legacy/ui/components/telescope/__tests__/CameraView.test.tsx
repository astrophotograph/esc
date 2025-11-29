import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CameraView } from '../CameraView'
import { useTelescopeContext } from '../../../context/TelescopeContext'

// Mock the TelescopeContext
jest.mock('../../../context/TelescopeContext')
const mockUseTelescopeContext = useTelescopeContext as jest.MockedFunction<typeof useTelescopeContext>

// Mock image streaming utility
jest.mock('../../../utils/streaming', () => ({
  generateStreamingUrl: jest.fn(() => 'http://localhost:8000/api/test-telescope/video')
}))

// Mock child components
jest.mock('../panels/StatsPanel', () => ({
  StatsPanel: () => <div data-testid="stats-panel">Stats Panel</div>
}))
jest.mock('../panels/LogPanel', () => ({
  LogPanel: () => <div data-testid="log-panel">Log Panel</div>
}))
jest.mock('../panels/ImagingPanel', () => ({
  ImagingPanel: () => <div data-testid="imaging-panel">Imaging Panel</div>
}))
jest.mock('../AnnotationLayer', () => ({
  AnnotationLayer: () => <div data-testid="annotation-layer">Annotation Layer</div>
}))

// Mock EventSource
global.EventSource = jest.fn(() => ({
  onmessage: null,
  onerror: null,
  close: jest.fn(),
})) as any

const mockContextValue = {
  isControlsCollapsed: false,
  selectedTarget: null,
  showOverlay: false,
  setShowOverlay: jest.fn(),
  showStatsPanel: false,
  setShowStatsPanel: jest.fn(),
  showLogPanel: false,
  setShowLogPanel: jest.fn(),
  setIsControlsCollapsed: jest.fn(),
  isTracking: false,
  systemStats: {
    diskUsage: 45,
    freeMB: 1000,
    totalMB: 2000,
  },
  brightness: [0],
  contrast: [100],
  imageStats: {
    mean: 128,
    std: 45,
    max: 255,
    min: 0,
  },
  showAnnotations: false,
  setShowAnnotations: jest.fn(),
  annotationSettings: {
    display: {
      showNames: true,
      showMagnitudes: true,
      showConstellations: true,
      showCatalogIds: false,
      fontSize: 'medium',
      opacity: 0.8,
    },
    behavior: {
      clickToSelect: true,
      autoHide: false,
      hoverDetails: true,
    },
    filters: {
      minMagnitude: -5,
      maxMagnitude: 10,
      types: ['star', 'planet', 'nebula', 'cluster', 'double-star'],
      constellations: [],
    },
  },
  handleTargetSelect: jest.fn(),
  celestialObjects: [],
  currentTelescope: {
    name: 'Test Telescope',
    host: '192.168.1.100',
    port: 4700,
    connected: true,
    serial_number: 'TEST123',
    product_model: 'Seestar S50',
    ssid: 'SEESTAR_TEST',
    id: 'test-telescope',
    status: 'online' as const,
  },
  showStreamStatus: false,
  setShowStreamStatus: jest.fn(),
  setStreamStatus: jest.fn(),
  setFocusPosition: jest.fn(),
  isImaging: false,
  liveViewFullscreen: false,
  setLiveViewFullscreen: jest.fn(),
}

describe('CameraView', () => {
  beforeEach(() => {
    mockUseTelescopeContext.mockReturnValue(mockContextValue)
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the Live View title', () => {
    render(<CameraView />)
    expect(screen.getByText('Live View')).toBeInTheDocument()
  })

  it('displays telescope status indicators', () => {
    render(<CameraView />)
    expect(screen.getByTitle('Light Pollution Filter')).toBeInTheDocument()
  })

  it('shows placeholder when no telescope feed is available', () => {
    render(<CameraView />)
    expect(screen.getByText('Connecting to telescope...')).toBeInTheDocument()
    expect(screen.getByText('Waiting for video stream')).toBeInTheDocument()
  })

  it('renders control buttons including collapse button', () => {
    render(<CameraView />)
    const buttons = screen.getAllByRole('button')
    // Should have multiple control buttons including rotate, fullscreen, stream status, and collapse
    expect(buttons.length).toBeGreaterThan(3)
    // Test that clicking buttons doesn't throw errors
    expect(() => {
      buttons.forEach(button => {
        if (button.getAttribute('title') !== 'Show Stream Status') {
          fireEvent.click(button)
        }
      })
    }).not.toThrow()
  })

  it('toggles fullscreen mode', () => {
    render(<CameraView />)
    const fullscreenButton = screen.getByTitle('Enter Fullscreen')
    fireEvent.click(fullscreenButton)
    expect(mockContextValue.setLiveViewFullscreen).toHaveBeenCalledWith(true)
  })

  it('shows REC indicator when imaging', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      isImaging: true,
    })
    render(<CameraView />)
    expect(screen.getByText('REC')).toBeInTheDocument()
  })

  it('displays ImagingPanel when imaging is active', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      isImaging: true,
    })
    render(<CameraView />)
    expect(screen.getByTestId('imaging-panel')).toBeInTheDocument()
  })

  it('displays StatsPanel when showStatsPanel is true and not imaging', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      showStatsPanel: true,
    })
    render(<CameraView />)
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
  })

  it('displays LogPanel when showLogPanel is true and not imaging', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      showLogPanel: true,
    })
    render(<CameraView />)
    expect(screen.getByTestId('log-panel')).toBeInTheDocument()
  })

  it('hides StatsPanel and LogPanel when imaging', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      isImaging: true,
      showStatsPanel: true,
      showLogPanel: true,
    })
    render(<CameraView />)
    expect(screen.queryByTestId('stats-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('log-panel')).not.toBeInTheDocument()
  })

  it('displays target name when selected', () => {
    const selectedTarget = {
      id: 'test-target',
      name: 'Andromeda Galaxy',
      type: 'galaxy' as const,
      magnitude: 3.4,
      ra: '00h 42m 44s',
      dec: '+41° 16\' 09"',
      bestSeenIn: 'Autumn',
      description: 'The nearest major galaxy to the Milky Way',
      optimalMoonPhase: 'new' as const,
      isCurrentlyVisible: true,
    }
    
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      selectedTarget,
    })
    render(<CameraView />)
    expect(screen.getByText('Andromeda Galaxy')).toBeInTheDocument()
  })

  it('handles zoom controls', () => {
    render(<CameraView />)
    const zoomInButton = screen.getByTitle('Zoom In')
    const zoomOutButton = screen.getByTitle('Zoom Out')
    const resetButton = screen.getByTitle('Reset View')
    
    expect(zoomInButton).toBeInTheDocument()
    expect(zoomOutButton).toBeInTheDocument()
    expect(resetButton).toBeInTheDocument()
  })

  it('toggles stream status visibility', () => {
    render(<CameraView />)
    const streamStatusButton = screen.getByTitle('Show Stream Status')
    fireEvent.click(streamStatusButton)
    expect(mockContextValue.setShowStreamStatus).toHaveBeenCalledWith(true)
  })

  it('handles rotation button click', () => {
    render(<CameraView />)
    const buttons = screen.getAllByRole('button')
    const rotateButton = buttons.find(button => 
      button.querySelector('svg') && !button.getAttribute('title') && 
      button.classList.contains('border-gray-600')
    )
    expect(rotateButton).toBeInTheDocument()
    fireEvent.click(rotateButton!)
    // Rotation state is internal to component, so we just verify the button exists and is clickable
  })

  it('applies fullscreen styling when in fullscreen mode', () => {
    mockUseTelescopeContext.mockReturnValue({
      ...mockContextValue,
      liveViewFullscreen: true,
    })
    render(<CameraView />)
    // The outermost div should have the fullscreen classes
    const container = document.querySelector('.fixed.inset-0.z-50.bg-gray-800')
    expect(container).toBeInTheDocument()
  })

  it('shows system stats with correct values', () => {
    render(<CameraView />)
    expect(screen.getByText('45%')).toBeInTheDocument() // disk usage
  })

  it('handles image load and error states', async () => {
    render(<CameraView />)
    
    // Initially shows loading state
    expect(screen.getByText('Connecting to telescope...')).toBeInTheDocument()
    
    // Find the image element (it's hidden but present in DOM)
    const image = screen.getByAltText('Telescope view')
    expect(image).toBeInTheDocument()
    // Image should initially be in error/loading state due to empty src from mock
  })

  it('applies brightness and contrast filters to image', () => {
    render(<CameraView />)
    const image = screen.getByAltText('Telescope view')
    expect(image).toHaveStyle('filter: brightness(100%) contrast(100%)')
  })

  it('handles mouse interactions for panning', () => {
    render(<CameraView />)
    const imageContainer = screen.getByRole('img').parentElement
    
    // Test mouse events don't throw errors
    expect(() => {
      fireEvent.mouseDown(imageContainer!, { clientX: 100, clientY: 100 })
      fireEvent.mouseMove(imageContainer!, { clientX: 110, clientY: 110 })
      fireEvent.mouseUp(imageContainer!)
    }).not.toThrow()
  })

  it('handles touch interactions for mobile', () => {
    render(<CameraView />)
    const imageContainer = screen.getByRole('img').parentElement
    
    // Test touch events don't throw errors
    expect(() => {
      fireEvent.touchStart(imageContainer!, { 
        touches: [{ clientX: 100, clientY: 100 }] 
      })
      fireEvent.touchMove(imageContainer!, { 
        touches: [{ clientX: 110, clientY: 110 }] 
      })
      fireEvent.touchEnd(imageContainer!)
    }).not.toThrow()
  })
})