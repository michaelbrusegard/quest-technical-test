import type React from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type TooltipIconButtonProps = React.ComponentProps<typeof Button> & {
  tooltip: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
};

export function TooltipIconButton({
  children,
  tooltip,
  side = 'bottom',
  className,
  ...rest
}: TooltipIconButtonProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            {...rest}
            className={cn('aui-button-icon size-6 p-1', className)}
          />
        }
      >
        {children}
        <span className='sr-only'>{tooltip}</span>
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
