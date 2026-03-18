import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Header } from '@/components/Header';
import { PrivacyWarning } from '@/components/privacy-warning';
import { usePrivacyConsent } from '@/hooks/use-privacy-consent';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { hasConsented, accept } = usePrivacyConsent();

  if (hasConsented === null) {
    return null;
  }

  if (!hasConsented) {
    return <PrivacyWarning onAccept={accept} />;
  }

  return (
    <>
      <Header />
      <main className='size-full pt-8'>
        <Outlet />
      </main>
    </>
  );
}
