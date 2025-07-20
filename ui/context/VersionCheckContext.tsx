"use client"

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

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

interface VersionCheckContextValue {
  versionInfo: VersionInfo | null;
  isChecking: boolean;
  error: string | null;
  checkForUpdates: (force?: boolean) => Promise<void>;
  lastChecked: Date | null;
}

const VersionCheckContext = createContext<VersionCheckContextValue | null>(null);

interface VersionCheckProviderProps {
  children: ReactNode;
  checkIntervalMinutes?: number;
}

export function VersionCheckProvider({ children, checkIntervalMinutes = 1440 }: VersionCheckProviderProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const isCheckingRef = useRef(false);
  const lastCheckTimeRef = useRef(0);

  const checkForUpdates = useCallback(async (force: boolean = false) => {
    // Prevent multiple simultaneous checks
    if (isCheckingRef.current) {
      console.log('Version check already in progress, skipping...');
      return;
    }
    
    // Debounce: don't check more than once per minute unless forced
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheckTimeRef.current;
    if (!force && timeSinceLastCheck < 60000) {
      console.log(`Version check debounced, last check was ${timeSinceLastCheck}ms ago`);
      return;
    }
    
    lastCheckTimeRef.current = now;
    isCheckingRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch(`/api/system/version/check?force=${force}`);
      
      if (!response.ok) {
        // Don't throw error for rate limiting, just log it
        if (response.status === 429) {
          console.warn('GitHub API rate limit exceeded for version check');
          // If we have cached data, don't treat as error
          if (versionInfo) {
            return;
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: VersionInfo = await response.json();
      
      // Only update if we got valid data
      if (data && data.last_checked) {
        setVersionInfo(data);
        setLastChecked(new Date());
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Version check failed:', err);
    } finally {
      setIsChecking(false);
      isCheckingRef.current = false;
    }
  }, [versionInfo]);

  // Check on mount
  useEffect(() => {
    checkForUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Set up periodic checking
  useEffect(() => {
    if (checkIntervalMinutes <= 0) return;

    const intervalMs = checkIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      checkForUpdates();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [checkIntervalMinutes, checkForUpdates]);

  return (
    <VersionCheckContext.Provider value={{
      versionInfo,
      isChecking,
      error,
      checkForUpdates,
      lastChecked
    }}>
      {children}
    </VersionCheckContext.Provider>
  );
}

export function useVersionCheck() {
  const context = useContext(VersionCheckContext);
  if (!context) {
    throw new Error('useVersionCheck must be used within a VersionCheckProvider');
  }
  return context;
}