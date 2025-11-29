# Fix Instructions for Plate Solve "No current image available" Error

## The Problem
The plate solve is failing because:
1. The cached image might not be set correctly
2. The imaging client might not be in the right mode
3. The telescope might not be actively receiving images

## Fixes to Apply

### 1. Fix the caching issue in imaging_client.py
Apply the patch to fix where images are cached:
```bash
cd /Users/erewhon/Projects/erewhon/esc/main/server/.venv/lib/python3.12/site-packages
patch -p1 < /Users/erewhon/Projects/erewhon/esc/main/server/fix_cached_image.patch
```

### 2. Fix the plate solve endpoint to handle missing images better
Apply the patch to improve error handling and fallback options:
```bash
cd /Users/erewhon/Projects/erewhon/esc/main
patch -p1 < server/fix_plate_solve_image.patch
```

## Manual Fix Option
If the patches don't work, manually edit `/Users/erewhon/Projects/erewhon/esc/main/server/models/telescope.py` around line 985:

Replace:
```python
# Get the current image
current_image = self.imaging.get_cached_raw_image()
if current_image is None:
    raise HTTPException(
        status_code=404, detail="No current image available"
    )
```

With:
```python
# Try to get the current cached image first
current_image = None
if hasattr(self.imaging, 'get_cached_raw_image'):
    current_image = self.imaging.get_cached_raw_image()

# If no cached image, try to get from the image attribute
if current_image is None:
    if hasattr(self.imaging, 'image') and self.imaging.image is not None:
        current_image = self.imaging.image
        logging.info("Using imaging.image for plate solve")
    else:
        # Check if we're in the right mode to get images
        if self.imaging.client_mode not in ["ContinuousExposure", "Stack", "Streaming"]:
            raise HTTPException(
                status_code=400,
                detail=f"Telescope must be in imaging mode to perform plate solve. Current mode: {self.imaging.client_mode}"
            )
        else:
            raise HTTPException(
                status_code=404,
                detail="No current image available. Please ensure the telescope is receiving images."
            )
else:
    logging.info("Using cached raw image for plate solve")
```

## How to Test
1. Make sure the telescope is connected and in ContinuousExposure mode (scenery mode)
2. Wait a few seconds for images to start flowing
3. Then try the plate solve button

## Additional Debugging
If it still doesn't work, check the logs to see:
- What mode the imaging client is in
- Whether images are being received
- Whether the caching is working

You can add debug logging to see what's happening:
```python
logging.info(f"Imaging client mode: {self.imaging.client_mode}")
logging.info(f"Has cached_raw_image: {hasattr(self.imaging, 'cached_raw_image')}")
logging.info(f"Cached image is None: {self.imaging.cached_raw_image is None if hasattr(self.imaging, 'cached_raw_image') else 'N/A'}")
logging.info(f"Has image attr: {hasattr(self.imaging, 'image')}")
logging.info(f"Image attr is None: {self.imaging.image is None if hasattr(self.imaging, 'image') else 'N/A'}")
```