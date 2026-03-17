import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';

import { SettingsDialog } from '@/components/SettingsDialog';
import { cn } from '@/lib/utils';

const FULLSCREEN_UPDATE_DELAY = 100;

type WindowButtonProps = {
  onClick: () => void;
  isFocused: boolean;
  focusedColor: string;
  hoverColor: string;
  ariaLabel: string;
  children: React.ReactNode;
};

function WindowButton({
  onClick,
  isFocused,
  focusedColor,
  hoverColor,
  ariaLabel,
  children,
}: WindowButtonProps) {
  return (
    <button
      type='button'
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'relative flex h-3 w-3 cursor-pointer items-center justify-center rounded-full transition-colors outline-none',
        isFocused ? focusedColor : 'bg-border group-hover:' + hoverColor,
      )}
      aria-label={ariaLabel}
    >
      <div className='absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100'>
        {children}
      </div>
    </button>
  );
}

type FullscreenIconProps = {
  isFullscreen: boolean;
  isFocused: boolean;
};

function FullscreenIcon({ isFullscreen, isFocused }: FullscreenIconProps) {
  if (isFullscreen) {
    return (
      <>
        <span
          className={cn(
            'absolute inset-0 m-auto h-0 w-0 -translate-x-[2.25px] -translate-y-[2.25px] rounded-[1px] border-b-[4.5px] border-l-[4.5px] border-l-transparent transition-colors',
            isFocused
              ? 'border-b-[#036200]'
              : 'border-b-transparent group-hover:border-b-[#036200]',
          )}
        />
        <span
          className={cn(
            'absolute inset-0 m-auto h-0 w-0 translate-x-[2.25px] translate-y-[2.25px] rounded-[1px] border-t-[4.5px] border-r-[4.5px] border-r-transparent transition-colors',
            isFocused
              ? 'border-t-[#036200]'
              : 'border-t-transparent group-hover:border-t-[#036200]',
          )}
        />
      </>
    );
  }

  return (
    <>
      <span className='absolute inset-0 m-auto h-[6px] w-[6px] rounded-[1px] bg-[#036200]' />
      <span
        className={cn(
          'absolute inset-0 m-auto h-[2px] w-[10px] -rotate-45 rounded-[1px] transition-colors',
          isFocused ? 'bg-[#28c840]' : 'bg-border group-hover:bg-[#28c840]',
        )}
      />
    </>
  );
}

type WindowControlsProps = {
  isFocused: boolean;
  isFullscreen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onFullscreen: () => void;
};

function WindowControls({
  isFocused,
  isFullscreen,
  onClose,
  onMinimize,
  onFullscreen,
}: WindowControlsProps) {
  return (
    <div className='group relative z-10 flex items-center gap-2'>
      <WindowButton
        onClick={onClose}
        isFocused={isFocused}
        focusedColor='bg-[#ff5f57]'
        hoverColor='bg-[#ff5f57]'
        ariaLabel='Close window'
      >
        <span className='absolute inset-0 m-auto h-[1.5px] w-2 rotate-45 rounded-[1px] bg-[#900]' />
        <span className='absolute inset-0 m-auto h-[1.5px] w-2 -rotate-45 rounded-[1px] bg-[#900]' />
      </WindowButton>
      <WindowButton
        onClick={onMinimize}
        isFocused={isFocused}
        focusedColor='bg-[#febc2e]'
        hoverColor='bg-[#febc2e]'
        ariaLabel='Minimize window'
      >
        <span className='absolute inset-0 m-auto h-[1.5px] w-2 rounded-[1px] bg-[#985600]' />
      </WindowButton>
      <WindowButton
        onClick={onFullscreen}
        isFocused={isFocused}
        focusedColor='bg-[#28c840]'
        hoverColor='bg-[#28c840]'
        ariaLabel='Toggle fullscreen'
      >
        <FullscreenIcon isFullscreen={isFullscreen} isFocused={isFocused} />
      </WindowButton>
    </div>
  );
}

export function Header() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  const updateFullscreenState = useCallback(async () => {
    try {
      const fullscreen = await getCurrentWindow().isFullscreen();
      setIsFullscreen(fullscreen);
    } catch {}
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    void updateFullscreenState();

    async function initFocusState() {
      try {
        const focused = await win.isFocused();
        setIsFocused(focused);
      } catch {}
    }
    void initFocusState();

    let unlistenFocus: (() => void) | null = null;
    let unlistenResize: (() => void) | null = null;

    async function setupListeners() {
      try {
        unlistenFocus = await win.onFocusChanged(({ payload }) => {
          setIsFocused(payload);
          setTimeout(updateFullscreenState, FULLSCREEN_UPDATE_DELAY);
        });
        unlistenResize = await win.onResized(() => {
          setTimeout(updateFullscreenState, FULLSCREEN_UPDATE_DELAY);
        });
      } catch {}
    }
    void setupListeners();

    return () => {
      unlistenFocus?.();
      unlistenResize?.();
    };
  }, [updateFullscreenState]);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch {}
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {}
  }, []);

  const handleFullscreen = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const currentFullscreen = await win.isFullscreen();
      await win.setFullscreen(!currentFullscreen);
      setIsFullscreen(!currentFullscreen);
    } catch {}
  }, []);

  return (
    <header
      className={cn(
        'border-border bg-background fixed z-100 h-8 w-full border-b transition-opacity select-none',
        isFullscreen ? 'opacity-0 hover:opacity-100' : 'rounded-t-2xl opacity-100',
      )}
    >
      <div
        className={cn(
          'bg-muted/30 relative flex size-full items-center justify-between px-3',
          !isFullscreen && 'rounded-t-2xl',
        )}
      >
        <div data-tauri-drag-region className='absolute inset-y-0 right-0 left-24' />

        <div className='relative z-10 flex items-center gap-4'>
          <WindowControls
            isFocused={isFocused}
            isFullscreen={isFullscreen}
            onClose={handleClose}
            onMinimize={handleMinimize}
            onFullscreen={handleFullscreen}
          />
          <SettingsDialog />
        </div>

        <span className='text-foreground font-heading pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-sm font-medium'>
          Quest
        </span>

        <div className='relative z-10 w-16' />
      </div>
    </header>
  );
}
