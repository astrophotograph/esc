'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { CRTWarp } from './effects/crt-warp';

export function ThemeEffects() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <CRTWarp theme={theme || 'dark'} />;
}