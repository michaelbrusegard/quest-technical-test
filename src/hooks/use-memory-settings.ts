import { useCallback, useEffect, useState } from 'react';

import { getMemorySettings, saveMemorySettings } from '@/lib/memory/domain/settings';
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from '@/lib/memory/domain/types';

export function useMemorySettings() {
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_MEMORY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void getMemorySettings()
      .then((resolvedSettings) => {
        if (mounted) {
          setSettings(resolvedSettings);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateSettings = useCallback(async (partialSettings: Partial<MemorySettings>) => {
    const nextSettings = await saveMemorySettings(partialSettings);
    setSettings(nextSettings);
    return nextSettings;
  }, []);

  return { settings, isLoading, updateSettings };
}
