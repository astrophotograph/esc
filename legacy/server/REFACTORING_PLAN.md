# Server Refactoring Plan for Issue #112

## Current State Analysis

The main.py file has grown to nearly 4000 lines, which violates good software engineering practices. This makes the code:
- Hard to maintain
- Difficult to test
- Prone to merge conflicts
- Hard for new developers to understand

## Refactoring Strategy

### 1. Extract Core Classes (High Priority)

#### a) Controller Class -> `controllers/telescope_controller.py`
- The `Controller` class is ~1500 lines and should be its own module
- Extract to `controllers/telescope_controller.py`
- Benefits: Easier testing, better organization, single responsibility

#### b) Telescope Class -> `models/telescope.py`
- The `Telescope` model is complex with many methods
- Should be in a dedicated models directory
- Extract image processing and enhancement logic to separate classes

#### c) TestTelescope Class -> `models/test_telescope.py`
- Separate test functionality from production code

### 2. Extract Service Modules (High Priority)

#### a) Star Map Generation -> `services/starmap_service.py`
- ~200 lines of star map generation code
- Move to dedicated service module
- Create `StarMapService` class with proper error handling

#### b) API Endpoint Registration -> `services/api_service.py`
- Extract the complex API router creation logic
- Standardize endpoint registration patterns

#### c) Discovery Service -> `services/discovery_service.py`
- Extract telescope discovery logic
- Make it more testable and configurable

### 3. Create Dedicated API Routers (Medium Priority)

#### a) Telescope Management Router -> `api/routers/telescopes.py`
- Extract telescope CRUD operations
- Standardize response formats
- Add proper validation

#### b) Connection Management Router -> `api/routers/connections.py`
- Extract connection/disconnection logic
- Add connection status endpoints

### 4. Improve Configuration Management (Medium Priority)

#### a) Configuration Service -> `config/settings.py`
- Extract all configuration handling
- Support environment variables
- Add validation for settings

#### b) Constants -> `config/constants.py`
- Extract magic numbers and strings
- Centralize default values

### 5. Enhanced Error Handling (Low Priority)

#### a) Custom Exceptions -> `exceptions/telescope_exceptions.py`
- Create domain-specific exception classes
- Improve error reporting and debugging

#### b) Validation -> `validators/telescope_validators.py`
- Extract validation logic
- Make it reusable across endpoints

## Implementation Plan

### Phase 1: Core Extraction (Week 1)
1. Create directory structure
2. Extract Controller class
3. Extract Telescope models
4. Update imports and tests

### Phase 2: Service Extraction (Week 2)
1. Extract StarMap service
2. Extract Discovery service
3. Create API service layer

### Phase 3: API Organization (Week 3)
1. Create dedicated routers
2. Standardize response formats
3. Add comprehensive documentation

### Phase 4: Configuration & Polish (Week 4)
1. Extract configuration management
2. Add custom exceptions
3. Improve validation
4. Update documentation

## Expected Benefits

1. **Maintainability**: Smaller, focused modules are easier to understand and modify
2. **Testability**: Individual components can be tested in isolation
3. **Reusability**: Services can be reused across different parts of the application
4. **Performance**: Better import granularity and potential for lazy loading
5. **Team Development**: Multiple developers can work on different modules simultaneously

## File Structure After Refactoring

```
server/
├── main.py                      (~200 lines - just FastAPI setup)
├── controllers/
│   ├── __init__.py
│   └── telescope_controller.py  (Controller class)
├── models/
│   ├── __init__.py
│   ├── telescope.py            (Telescope class)
│   └── test_telescope.py       (TestTelescope class)
├── services/
│   ├── __init__.py
│   ├── starmap_service.py      (Star map generation)
│   ├── discovery_service.py    (Telescope discovery)
│   └── api_service.py          (API registration)
├── api/
│   └── routers/
│       ├── telescopes.py       (Telescope CRUD)
│       └── connections.py      (Connection management)
├── config/
│   ├── __init__.py
│   ├── settings.py             (Configuration)
│   └── constants.py            (Constants)
├── exceptions/
│   ├── __init__.py
│   └── telescope_exceptions.py (Custom exceptions)
└── validators/
    ├── __init__.py
    └── telescope_validators.py (Validation logic)
```

## Migration Strategy

1. **Backward Compatibility**: Maintain all existing API endpoints during refactoring
2. **Incremental Migration**: Move one component at a time
3. **Testing**: Ensure all tests pass after each refactoring step
4. **Documentation**: Update documentation as components are moved

## Metrics for Success

- main.py reduced to <300 lines
- No single module >500 lines
- Test coverage maintained or improved
- All existing functionality preserved
- Performance maintained or improved

## Risk Mitigation

1. **Extensive Testing**: Run full test suite after each change
2. **Feature Flags**: Use feature flags for major changes
3. **Rollback Plan**: Maintain ability to rollback changes
4. **Code Review**: Require reviews for all refactoring PRs