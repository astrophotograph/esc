# Beta Milestone Implementation Tasks

This document outlines the implementation plan for all Beta milestone issues in the ALP Experimental project.

## Critical Priority (Must Have for Beta)

### Issue #112: Make server more robust ✅ COMPLETED
**Goal**: Improve server stability, monitoring, and reliability

**Implementation Steps**:
1. **Add Health Check Endpoint** ✅ DONE
   - Create `/health` endpoint in FastAPI
   - Include system metrics (memory, CPU, thread count)
   - Check telescope connection status
   - Return structured health status

2. **Implement Memory Monitoring** ✅ DONE
   - Add memory usage tracking using `psutil`
   - Log warnings when memory exceeds thresholds
   - Implement automatic cleanup of stale connections

3. **Thread Monitoring** ✅ DONE
   - Track active asyncio tasks
   - Monitor thread pool usage
   - Add metrics for concurrent connections

4. **Comprehensive Testing** ✅ DONE
   - Add stress tests for concurrent connections
   - Test connection failure scenarios
   - Add integration tests for all API endpoints
   - Implement automated test coverage reporting

5. **Code Organization** ✅ DONE
   - Refactor large modules into smaller, focused ones
   - Improve error handling consistency
   - Add proper logging throughout

### Issue #110: Create abstractions for telescope movement, status
**Goal**: Build flexible abstraction layer to support multiple telescope types

**Implementation Steps**:
1. **Define Abstract Base Classes**
   - Create `AbstractTelescope` class with standard interface
   - Define methods: connect(), disconnect(), goto(), get_status(), etc.
   - Create `TelescopeStatus` dataclass for unified status reporting

2. **Implement Seestar Adapter**
   - Create `SeestarTelescope` implementing `AbstractTelescope`
   - Migrate existing Seestar-specific code
   - Ensure backward compatibility

3. **Create Telescope Factory**
   - Implement factory pattern for telescope instantiation
   - Support configuration-based telescope selection
   - Allow runtime telescope switching

4. **Update API Layer**
   - Modify endpoints to use abstraction layer
   - Ensure API remains stable during refactoring
   - Add telescope type to status responses

5. **Prepare for INDI Support**
   - Research INDI protocol requirements
   - Design INDI adapter interface
   - Create placeholder for future implementation

### Issue #98: Imaging goto fixes ✅ COMPLETED
**Goal**: Fix coordinate conversion issues and silent failures

**Implementation Steps**:
1. **Fix J2000 Coordinate Conversion** ✅ DONE
   - Review current coordinate transformation code
   - Implement proper J2000 to current epoch conversion using IAU 2000 precession
   - Add unit tests for coordinate transformations
   - Validate against known coordinate pairs

2. **Add Error Handling for Silent Failures** ✅ DONE
   - Audit all telescope communication code
   - Add explicit error checking after each command
   - Implement timeout handling for goto operations
   - Return meaningful error messages to frontend

3. **Add Goto Status Monitoring** ✅ DONE
   - Implement progress tracking during goto
   - Add `/goto/progress` and `/goto/cancel` endpoints
   - Add ability to cancel ongoing goto operations

4. **Testing** ✅ DONE
   - Create test suite for coordinate conversions
   - Add integration tests for goto operations
   - Test edge cases (polar regions, meridian flip)

### Issue #83: Add extra exposure settings when starting imaging
**Goal**: Allow users to configure imaging parameters before capture

**Implementation Steps**:
1. **Backend API Changes**
   - Extend imaging endpoint to accept gain and exposure parameters
   - Add validation for parameter ranges
   - Store user preferences for future sessions

2. **Frontend UI Updates**
   - Add exposure settings dialog/panel
   - Create gain and exposure duration controls
   - Add presets for common scenarios (lunar, deep sky, etc.)
   - Show real-time preview of settings impact

3. **Integration**
   - Connect UI controls to API
   - Add loading states during parameter changes
   - Handle errors gracefully

## High Priority (Important for Beta)

### Issue #93: Fully responsive layout ✅ COMPLETED
**Goal**: Ensure application works well on all screen sizes

**Implementation Steps**:
1. **Audit Current Layout** ✅ DONE
   - Test on various screen sizes (mobile, tablet, desktop)
   - Identify components that break on small screens
   - Document problem areas

2. **Implement Responsive Design** ✅ DONE
   - Use Tailwind responsive utilities with mobile-first approach
   - Create mobile-first layouts with `grid-cols-1 lg:grid-cols-4`
   - Implement collapsible sidebars/panels (bottom overlay on mobile)
   - Add touch-friendly controls with larger tap targets

3. **Component Updates** ✅ DONE
   - Update telescope control panel for mobile (responsive tabs, smaller icons)
   - Make image viewer responsive (adaptive height, mobile zoom controls)
   - Ensure dialogs work on small screens (using shadcn/ui responsive components)
   - Fix navigation for mobile devices (icon-only buttons, hide secondary actions)

