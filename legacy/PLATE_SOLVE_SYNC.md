# Plate Solve & Sync Feature

## Overview

This feature adds plate solving and telescope synchronization capabilities to the telescope control system using astrometry.net.

## Components Added

### Backend (`server/`)

1. **Astrometry Client** (`services/astrometry_client.py`)
   - Complete astrometry.net API integration
   - Handles image upload, job tracking, and result parsing
   - Supports async operation with configurable timeout
   - Automatically converts telescope images to JPEG format

2. **API Endpoints** (added to `main.py`)
   - `POST /api/telescopes/{telescope_name}/plate-solve` - Plate solve current image
   - `POST /api/telescopes/{telescope_name}/sync` - Sync telescope to coordinates

### Frontend (`ui/`)

1. **Plate Solve Sync Dialog** (`components/telescope/modals/PlateSolveSyncDialog.tsx`)
   - Shows current vs. plate-solved coordinates
   - Calculates and displays position differences
   - Provides sync confirmation with detailed information
   - Loading states and error handling

2. **Telescope Controls Integration** (`components/telescope/panels/TelescopeControls.tsx`)
   - Added "Plate Solve & Sync" button to movement controls
   - Integrated with telescope context for state management
   - Proper error handling and user feedback

3. **Context Updates** (`context/TelescopeContext.tsx`)
   - Added `handlePlateSolve()` and `handleSyncTelescope()` functions
   - Type-safe API integration

## Usage

### Prerequisites

1. **Astrometry.net API Key**: Set the `ASTROMETRY_API_KEY` environment variable or pass it as a parameter
2. **Active Image**: Ensure the telescope has captured a current image
3. **Connected Telescope**: Both main and imaging clients must be connected

### Workflow

1. **Capture Image**: Start imaging to ensure there's a current image available
2. **Click "Plate Solve & Sync"**: Located in the telescope controls panel
3. **Wait for Processing**: The system will:
   - Upload the current image to astrometry.net
   - Wait for plate solving to complete (up to 3 minutes)
   - Display results in a dialog
4. **Review Results**: The dialog shows:
   - Current telescope position
   - Plate-solved position
   - Position difference calculation
   - Additional solve information (orientation, pixel scale, field size)
5. **Sync or Cancel**: Choose to sync the telescope or cancel the operation

### Error Handling

- **No Current Image**: Returns 404 error with appropriate message
- **Imaging Client Disconnected**: Returns 503 error
- **Plate Solving Failure**: Shows detailed error from astrometry.net
- **API Key Missing**: Clear error message requesting API key
- **Invalid Coordinates**: Validation errors for sync coordinates

## API Details

### Plate Solve Endpoint

```http
POST /api/telescopes/{telescope_name}/plate-solve
Content-Type: application/json

{
  "api_key": "optional_api_key"  // Uses ASTROMETRY_API_KEY env var if not provided
}
```

**Response (Success):**
```json
{
  "success": true,
  "ra": 123.456789,
  "dec": 45.678901,
  "orientation": 12.34,
  "pixscale": 2.5,
  "field_width": 1.2,
  "field_height": 0.8,
  "job_id": 12345,
  "submission_id": 67890
}
```

### Sync Endpoint

```http
POST /api/telescopes/{telescope_name}/sync
Content-Type: application/json

{
  "ra": 123.456789,
  "dec": 45.678901
}
```

**Response:**
```json
{
  "success": true,
  "message": "Telescope synced to RA=123.456789°, Dec=45.678901°",
  "ra": 123.456789,
  "dec": 45.678901
}
```

## Configuration

### Environment Variables

- `ASTROMETRY_API_KEY`: Your astrometry.net API key (required)

### Astrometry.net Settings

The system uses these default settings:
- Upload privacy: Not commercial use, not public, no modifications
- Scale estimation: Uses telescope's current position if available
- Timeout: 180 seconds (3 minutes)
- Image format: JPEG with 90% quality

## Implementation Notes

### Image Processing

- Automatically converts telescope's raw image data to JPEG
- Handles both grayscale and color images
- Normalizes image data to 0-255 range for upload
- Uses OpenCV for image encoding

### Coordinate Handling

- All coordinates in decimal degrees
- RA range: 0-360°
- Dec range: -90° to +90°
- Position differences calculated in arcminutes
- Accounts for declination when calculating RA differences

### Performance

- Plate solving is asynchronous and non-blocking
- Uses cached raw image from imaging client
- Automatic cleanup of HTTP clients
- Progress indication in UI

### Security

- API keys not logged or exposed in responses
- Input validation for all coordinate values
- Proper error handling without exposing internal details

## Future Enhancements

1. **Local Astrometry**: Support for local astrometry.net installation
2. **Batch Processing**: Plate solve multiple images
3. **Auto-Sync**: Automatic sync after successful plate solve
4. **Blind Solving**: Solving without initial position hints
5. **Custom Settings**: Configurable astrometry.net parameters
6. **Result Caching**: Cache plate solve results for performance