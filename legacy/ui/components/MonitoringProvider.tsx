'use client';

import { useEffect } from 'react';
import { startMonitoring, stopMonitoring } from '@/lib/monitoring';

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Start client-side monitoring
    startMonitoring(60); // Log every 60 seconds
    
    // Cleanup on unmount
    return () => {
      stopMonitoring();
    };
  }, []);
  
  return <>{children}</>;
}