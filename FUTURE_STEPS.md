# Future Steps and Features

Based on analysis of the current Tauri app and legacy codebase, here are the potential future enhancements.

---

## 1. Telescope Control Features

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Focus Control Panel | Missing | `legacy/ui/components/telescope/panels/FocusControl.tsx` | Manual focus adjustment with step controls |
| Auto-Focus | Missing | `legacy/ui/components/telescope/AutoFocusOverlay.tsx` | Automated focus routine |
| Telescope Movement Joystick | Missing | `legacy/ui/components/telescope/panels/TelescopeMovement.tsx` | Virtual joystick for manual slewing |
| GOTO Progress Overlay | Missing | `legacy/ui/components/telescope/AutoGotoOverlay.tsx` | Visual progress during slew operations |
| Park/Unpark Controls | Partial | `TelescopePanel.tsx:110-128` | Park works, unpark not exposed |

---

## 2. Imaging Features

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Imaging/Stacking Panel | Missing | `legacy/ui/components/telescope/panels/ImagingPanel.tsx` | Start/stop stacking, exposure controls |
| Imaging Metrics | Missing | `legacy/ui/components/telescope/panels/ImagingMetrics.tsx` | Stack count, exposure time, progress |
| Image Enhancement Controls | Missing | `legacy/ui/components/telescope/ImageEnhancementOverlay.tsx` | Histogram stretch, noise reduction |
| Image Controls Panel | Missing | `legacy/ui/components/telescope/panels/ImageControls.tsx` | Brightness, contrast, saturation |
| Dark Library | Missing | `legacy/ui/components/telescope/DarkLibraryOverlay.tsx` | Dark frame acquisition and management |
| Image Saving | Stub | - | Save captured images to disk (Tauri native) |
| Image Gallery | Missing | - | Browse saved images |

---

## 3. Session & Planning Features

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Session Planning | Implemented | `SessionPlanning.tsx` | Location, targets, sessions |
| Observation Logger | Missing | `legacy/ui/components/telescope/panels/ObservationLogger.tsx` | Log observations with notes |
| Recommended Targets | Missing | `legacy/ui/components/telescope/panels/RecommendedTargets.tsx` | AI/algorithm-suggested targets |
| Planning Panel | Missing | `legacy/ui/components/telescope/modals/PlanningPanel.tsx` | Full session planning modal |
| Moon Phase Display | Missing | `legacy/ui/components/telescope/panels/MoonPhase.tsx` | Current moon phase, rise/set |

---

## 4. Plate Solving

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Plate Solve Settings | Implemented | `SettingsPanel.tsx:658-735` | API key configuration |
| Plate Solve Dialog | Missing | `legacy/ui/components/telescope/modals/PlateSolveSyncDialog.tsx` | Solve current image, sync mount |
| Solve Results Overlay | Missing | - | Show detected objects, coordinates |

---

## 5. Overlays & Visualization

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Crosshairs | Implemented | `VideoOverlays.tsx` | Center crosshairs |
| Grid | Implemented | `VideoOverlays.tsx` | Reference grid |
| Compass | Implemented | `VideoOverlays.tsx` | Cardinal directions |
| Annotation Overlay | Missing | `legacy/ui/components/telescope/AnnotationOverlay.tsx` | User drawings/text on image |
| Starmap Overlay | Missing | `legacy/ui/components/telescope/StarmapOverlay.tsx` | Star chart overlay |
| Object Labels | Missing | - | Label identified objects |

---

## 6. Equipment Management

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Equipment Manager | Missing | `legacy/ui/components/telescope/modals/EquipmentManager.tsx` | Track telescopes, cameras, mounts |
| Equipment Selector | Missing | `legacy/ui/components/telescope/panels/EquipmentSelector.tsx` | Quick equipment profile switching |
| Maintenance Log | Missing | - | Track maintenance, cleaning dates |

---

