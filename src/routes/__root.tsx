import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Header } from '@/components/Header';

export const Route = createRootRoute({
  component: () => (
    <>
      <Header />
      <main className='pt-8 size-full'>
        <Outlet />
      </main>
    </>
  ),
});
