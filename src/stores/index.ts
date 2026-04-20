// Re-export all stores
export { useTelescopeStore } from './telescopeStore'
export type {
  TelescopeInfo,
  TelescopeStatus,
  TelescopeSettings,
  ActivityLogEntry,
} from './telescopeStore'

export { useCatalogStore } from './catalogStore'
export type {
  CelestialObject,
  SolarSystemObject,
  ObjectType,
  SearchFilters,
} from './catalogStore'

export { useSessionStore } from './sessionStore'
export type {
  ObservationSession,
  ObservationLog,
  VisibilityInfo,
  TonightTarget,
  ObserverLocation,
} from './sessionStore'

export { useImagingStore } from './imagingStore'
export type {
  ProcessedImage,
  EnhancementSettings,
  StretchMode,
  EnhancementMethod,
  EnhancementMethods,
  PlateSolveResult,
  ImagingSession,
  SavedImage,
} from './imagingStore'

export { useUIStore } from './uiStore'
export type {
  PipPosition,
  ActiveTab,
  SidebarPanel,
} from './uiStore'

export { useSchedulerStore, EMPTY_SCHEDULE } from './schedulerStore'
export type {
  MosaicConfig,
  ScheduleTarget,
  Schedule,
} from './schedulerStore'
