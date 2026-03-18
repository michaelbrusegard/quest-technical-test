import { useState, useCallback, useEffect } from 'react';

const PRIVACY_CONSENT_KEY = 'quest:privacy-consent';

export function usePrivacyConsent() {
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PRIVACY_CONSENT_KEY);
    setHasConsented(stored === 'true');
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(PRIVACY_CONSENT_KEY, 'true');
    setHasConsented(true);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(PRIVACY_CONSENT_KEY);
    setHasConsented(false);
  }, []);

  return { hasConsented, accept, reset };
}
