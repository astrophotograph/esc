# TODO: Remaining Lint Issues

The following lint errors remain in the codebase and require more significant refactoring to resolve properly:

## Complex Refactoring Needed

### CameraView.tsx
- **Multiple unused variables from context destructuring**: The CameraView component has many unused state variables that are destructured but not used in the current implementation. These include:
  - `_showOverlay`, `_setShowOverlay` - overlay functionality appears to be incomplete
  - `_setShowStatsPanel`, `_setShowLogPanel` - panel controls that may be used in conditional rendering
  - `_isTracking`, `_imageStats`, `_showAnnotations`, `_setShowAnnotations` - telescope state that's not fully integrated
  - `annotations` - annotation data that's prepared but not rendered
  - `imageDimensions` - calculated but not used in current layout
  - `isValidUrl` - utility function defined but never called
  - `handleAnnotationClick` - event handler prepared but not connected to UI

- **Missing imports/dependencies**: The component references some variables (`AnnotationLayer`) that are imported but never used, suggesting incomplete annotation functionality.

- **Type issues**: The `generateVideoUrl` function previously used `any` type which was partially fixed but may need better typing.

### DataPersistenceManager.tsx
- **`addStatusAlert` function**: Defined but never used, suggesting incomplete status alert functionality.

- **Large dependency array in useEffect**: The useEffect has an extremely large dependency array with many state setters that may indicate the component is trying to do too much and could benefit from splitting into smaller components.

### RecommendedTargets.tsx
- **`currentMoonPhase` variable**: Assigned but never used, indicating incomplete moon phase display functionality.

### Modal Components
Several modal components have unused variables that suggest incomplete functionality:

#### EquipmentManager.tsx
- **Equipment set management**: Variables for adding equipment sets (`showAddSet`, `newSet`, `setNewSet`, `setEquipmentSets`) are defined but the functionality is not implemented.

#### PlanningPanel.tsx
- **Planned sessions**: `setPlannedSessions` is destructured but never used, indicating incomplete session planning functionality.

### UI Components

#### Test Files
- **CameraView.test.tsx**: Uses `any` type and has unused `waitFor` import, indicating incomplete test coverage.

#### Modal Components
- **DataManagementSettings.tsx**: Has unused `error` variable and unescaped entities in JSX.
- **NotificationSettings.tsx**: Uses `any` types that could be better typed.

### Panel Components
- **EnvironmentPanel.tsx & WeatherConditions.tsx**: Have unescaped quote entities in JSX that should be properly escaped.
- **ImagingPanel.tsx**: Missing alt text for image elements (accessibility issue).

## Recommended Actions

1. **Complete annotation functionality** in CameraView.tsx or remove unused annotation-related code
2. **Implement equipment set management** in EquipmentManager.tsx or remove unused state
3. **Complete session planning** functionality in PlanningPanel.tsx
4. **Review and implement status alert system** in DataPersistenceManager.tsx
5. **Add proper TypeScript types** to replace remaining `any` usage
6. **Fix JSX entity escaping** in panel components
7. **Add missing alt text** for accessibility compliance
8. **Complete test coverage** and fix test file issues

## Notes

Many of these issues appear to be from incomplete features rather than bugs. The codebase seems to be in active development with several features partially implemented. Consider prioritizing which features to complete vs. which unused code to remove for a cleaner codebase.