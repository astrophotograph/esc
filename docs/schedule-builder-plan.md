# Schedule Builder UI — Implementation Plan

## Overview

Replace the `SessionPlanning` stub with a full schedule-building workflow. The user
searches for celestial objects, reviews visibility at their location, optionally configures
mosaic framing and rotation, then builds an ordered schedule that can be edited, saved to a
file, and sent to the telescope as a `set_view_plan` JSON-RPC command.

---

## Decisions

The following questions were resolved before implementation begins:

| # | Decision |
|---|---|
| 1 | **Observer location** is global — stored in shared settings, reusable across all schedules. Editable from within the builder and from the main settings panel. |
| 2 | **Visibility threshold** defaults to **30°** and is user-configurable in global settings. The backend receives it as a query parameter; the chart colors the curve accordingly. |
| 3 | **Time convention** — the UI presents wall-clock **local time** (the observer's local timezone from location settings). Conversion to `start_min` (minutes after local midnight, 0–1440) happens at serialization time. |
| 4 | **`star_map_angle`** defaults to `0.0` for all schedule targets. No live device connection is required at plan-build time. |
| 5 | **Schedules are telescope-agnostic** — the user selects which connected telescope to send to at send time, not at plan-build time. |

---

## Wire Format (Reference)

From the APK analysis (`v3.1.2_7.32/apk_plan_analysis.md`), the telescope accepts:

```json
{
  "method": "set_view_plan",
  "params": {
    "plan_name": "My Plan",
    "update_time_seestar": "2025.04.17",
    "list": [
      {
        "target_id": 1,
        "target_name": "M31",
        "target_ra_dec": [10.6847929, 41.269065],
        "alias_name": "Andromeda Galaxy",
        "lp_filter": true,
        "start_min": 120,
        "duration_min": 60,
        "mosaic": { "scale": 1.5, "angle": 45.0, "star_map_angle": 0.0 }
      }
    ]
  }
}
```

Key constraints:
- `start_min`: minutes after local midnight (0–1440)
- `mosaic` key is **omitted** when `scale=1.0, angle=0.0, star_map_angle=0.0`
- Targets must be sorted by `start_min` ascending before sending
- `scale` range: 1.0–2.0 (maps to internal 50–100)
- `angle` range: −90° to +90° in 5° steps

---

## Architecture

### New Files

```
src/
  features/
    session-planning/
      SessionPlanning.tsx             ← replace stub with router/shell
      ScheduleBuilder.tsx             ← main layout (new)
      components/
        ObjectSearch.tsx              ← search + result list with inline visibility
        VisibilityChart.tsx           ← altitude-vs-time chart (AstroMosaic style)
        MosaicFramingEditor.tsx       ← scale slider + rotation slider + FOV preview
        ScheduleTimeline.tsx          ← ordered list of targets, drag-to-reorder
        ScheduleTargetCard.tsx        ← one row: name, time window, lp-filter, mosaic badge
        LocationPicker.tsx            ← lat/lon/timezone input, saved to global settings
        ScheduleImportExport.tsx      ← file open/save buttons
      stores/
        schedulerStore.ts             ← Zustand store for schedule state
      utils/
        timeConversion.ts             ← wall-clock ↔ start_min helpers
        scheduleSerialization.ts      ← serialize/deserialize to wire + file format
        visibilityHelpers.ts          ← chart data shaping, twilight region helpers
      __tests__/
        schedulerStore.test.ts
        timeConversion.test.ts
        scheduleSerialization.test.ts
        visibilityHelpers.test.ts
        MosaicFramingEditor.test.tsx
        ScheduleTargetCard.test.tsx
        ScheduleTimeline.test.tsx

python/
  telescope/
    scheduler.py                      ← astroplan visibility calculations
  tests/
    test_scheduler.py                 ← pytest unit tests
  web_api.py                          ← new endpoints (add to existing file)

src-tauri/src/telescope/
  commands.rs                         ← new Tauri commands (add to existing file)
```

### Data Model (TypeScript)

```typescript
interface ScheduleTarget {
  id: number                  // local sequence number
  targetName: string          // catalog name, e.g. "M31"
  aliasName: string           // user-editable display name
  raDec: [number, number]     // [ra_deg, dec_deg]
  startMin: number            // minutes after local midnight (0–1440)
  durationMin: number
  lpFilter: boolean
  mosaic: MosaicConfig | null
}

interface MosaicConfig {
  scale: number               // 1.0–2.0
  angle: number               // −90 to +90 degrees
  starMapAngle: number        // always 0.0 (see Decision #4)
}

interface Schedule {
  planName: string
  targets: ScheduleTarget[]
  updatedAt: string           // ISO date string
}

// Stored in global settings (telescopeStore or a dedicated observerStore)
interface ObserverLocation {
  lat: number                 // degrees, positive north
  lon: number                 // degrees, positive east
  elevation: number           // metres above sea level
  timezone: string            // IANA tz string, e.g. "America/New_York"
  minAltitudeDeg: number      // visibility threshold, default 30
}
```

### Zustand Store (`schedulerStore.ts`)

```typescript
interface SchedulerStore {
  schedule: Schedule
  setPlanName: (name: string) => void
  addTarget: (t: Omit<ScheduleTarget, 'id'>) => void
  updateTarget: (id: number, patch: Partial<ScheduleTarget>) => void
  removeTarget: (id: number) => void
  reorderTargets: (fromIndex: number, toIndex: number) => void
  importSchedule: (s: Schedule) => void
  clearSchedule: () => void
}
```

### Utility Modules

**`timeConversion.ts`** — pure functions, fully unit-testable:
```typescript
// Wall-clock string (HH:MM, local time) → start_min
wallClockToStartMin(time: string): number

// start_min → wall-clock string in observer's local timezone
startMinToWallClock(startMin: number, tz: string): string

// Validate start_min is in 0–1440 range
isValidStartMin(startMin: number): boolean

// Check if two targets overlap: [startMin, startMin + durationMin)
targetsOverlap(a: ScheduleTarget, b: ScheduleTarget): boolean
```

**`scheduleSerialization.ts`** — serialize/deserialize, fully unit-testable:
```typescript
// Schedule → set_view_plan params (sorted by start_min, mosaic suppressed when trivial)
scheduleToWireFormat(s: Schedule): SetViewPlanParams

// Schedule → export file JSON string
exportScheduleToJson(s: Schedule): string

// Import file JSON string → Schedule (validates structure, throws on bad input)
importScheduleFromJson(json: string): Schedule
```

---

## Testing Strategy

### Python (pytest)

Location: `python/tests/test_scheduler.py`

Run via: `pytest python/tests/`

Tests use known astronomical facts (e.g. Polaris barely moves, Orion is winter-only from
mid-latitudes) to assert correct behavior without mocking astroplan internals.

### TypeScript (Vitest + React Testing Library)

Location: `src/features/session-planning/__tests__/`

Run via: `npm test` (existing Vitest config)

Pure utility functions are tested without React. Components are tested with React Testing
Library, focusing on user interactions and rendered output — not implementation details.
The `schedulerStore` is reset between tests using Zustand's `setState` reset pattern.

---

## Phase 1 — Object Search + Visibility Chart

**Goal:** User searches for objects and sees altitude-over-time visibility for their
location, matching the AstroMosaic UX pattern.

### Backend: Visibility Endpoint (`scheduler.py`)

```python
# GET /api/object_visibility
# Query params:
#   ra (float), dec (float)       — J2000 degrees
#   lat (float), lon (float)      — observer degrees
#   elevation (float)             — metres, default 0
#   date (str)                    — YYYY-MM-DD, default today
#   tz (str)                      — IANA timezone, default "UTC"
#   min_altitude (float)          — threshold degrees, default 30
# Returns:
#   curve: list of { time_local (ISO), altitude_deg, azimuth_deg } every 10 min over 24h
#   events: { rise_time_local, set_time_local, transit_time_local, max_altitude_deg }
#   twilight: { astro_dark_start, astro_dark_end }  (local ISO strings)
```

Add to `web_api.py` and equivalent Tauri command.

#### Tests — `test_scheduler.py`

```
test_altitude_curve_length            24h at 10-min intervals → 144 or 145 points
test_known_object_altitude            M42 at transit from observer lat=0 lon=0 is near its
                                      theoretical max altitude
test_rise_before_set                  rise_time < set_time for any object that rises/sets
test_polaris_always_above_horizon     from lat=45°N, Polaris altitude ≈ 45°, never sets
test_summer_triangle_not_visible      Vega below min_altitude all night from lat=45°N in Jan
test_twilight_order                   astro_dark_start < astro_dark_end, both present
test_min_altitude_threshold_respected no curve point below min_altitude is colored "visible"
test_invalid_date_returns_400
test_missing_required_params_400
```

### Frontend: `LocationPicker.tsx`

- Lat/lon number inputs + timezone select (IANA tz list)
- "Use my location" button (`navigator.geolocation`)
- Minimum altitude slider (0–60°, default 30°, step 5°)
- Saved to global settings (shared observer location, Decision #1)
- Shown as a collapsible section in the schedule builder header and in main settings

### Frontend: `ObjectSearch.tsx`

- Reuses existing catalog data and search logic from `CatalogSearch`
- On selecting a result, fetches visibility data and renders `VisibilityChart` inline
  (collapsed by default, expand on click)
- "Add to Schedule" button appends the target to `schedulerStore` with defaults:
  `startMin = 0`, `durationMin = 60`, `lpFilter = false`, `mosaic = null`

### Frontend: `VisibilityChart.tsx`

- X-axis: local time, midnight-centered (18:00 → 06:00 next day), labeled in observer timezone
- Y-axis: altitude 0°–90°
- Shaded regions: astronomical twilight, nautical twilight, civil twilight
- Altitude curve: green above `minAltitudeDeg`, amber within 5° of threshold, grey below
- Horizontal dashed line at `minAltitudeDeg`
- Vertical markers: rise, transit, set times
- Hover tooltip: altitude, azimuth, local time
- Library: **Recharts**

#### Tests — `visibilityHelpers.test.ts`

```
test_curve_data_sorted_by_time
test_twilight_regions_have_correct_keys
test_altitude_color_above_threshold       → "green"
test_altitude_color_near_threshold        → "amber"
test_altitude_color_below_threshold       → "grey"
test_chart_xaxis_midnight_centered        first tick ≤ 18:00, last tick ≥ 06:00
test_missing_rise_set_handled_gracefully  object always up or always down
```

---

## Phase 2 — Schedule Builder

**Goal:** User assembles an ordered list of targets with time windows and can edit or
reorder them before sending.

### Utility: `timeConversion.ts`

Isolates all `start_min` ↔ wall-clock logic so it can be tested independently of any UI.

#### Tests — `timeConversion.test.ts`

```
test_midnight_is_zero                 "00:00" → 0
test_noon_is_720                      "12:00" → 720
test_22h30_is_1350                    "22:30" → 1350
test_roundtrip_wall_clock             startMinToWallClock(wallClockToStartMin("21:45"), tz) === "21:45"
test_start_min_boundary_valid         0 and 1440 pass isValidStartMin
test_start_min_out_of_range_invalid   -1 and 1441 fail isValidStartMin
test_no_overlap_distinct_windows      non-overlapping targets → targetsOverlap = false
test_overlap_detected                 [60,120) vs [90,150) → true
test_adjacent_no_overlap              [60,120) vs [120,180) → false (touching not overlapping)
```

### Frontend: `ScheduleTimeline.tsx`

- Vertical list of `ScheduleTargetCard` components
- Drag-and-drop reorder via **@dnd-kit/sortable**
- Store `reorderTargets` called on drop; `start_min` values are not auto-adjusted (user sets them explicitly)
- Warning banner if any two targets have overlapping time windows
- Summary footer: total imaging time, count of targets
- "Clear Schedule" button (confirms via dialog)

#### Tests — `ScheduleTimeline.test.tsx`

```
test_renders_all_targets              3 targets in store → 3 cards rendered
test_empty_state_shown                empty schedule → placeholder message
test_overlap_warning_shown            two overlapping targets → warning banner visible
test_no_warning_when_no_overlap       clean schedule → no warning banner
test_clear_button_opens_confirm       click Clear → confirm dialog appears
test_clear_confirmed_empties_store    confirm → store is empty, cards gone
```

### Frontend: `ScheduleTargetCard.tsx`

Each row displays and edits one target inline:

| Control | Implementation |
|---|---|
| Name / alias | Editable text input (updates `aliasName`) |
| Start time | HH:MM time input → `wallClockToStartMin()` on change |
| Duration | Number input (minutes, min 1) |
| LP Filter | Toggle switch |
| Mosaic | Badge (`1.5× / 45°`) or "None"; click opens `MosaicFramingEditor` |
| Remove | Trash icon button |
| Drag handle | Grip icon on left edge |

#### Tests — `ScheduleTargetCard.test.tsx`

```
test_displays_alias_name
test_alias_edit_updates_store
test_start_time_displayed_as_wall_clock   start_min=1350 → "22:30" shown in input
test_start_time_edit_updates_store        typing "23:00" → store gets start_min=1380
test_duration_edit_updates_store
test_lp_filter_toggle_updates_store
test_mosaic_badge_shown_when_configured   scale=1.5, angle=45 → badge "1.5× / 45°" visible
test_mosaic_none_shown_when_null
test_remove_button_removes_from_store
```

### Frontend: `ScheduleBuilder.tsx` (layout shell)

Two-column layout (collapsible on narrow screens):
- **Left panel:** `ObjectSearch` → search and add targets
- **Right panel:** `ScheduleTimeline` → ordered schedule

Plan name input at top. Observer location summary (lat/lon) with edit link. "Send to
Telescope", export, and import controls in a sticky footer.

#### Tests — `schedulerStore.test.ts`

```
test_add_target_assigns_sequential_ids
test_add_multiple_targets_unique_ids
test_update_target_patches_fields_only
test_update_nonexistent_target_noop
test_remove_target_by_id
test_remove_nonexistent_noop
test_reorder_targets_swaps_positions
test_reorder_out_of_bounds_clamped
test_import_replaces_entire_schedule
test_clear_resets_to_empty
test_set_plan_name_updates_name
```

---

## Phase 3 — Mosaic Framing Editor

**Goal:** When adding a target with mosaic, or editing an existing one, the user adjusts
scale and rotation with a visual preview.

### Frontend: `MosaicFramingEditor.tsx`

Modal or slide-over panel with:

**Scale control**
- Slider: 1.0× to 2.0× (0.1 step)
- Numeric display: `1.5×`
- Maps to wire `scale` value directly

**Rotation control**
- Slider: −90° to +90° (5° steps, quantized)
- Numeric display with ° suffix
- Reset button restores 0°

**FOV Preview**
- SVG canvas: rectangle representing the camera FOV
- Rotated and scaled in real time as sliders move
- For `scale > 1.0`: additional semi-transparent panel rectangles shown overlapping to
  visualise mosaic coverage
- `star_map_angle` always `0.0` (Decision #4) — no star-map overlay needed

**Confirmation**
- "Apply" saves `MosaicConfig` to the target via `updateTarget` in `schedulerStore`
- "Cancel" discards unsaved changes
- Mosaic is suppressed (set to `null`) if scale=1.0 and angle=0° on Apply

#### Tests — `MosaicFramingEditor.test.tsx`

```
test_apply_saves_mosaic_config_to_store
test_cancel_does_not_modify_store
test_reset_scale_restores_1x
test_reset_angle_restores_0
test_trivial_mosaic_saved_as_null      scale=1.0, angle=0 → mosaic null after Apply
test_nontrivial_scale_saved            scale=1.5 → stored correctly
test_nontrivial_angle_saved            angle=45 → stored correctly
test_angle_quantized_to_5deg_steps     dragging to 47° snaps to 45°
```

---

## Phase 4 — Export, Import, and Send

### Utility: `scheduleSerialization.ts`

#### File Format

```json
{
  "esc_schedule_version": 1,
  "exported_at": "2026-04-18T22:00:00Z",
  "plan": {
    "plan_name": "My Plan",
    "update_time_seestar": "2026.04.18",
    "list": [
      {
        "target_id": 1,
        "target_name": "M31",
        "target_ra_dec": [10.6847929, 41.269065],
        "alias_name": "Andromeda Galaxy",
        "lp_filter": true,
        "start_min": 120,
        "duration_min": 60,
        "mosaic": { "scale": 1.5, "angle": 45.0, "star_map_angle": 0.0 }
      }
    ]
  }
}
```

#### Tests — `scheduleSerialization.test.ts`

```
test_export_includes_version_field
test_export_targets_sorted_by_start_min
test_trivial_mosaic_omitted_in_wire_format   scale=1.0, angle=0 → no "mosaic" key
test_nontrivial_mosaic_included
test_roundtrip_fidelity                      export → import → export produces identical JSON
test_import_valid_v1_file_succeeds
test_import_missing_plan_name_throws
test_import_missing_list_throws
test_import_wrong_version_throws             version=99 → error
test_import_malformed_json_throws
test_import_target_ra_dec_validated          non-array ra_dec → error
test_import_start_min_range_validated        start_min=1500 → error
```

### Export

- Browser: `<a download>` with a Blob URL
- Tauri desktop: `dialog.save()` + `fs.writeTextFile()`
- Default filename: `<plan-name>-<date>.json`

### Import

- Browser: `<input type="file">` accepting `.json`
- Tauri desktop: `dialog.open()` filter `.json`
- Parse and validate via `importScheduleFromJson()`
- Load into store via `importSchedule()`
- Toast: "Imported 4 targets from My Plan"
- Error toast on validation failure with message from thrown error

### Send to Telescope

Add backend endpoint / Tauri command:

```
POST /api/set_view_plan
Body: { telescope_id, plan_name, list }   ← list sorted by start_min ascending
Returns: { success: bool, code: number, message: str }
```

- Telescope is selected at send time from the list of connected telescopes (Decision #5)
- If no telescopes connected, prompt to connect first
- `code 0` → toast "Plan sent successfully"
- `code 536` → toast "Telescope is busy — another operation is in progress"
- Other error → toast with error detail
- "Send" button disabled and shows spinner during request

#### Tests — `test_scheduler.py` (continued)

```
test_set_view_plan_sorts_targets          targets sent out of order → device receives sorted
test_set_view_plan_omits_trivial_mosaic
test_set_view_plan_includes_nontrivial_mosaic
test_set_view_plan_returns_200_on_code_0  (mock TCP response)
test_set_view_plan_returns_error_on_536   (mock TCP response)
```

---

## Implementation Order

| Phase | Components / Files | Tests Added | Dependencies |
|---|---|---|---|
| 1a | `scheduler.py`, visibility endpoint, `LocationPicker.tsx` | `test_scheduler.py` (visibility) | astroplan (already in pyproject) |
| 1b | `VisibilityChart.tsx`, `visibilityHelpers.ts` | `visibilityHelpers.test.ts` | Recharts |
| 1c | `ObjectSearch.tsx` | — (integration covered by manual test) | Phase 1a, 1b |
| 2a | `schedulerStore.ts`, `timeConversion.ts` | `schedulerStore.test.ts`, `timeConversion.test.ts` | — |
| 2b | `ScheduleTargetCard.tsx`, `ScheduleTimeline.tsx` | `ScheduleTargetCard.test.tsx`, `ScheduleTimeline.test.tsx` | @dnd-kit, Phase 2a |
| 2c | `ScheduleBuilder.tsx` (wire together) | — | Phase 1c, 2b |
| 3 | `MosaicFramingEditor.tsx` | `MosaicFramingEditor.test.tsx` | Phase 2a |
| 4a | `scheduleSerialization.ts`, `ScheduleImportExport.tsx` | `scheduleSerialization.test.ts` | Phase 2a |
| 4b | `set_view_plan` backend + frontend send flow | `test_scheduler.py` (send tests) | Phase 2c, 4a |

---

## New Dependencies

| Package | Purpose | Size |
|---|---|---|
| `recharts` | Visibility altitude chart | ~330 KB |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag-and-drop schedule reorder | ~25 KB |

No new Python dependencies — `astroplan` and `astropy` are already in `pyproject.toml`.