4. **Testing** ✅ DONE
   - Implemented comprehensive responsive breakpoints
   - Added mobile detection with `useIsMobile()` hook
   - Touch-friendly controls throughout interface
   - Fixed coordinate display null reference bug

### Issue #74: Image in UI improvements
**Goal**: Better handling of image display and loading states

**Implementation Steps**:
1. **Improve Error Handling**
   - Add error boundaries for image components
   - Show meaningful error messages
   - Provide retry functionality
   - Add fallback UI for failed loads

2. **Add Loading States**
   - Implement skeleton loaders
   - Show progress for large image downloads
   - Add smooth transitions between states

3. **Handle Stale Images**
   - Add timestamp to images
   - Show indicator for outdated images
   - Auto-refresh stale images option
   - Clear visual distinction for live vs cached

4. **Performance Optimization**
   - Implement lazy loading
   - Add image caching strategy
   - Optimize image sizes for display

### Issue #76: Fix environment tab
**Goal**: Correct weather and moon phase calculations

**Implementation Steps**:
1. **Fix Calculations**
   - Review and correct moon phase algorithm
   - Fix weather data parsing
   - Add proper timezone handling
   - Validate calculations against known sources

2. **Extract to External Module**
   - Create separate astronomy utilities module
   - Make calculations reusable
   - Add comprehensive documentation
   - Include unit tests

3. **UI Updates**
   - Display accurate moon phase visualization
   - Show weather conditions clearly
   - Add refresh functionality
   - Include data source attribution

## Medium Priority (Nice to Have for Beta)

### Issue #94: Package for Windows, macOS
**Goal**: Create native installers without Docker dependency

**Implementation Steps**:
1. **Research Packaging Options**
   - Evaluate PyInstaller, cx_Freeze for Python
   - Consider Electron or Tauri for frontend
   - Investigate code signing requirements

2. **Create Build Pipeline**
   - Set up GitHub Actions for multi-platform builds
   - Implement build scripts for each platform
   - Handle platform-specific dependencies

3. **Testing**
   - Test installers on clean systems
   - Verify all features work in packaged app
   - Create installation documentation

### Issue #97: Add Playwright tests for multiple browsers
**Goal**: Ensure cross-browser compatibility

**Implementation Steps**:
1. **Set Up Playwright**
   - Add Playwright to frontend dependencies
   - Configure for multiple browsers
   - Set up CI integration

2. **Create Test Suite**
   - Write tests for critical user flows
   - Test responsive behavior
   - Verify SSE functionality across browsers
   - Add visual regression tests

3. **Browser Coverage**
   - Chrome/Chromium
   - Firefox
   - Safari (WebKit)
   - Edge
   - Additional browsers as needed

### Issue #96: Add browser console error capture
**Goal**: Implement error monitoring and reporting

**Implementation Steps**:
1. **Set Up Error Monitoring**
   - Integrate Sentry or similar service
   - Configure for both frontend and backend
   - Set up error filtering and grouping

2. **Add On-Demand Reporting**
   - Create UI for users to report issues
   - Include browser info and error context
   - Allow screenshot attachment
   - Send to monitoring service

3. **Privacy Considerations**
   - Allow users to opt-out
   - Sanitize sensitive data
   - Clear data retention policy

## Low Priority (Post-Beta)

### Issue #111: Lunar mode
**Goal**: Add specialized features for lunar observation

**Implementation Steps**:
1. **Requirements Gathering**
   - Research lunar observation needs
   - Define feature scope
   - Get user feedback on requirements

2. **Implementation** (TBD based on requirements)
   - Likely includes exposure presets
   - Moon phase integration
   - Specialized image processing

### Issue #109: Add dew heater indicator
**Goal**: Display dew heater status in UI

**Implementation Steps**:
1. **Backend Support**
   - Add dew heater status to telescope API
   - Include in SSE status updates

2. **Frontend Display**
   - Create dew heater indicator component
   - Add to telescope status panel
   - Include on/off toggle if supported

### Issue #95: Add link to Discord server in footer ✅ COMPLETED
**Goal**: Add community link to application

**Implementation Steps**:
1. **Simple UI Addition** ✅ DONE
   - Add Discord icon and link to footer with MessageCircle icon
   - Ensure responsive design (icon only on mobile, text on larger screens)
   - Open in new tab with proper security attributes
   - Added hover effects and community tooltip

### Issue #81: Getting started video
**Goal**: Create user onboarding video

**Implementation Steps**:
1. **Plan Content**
   - Installation steps
   - First connection
   - Basic operations
   - Troubleshooting tips

2. **Production**
   - Record screencast
   - Add narration
   - Edit and publish
   - Link from application

## Implementation Order Recommendation

1. **Week 1-2**: Server robustness (#112) and Imaging fixes (#98)
2. **Week 3-4**: Telescope abstractions (#110)
3. **Week 5**: Exposure settings (#83) and Responsive layout (#93)
4. **Week 6**: Image UI improvements (#74) and Environment tab (#76)
5. **Week 7**: Testing and bug fixes
6. **Week 8**: Beta release preparation

Post-beta items can be scheduled based on user feedback and priorities.