# Comprehensive Unit Testing Plan for UI Codebase

## Overview
This document outlines a comprehensive plan for adding unit tests to the telescope control UI application. The plan is structured in phases to prioritize high-value testing targets and build a solid testing foundation.

## Current State Analysis
- **Test Framework**: Jest with React Testing Library
- **Current Coverage**: Minimal (2 test files)
  - `components/telescope/__tests__/CameraView.test.tsx`
  - `utils/__tests__/astronomical-calculations.test.ts`
- **Setup**: Well-configured with Next.js integration and necessary mocks

## Testing Philosophy
- Prioritize business logic over UI presentation
- Test behavior, not implementation details
- Focus on user interactions and data flows
- Ensure tests are maintainable and provide clear failure messages

## Phase 1: Foundation (Week 1)
Build a solid foundation by testing utilities and pure functions that form the core of the application.

### 1.1 Utilities & Pure Functions

#### storage-utils.ts
- **Priority**: High
- **Test Coverage Goals**:
  - Export functionality with various data types
  - Import functionality with validation
  - Error handling for corrupted data
  - Browser compatibility checks
  - File download trigger mechanics

#### streaming.ts
- **Priority**: Medium
- **Test Coverage Goals**:
  - Scope sanitization (XSS prevention)
  - URL construction with various parameters
  - Edge cases (empty scope, special characters)

#### celestial-calculations.ts
- **Priority**: Medium
- **Test Coverage Goals**:
  - Altitude/azimuth calculations accuracy
  - Visibility predictions for various locations
  - Edge cases (polar regions, equator)
  - Time zone handling

### 1.2 Custom Hooks

#### use-persistent-state.ts
- **Priority**: High
- **Test Coverage Goals**:
  - Initial state loading from localStorage
  - State updates and persistence
  - Error recovery (corrupted localStorage)
  - State synchronization across tabs
  - TypeScript type safety

#### use-persistent-object.ts
- **Priority**: High
- **Test Coverage Goals**:
  - Complex object persistence
  - Partial updates
  - Migration handling for schema changes
  - Performance with large objects

#### useTelescopes.ts
- **Priority**: High
- **Test Coverage Goals**:
  - API fetching and retry logic
  - Error state management
  - Polling mechanism
  - Loading states
  - Network failure handling

## Phase 2: Core Business Logic (Week 2)
Focus on the core business logic components that manage telescope operations and data.

### 2.1 Context & State Management

#### TelescopeContext.tsx
- **Priority**: Critical
- **Test Coverage Goals**:
  - Multi-telescope state management
  - Camera control state updates
  - Session lifecycle management
  - Equipment tracking operations
  - Notification system
  - Complex state interactions
  - Performance optimization verification

### 2.2 Data Management Components

#### ObservationLogger.tsx
- **Priority**: High
- **Test Coverage Goals**:
  - Log entry creation with validation
  - Edit/update functionality
  - Delete with confirmation
  - Export to various formats
  - Search and filtering
  - Data persistence integration

#### SessionManagement.tsx
- **Priority**: High
- **Test Coverage Goals**:
  - Session creation and naming
  - Active session tracking
  - Session statistics calculation
  - Auto-save functionality
  - Session recovery after crash

#### EquipmentManager.tsx
- **Priority**: High
- **Test Coverage Goals**:
  - Equipment CRUD operations
  - Maintenance schedule tracking
  - Usage hour calculations
  - Compatibility checking logic
  - Alert generation for maintenance

## Phase 3: API & Integration (Week 3)
Test API routes and complex UI components that integrate multiple systems.

### 3.1 API Routes

#### v2/telescopes/route.ts
- **Priority**: High
- **Test Coverage Goals**:
  - Telescope discovery endpoint
  - Error response formatting
  - Timeout handling
  - Multiple telescope scenarios

#### SSE Streaming Routes
- **Priority**: High
- **Test Coverage Goals**:
  - Event stream initialization
  - Connection management
  - Reconnection logic
  - Error recovery
  - Message formatting

### 3.2 Complex Components

#### CameraView.tsx (Expand existing tests)
- **Priority**: High
- **Test Coverage Goals**:
  - Image streaming integration
  - Annotation system interactions
  - Pan/zoom gesture handling
  - Fullscreen mode transitions
  - Performance with large images

