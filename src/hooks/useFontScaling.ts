import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Hook to apply system font scaling to the application.
 *
 * This hook:
 * 1. Gets the window's scale factor on mount
 * 2. Listens for scale factor changes
 * 3. Applies the scale factor to a CSS custom property
 *
 * The scale factor affects the root font size, allowing the entire
 * UI to scale proportionally with the system's DPI/font scaling settings.
 */
export function useFontScaling() {
  const [scaleFactor, setScaleFactor] = useState<number>(1);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const applyScaleFactor = (factor: number) => {
      // Base font size is 16px, scale it by the system factor
      // We use a minimum of 1.0 to prevent tiny text
      const clampedFactor = Math.max(factor, 1.0);
      const scaledFontSize = 16 * clampedFactor;

      document.documentElement.style.setProperty(
        '--system-font-scale',
        clampedFactor.toString()
      );
      document.documentElement.style.setProperty(
        '--base-font-size',
        `${scaledFontSize}px`
      );

      setScaleFactor(clampedFactor);
    };

    const init = async () => {
      try {
        const window = getCurrentWindow();

        // Get initial scale factor
        const factor = await window.scaleFactor();
        applyScaleFactor(factor);

        // Listen for scale factor changes (e.g., moving window between monitors)
        unlisten = await window.onScaleChanged(({ payload }) => {
          applyScaleFactor(payload.scaleFactor);
        });
      } catch (error) {
        // Fallback for non-Tauri environment (e.g., browser dev mode)
        console.debug('Font scaling: Using default scale factor', error);
        applyScaleFactor(1);
      }
    };

    init();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return scaleFactor;
}

/**
 * Initialize font scaling without React.
 * Call this early in app initialization for immediate effect.
 */
export async function initializeFontScaling(): Promise<void> {
  try {
    const window = getCurrentWindow();
    const factor = await window.scaleFactor();

    const clampedFactor = Math.max(factor, 1.0);
    const scaledFontSize = 16 * clampedFactor;

    document.documentElement.style.setProperty(
      '--system-font-scale',
      clampedFactor.toString()
    );
    document.documentElement.style.setProperty(
      '--base-font-size',
      `${scaledFontSize}px`
    );

    console.log(`Font scaling initialized: ${clampedFactor}x (${scaledFontSize}px base)`);
  } catch (error) {
    // Fallback for non-Tauri environment
    document.documentElement.style.setProperty('--system-font-scale', '1');
    document.documentElement.style.setProperty('--base-font-size', '16px');
  }
}
