import { create } from 'zustand'

// Types
export interface ProcessedImage {
  id: string
  originalFilename: string
  processedAt: string
  width: number
  height: number
  format: string
  stretchMode: string
  metadata: Record<string, unknown>
  dataBase64?: string
}

export interface EnhancementSettings {
  // Upscaling
  upscaleEnabled: boolean
  upscaleFactor: number
  upscaleMethod: string
  // Denoising
  denoiseEnabled: boolean
  denoiseMethod: string
  denoiseStrength: number
  // Sharpening
  sharpenEnabled: boolean
  sharpenMethod: string
  sharpenStrength: number
  // Deconvolution
  deconvolutionEnabled: boolean
  deconvolutionStrength: number
  psfSize: number
}

export interface StretchMode {
  id: string
  name: string
  description: string
}

export interface EnhancementMethod {
  id: string
  name: string
  description: string
}

export interface EnhancementMethods {
  upscale: EnhancementMethod[]
  denoise: EnhancementMethod[]
  sharpen: EnhancementMethod[]
}

export interface PlateSolveResult {
  status: 'pending' | 'processing' | 'success' | 'failed' | 'timeout'
  jobId?: string
  submissionId?: string
  ra?: number
  dec?: number
  orientation?: number
  pixscale?: number
  radius?: number
  widthDeg?: number
  heightDeg?: number
  objectsInField?: string[]
  error?: string
}

export interface ImagingSession {
  telescopeId: string
  targetName?: string
  exposure: number
  gain: number
  frameCount: number
  isActive: boolean
  startedAt?: string
}

export interface SavedImage {
  id: string
  sessionId?: string
  filePath: string
  exposureMs?: number
  gain?: number
  capturedAt: string
  plateSolved: boolean
  plateSolveRa?: number
  plateSolveDec?: number
}

interface ImagingStore {
  // State
  sessions: Record<string, ImagingSession>
  processedImages: ProcessedImage[]
  savedImages: SavedImage[]
  currentImage: ProcessedImage | null
  stretchModes: StretchMode[]
  enhancementMethods: EnhancementMethods | null
  enhancementSettings: EnhancementSettings
  currentStretchMode: string
  plateSolveResult: PlateSolveResult | null
  isProcessing: boolean
  isPlateSolving: boolean

  // Session actions
  startSession: (telescopeId: string, session: Omit<ImagingSession, 'telescopeId'>) => void
  stopSession: (telescopeId: string) => void
  updateSession: (telescopeId: string, updates: Partial<ImagingSession>) => void
  incrementFrameCount: (telescopeId: string) => void

  // Image actions
  setProcessedImages: (images: ProcessedImage[]) => void
  addProcessedImage: (image: ProcessedImage) => void
  removeProcessedImage: (id: string) => void
  setCurrentImage: (image: ProcessedImage | null) => void

  setSavedImages: (images: SavedImage[]) => void
  addSavedImage: (image: SavedImage) => void
  removeSavedImage: (id: string) => void

  // Enhancement settings
  setStretchModes: (modes: StretchMode[]) => void
  setEnhancementMethods: (methods: EnhancementMethods) => void
  updateEnhancementSettings: (settings: Partial<EnhancementSettings>) => void
  resetEnhancementSettings: () => void
  setCurrentStretchMode: (mode: string) => void

  // Plate solving
  setPlateSolveResult: (result: PlateSolveResult | null) => void
  setIsPlateSolving: (solving: boolean) => void

  // Processing state
  setIsProcessing: (processing: boolean) => void
}

const DEFAULT_ENHANCEMENT_SETTINGS: EnhancementSettings = {
  upscaleEnabled: false,
  upscaleFactor: 2.0,
  upscaleMethod: 'LANCZOS',
  denoiseEnabled: false,
  denoiseMethod: 'TV_CHAMBOLLE',
  denoiseStrength: 0.1,
  sharpenEnabled: false,
  sharpenMethod: 'UNSHARP_MASK',
  sharpenStrength: 0.5,
  deconvolutionEnabled: false,
  deconvolutionStrength: 0.5,
  psfSize: 5,
}

export const useImagingStore = create<ImagingStore>((set) => ({
  // Initial state
  sessions: {},
  processedImages: [],
  savedImages: [],
  currentImage: null,
  stretchModes: [],
  enhancementMethods: null,
  enhancementSettings: DEFAULT_ENHANCEMENT_SETTINGS,
  currentStretchMode: '15% Bg, 3 sigma',
  plateSolveResult: null,
  isProcessing: false,
  isPlateSolving: false,

  // Session actions
  startSession: (telescopeId, session) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: { ...session, telescopeId, isActive: true, startedAt: new Date().toISOString() }
    }
  })),

  stopSession: (telescopeId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: state.sessions[telescopeId]
        ? { ...state.sessions[telescopeId], isActive: false }
        : state.sessions[telescopeId]
    }
  })),

  updateSession: (telescopeId, updates) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: state.sessions[telescopeId]
        ? { ...state.sessions[telescopeId], ...updates }
        : state.sessions[telescopeId]
    }
  })),

  incrementFrameCount: (telescopeId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: state.sessions[telescopeId]
        ? { ...state.sessions[telescopeId], frameCount: state.sessions[telescopeId].frameCount + 1 }
        : state.sessions[telescopeId]
    }
  })),

  // Image actions
  setProcessedImages: (processedImages) => set({ processedImages }),

  addProcessedImage: (image) => set((state) => ({
    processedImages: [image, ...state.processedImages]
  })),

  removeProcessedImage: (id) => set((state) => ({
    processedImages: state.processedImages.filter(i => i.id !== id),
    currentImage: state.currentImage?.id === id ? null : state.currentImage,
  })),

  setCurrentImage: (currentImage) => set({ currentImage }),

  setSavedImages: (savedImages) => set({ savedImages }),

  addSavedImage: (image) => set((state) => ({
    savedImages: [image, ...state.savedImages]
  })),

  removeSavedImage: (id) => set((state) => ({
    savedImages: state.savedImages.filter(i => i.id !== id)
  })),

  // Enhancement settings
  setStretchModes: (stretchModes) => set({ stretchModes }),

  setEnhancementMethods: (enhancementMethods) => set({ enhancementMethods }),

  updateEnhancementSettings: (settings) => set((state) => ({
    enhancementSettings: { ...state.enhancementSettings, ...settings }
  })),

  resetEnhancementSettings: () => set({ enhancementSettings: DEFAULT_ENHANCEMENT_SETTINGS }),

  setCurrentStretchMode: (currentStretchMode) => set({ currentStretchMode }),

  // Plate solving
  setPlateSolveResult: (plateSolveResult) => set({ plateSolveResult }),
  setIsPlateSolving: (isPlateSolving) => set({ isPlateSolving }),

  // Processing state
  setIsProcessing: (isProcessing) => set({ isProcessing }),
}))
