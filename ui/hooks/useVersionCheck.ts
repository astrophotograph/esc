import { useState, useEffect, useCallback } from 'react';

export interface VersionInfo {
  update_available: boolean;
  current_version: string;
  latest_version?: string;
  release_name?: string;
  release_date?: string;
  release_url?: string;
  release_notes?: string;
  download_url?: string;
  last_checked: string;
  error?: string;
}

export interface UseVersionCheckOptions {
  checkOnMount?: boolean;
  checkIntervalMinutes?: number;
  onUpdateAvailable?: (versionInfo: VersionInfo) => void;
}

export interface UseVersionCheckReturn {
  versionInfo: VersionInfo | null;
  isChecking: boolean;
  error: string | null;
  checkForUpdates: (force?: boolean) => Promise<void>;
  lastChecked: Date | null;
}

export function useVersionCheck(options: UseVersionCheckOptions = {}): UseVersionCheckReturn {
  const {
    checkOnMount = true,
    checkIntervalMinutes = 60, // Check every hour by default
    onUpdateAvailable
  } = options;

  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkForUpdates = useCallback(async (force: boolean = false) => {
    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch(`/api/system/version/check?force=${force}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: VersionInfo = await response.json();
      setVersionInfo(data);
      setLastChecked(new Date());

      // Call callback if update is available
      if (data.update_available && onUpdateAvailable) {
        onUpdateAvailable(data);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Version check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, [onUpdateAvailable]);

  // Check on mount
  useEffect(() => {
    if (checkOnMount) {
      checkForUpdates();
    }
  }, [checkOnMount, checkForUpdates]);

  // Set up periodic checking
  useEffect(() => {
    if (checkIntervalMinutes <= 0) return;

    const intervalMs = checkIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      checkForUpdates();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [checkIntervalMinutes, checkForUpdates]);

  return {
    versionInfo,
    isChecking,
    error,
    checkForUpdates,
    lastChecked
  };
}