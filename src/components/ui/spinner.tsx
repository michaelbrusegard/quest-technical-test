import type React from 'react';

import { ArrowPathIcon } from '@heroicons/react/24/outline';

import { cn } from '@/lib/utils';

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof ArrowPathIcon>): React.ReactElement {
  return (
    <ArrowPathIcon
      aria-label='Loading'
      className={cn('animate-spin', className)}
      role='status'
      {...props}
    />
  );
}