#### FocusControl.tsx
- **Priority**: Medium
- **Test Coverage Goals**:
  - Focus adjustment commands
  - Auto-focus integration
  - Manual control interactions
  - Error state handling

#### TelescopeControls.tsx
- **Priority**: Medium
- **Test Coverage Goals**:
  - Movement command sending
  - State synchronization
  - Coordinate input validation
  - Safety limits enforcement

## Phase 4: Integration Tests (Week 4)
Test complete user workflows to ensure all components work together correctly.

### 4.1 End-to-End Workflows

#### Observation Recording Flow
- Target selection → Camera setup → Imaging → Logging → Export
- Test data persistence across the full flow
- Verify error recovery at each step

#### Equipment Management Flow
- Add new equipment → Track usage → Trigger maintenance alerts
- Test compatibility checking in observation planning
- Verify data integrity across sessions

#### Multi-Telescope Switching
- Discovery → Selection → State isolation → Switching
- Ensure no state leakage between telescopes
- Test connection recovery scenarios

## Testing Infrastructure

### Additional Dependencies
```json
{
  "devDependencies": {
    "@testing-library/react-hooks": "^8.0.1",
    "msw": "^2.0.0",
    "jest-localstorage-mock": "^2.4.26",
    "@types/jest": "^29.5.0",
    "jest-fetch-mock": "^3.0.3"
  }
}
```

### Test Utilities to Create

#### Mock Factories
- `mockTelescope()` - Generate telescope data
- `mockObservation()` - Generate observation entries
- `mockEquipment()` - Generate equipment records
- `mockSession()` - Generate session data

#### Test Helpers
- `renderWithContext()` - Render components with TelescopeContext
- `mockLocalStorage()` - localStorage testing utilities
- `createMockSSE()` - Server-Sent Events mocking
- `waitForLoadingToFinish()` - Async loading helper

#### API Mocking (MSW)
- Setup mock server with common endpoints
- Helper functions for different API scenarios
- Error simulation utilities

### Coverage Goals

| Phase | Target Coverage | Focus Area |
|-------|-----------------|------------|
| Phase 1-2 | 80% | Utilities and hooks |
| Phase 3 | 70% | Components |
| Phase 4 | 60% | Overall application |

### Quality Metrics
- All tests should run in < 30 seconds
- No flaky tests (100% reliability)
- Clear test descriptions
- Meaningful assertion messages

## CI/CD Integration

### Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test -- --bail --findRelatedTests"
    }
  }
}
```

### GitHub Actions
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

### Coverage Reporting
- Integrate with Codecov or similar service
- Add coverage badges to README
- Set minimum coverage thresholds
- Block PRs that decrease coverage

## Best Practices

### Test Organization
- Co-locate tests with components when possible
- Use descriptive test names that explain the behavior
- Group related tests with `describe` blocks
- Follow AAA pattern: Arrange, Act, Assert

### Mocking Strategy
- Mock at the boundaries (API, localStorage)
- Prefer real implementations when possible
- Use MSW for API mocking (closer to reality)
- Document why mocks are necessary

### Performance
- Use `beforeAll` for expensive setup
- Clean up after tests to prevent memory leaks
- Run tests in parallel when possible
- Profile slow tests and optimize

### Maintenance
- Update tests when requirements change
- Remove obsolete tests
- Refactor tests alongside production code
- Keep test utilities DRY

## Success Criteria
- [ ] All Phase 1 utilities have > 90% coverage
- [ ] Critical business logic has comprehensive tests
- [ ] API integration tests cover happy and error paths
- [ ] No decrease in coverage with new PRs
- [ ] Tests serve as documentation
- [ ] Team confidence in refactoring increases

## Timeline
- **Week 1**: Phase 1 - Foundation
- **Week 2**: Phase 2 - Core Business Logic
- **Week 3**: Phase 3 - API & Integration
- **Week 4**: Phase 4 - Integration Tests & Polish

## Notes
- This plan is a living document and should be updated as the project evolves
- Prioritize tests that provide the most value and confidence
- Consider pairing or mobbing on complex test implementations
- Celebrate testing milestones to maintain momentum