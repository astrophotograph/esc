# Instructions for Applying Scopinator Patch

## Purpose
This patch adds the `get_cached_raw_image()` method to the `SeestarImagingClient` class, which is required for the plate solving functionality.

## What the patch does:
1. Adds `cached_raw_image` attribute to store the latest image
2. Adds `cached_raw_image_lock` for thread-safe access
3. Caches each received image in the `get_next_image` method
4. Implements the `get_cached_raw_image()` method to retrieve the cached image

## How to apply the patch:

### Option 1: Using the patch command (recommended)
```bash
cd /Users/erewhon/Projects/erewhon/esc/main/server
patch -p1 < scopinator_get_cached_raw_image.patch /Users/erewhon/Projects/erewhon/esc/main/server/.venv/lib/python3.12/site-packages/scopinator/seestar/imaging_client.py
```

### Option 2: Direct patch application
```bash
cd /Users/erewhon/Projects/erewhon/esc/main/server/.venv/lib/python3.12/site-packages
patch -p1 < /Users/erewhon/Projects/erewhon/esc/main/server/scopinator_get_cached_raw_image.patch
```

### Option 3: Manual application
If the patch command doesn't work, you can manually edit the file:
1. Open `/Users/erewhon/Projects/erewhon/esc/main/server/.venv/lib/python3.12/site-packages/scopinator/seestar/imaging_client.py`
2. Add `import threading` at the top with other imports
3. Add the two attributes to the class definition (around line 103)
4. Initialize `cached_raw_image_lock` in `__init__` method (around line 148)
5. Add the caching code in `get_next_image` method after `yield image` (around line 365)
6. Uncomment and modify the `get_cached_raw_image` method (around line 522)

## Verification
After applying the patch, you can verify it worked by:
```bash
python -c "from scopinator.seestar.imaging_client import SeestarImagingClient; print(hasattr(SeestarImagingClient, 'get_cached_raw_image'))"
```
This should print `True` if the patch was applied successfully.