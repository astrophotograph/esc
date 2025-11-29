# Testing the Sun in Celestial Object Dialog

## Changes Made

### Frontend (CelestialSearchDialog.tsx)
1. **Added solar warning dialog state**: A new state variable `showSolarWarningDialog` to control the visibility of the warning dialog
2. **Modified search behavior**: When searching for "sun", the dialog now includes below-horizon objects
3. **Added Sun detection in handleGoto**: Checks if the selected object is the Sun and shows warning dialog
4. **Disabled "Goto & Image" for Sun**: Similar to Moon, imaging is not available for the Sun
5. **Implemented comprehensive solar warning dialog** with:
   - Clear warning title with warning emoji
   - Detailed explanation of risks (sensor damage, fire risk, eye injury)
   - Requirement for proper solar filter
   - Red-colored confirm button to emphasize danger

### Backend (catalog.py)
1. **Modified quick_search_catalog**: Always includes Sun in results even if below horizon
2. **Modified search_catalog**: Always includes Sun regardless of horizon filter settings

## How to Test

1. Start the backend server:
   ```bash
   cd server
   uv run python main.py server
   ```

2. Start the frontend:
   ```bash
   cd ui
   npm run dev
   ```

3. Open the application and click the Celestial Object search button

4. Test scenarios:
   - **Default view**: The Sun should appear in the list even if it's nighttime (below horizon)
   - **Search for "sun"**: Type "sun" in the search box - it should appear
   - **Select Sun**: Click on the Sun object
   - **Click Goto**: Should trigger the solar warning dialog
   - **Warning dialog**: Should display comprehensive safety warning about solar observation
   - **Cancel**: Clicking Cancel should close the dialog without any action
   - **Proceed**: Clicking "I have a solar filter installed - Proceed" should initiate goto (only if user confirms they have proper filter)
   - **No "Goto & Image" option**: When Sun is selected, only "Goto" button should be available, not "Goto & Image"

## Safety Features
- Sun always appears in the list for educational/planning purposes
- Cannot proceed with goto without explicit acknowledgment of filter requirement
- Detailed warning about equipment damage and safety risks
- No imaging option available (similar to Moon)
- Red-colored confirmation button to emphasize danger

## Notes
- The Sun's position is calculated dynamically based on current date/time
- The warning is shown every time Sun goto is attempted (no "don't show again" option for safety)
- Similar to existing Moon handling but with additional safety warnings