## 7. Environment & Conditions

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Weather Conditions | Missing | `legacy/ui/components/telescope/panels/WeatherConditions.tsx` | Temperature, humidity, wind |
| Environment Panel | Missing | `legacy/ui/components/telescope/panels/EnvironmentPanel.tsx` | Environmental sensors |
| Location Management | Missing | `legacy/ui/components/telescope/panels/LocationPanel.tsx` | Multiple observing sites |

---

## 8. Logging & Statistics

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Activity Log Panel | Missing | `legacy/ui/components/telescope/panels/LogPanel.tsx` | Detailed activity log viewer |
| Statistics Panel | Missing | `legacy/ui/components/telescope/panels/StatsPanel.tsx` | Session statistics |
| Neon Stats Panel | Missing | `legacy/ui/components/telescope/panels/NeonStatsPanel.tsx` | Stylized statistics display |
| Chalkboard Panel | Missing | `legacy/ui/components/telescope/panels/ChalkboardPanel.tsx` | Notes and quick calculations |

---

## 9. System Administration

| Feature | Status | Legacy Reference | Description |
|---------|--------|------------------|-------------|
| Configuration Page | Missing | `legacy/ui/components/telescope/modals/ConfigurationPage.tsx` | Full configuration UI |
| Data Management | Missing | `legacy/ui/components/telescope/modals/DataManagementSettings.tsx` | File paths, cleanup, export |
| System Admin | Missing | `legacy/ui/components/telescope/modals/SystemAdminDialog.tsx` | Advanced system settings |
| Notification Settings | Missing | `legacy/ui/components/telescope/modals/NotificationSettings.tsx` | Configure alerts |
| Notification History | Missing | `legacy/ui/components/telescope/modals/NotificationHistory.tsx` | View past notifications |
| Documentation Viewer | Missing | `legacy/ui/components/telescope/modals/DocumentationViewer.tsx` | Built-in help system |
| Telescope Management | Missing | `legacy/ui/components/telescope/modals/TelescopeManagementModal.tsx` | Multi-telescope admin |

---

## 10. Tauri-Specific Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Native File Dialogs | Missing | Save/export images using Tauri dialog API |
| System Tray | Missing | Minimize to tray, background operation |
| Native Notifications | Missing | OS-level notifications for events |
| Multi-Window Support | Missing | Detachable panels (PiP as separate window) |
| Auto-Updates | Missing | Built-in update mechanism |
| Custom Titlebar | Partial | Tauri decorations available |
| Persistent Settings | Partial | Some in stores, needs completion |
| Keyboard Shortcuts | Implemented | `KeyboardHelp.tsx` |

---

## 11. Protocol/Backend Improvements

| Feature | Status | Description |
|---------|--------|-------------|
| Seestar Protocol | Implemented | Full pyscopinator v2 support |
| Alpaca Protocol | Implemented | Basic support via pyscopinator |
| INDI Protocol | Missing | Add INDI backend to pyscopinator |
| PHD2 Integration | Missing | Guiding support |
| ASCOM on Windows | Missing | Windows-specific drivers |

---

## Priority Recommendations

### High Priority (Core functionality)

1. **Imaging/Stacking Panel** - Essential for actual observations
2. **Focus Control** - Critical for sharp images
3. **GOTO Progress Overlay** - User feedback during slews
4. **Image Saving** - Preserve captured data
5. **Plate Solve Dialog** - Use the configured API

### Medium Priority (Enhanced experience)

6. **Telescope Movement Joystick** - Manual control
7. **Activity Log Panel** - Debugging and tracking
8. **Observation Logger** - Record observations
9. **Image Enhancement Controls** - Better live view
10. **Moon Phase Display** - Planning aid

### Lower Priority (Nice to have)

11. **Equipment Management** - For complex setups
12. **Weather Integration** - External data
13. **Starmap Overlay** - Visual aid
14. **Multi-window/System Tray** - Desktop integration
15. **Additional protocols** (INDI, PHD2)

---

## Notes

- Legacy files are located in `legacy/ui/components/telescope/`
- Current implementation uses Zustand for state management
- Tauri 2.0 with PyO3 bridge for Python telescope control
- pyscopinator v2 provides the backend abstraction layer
