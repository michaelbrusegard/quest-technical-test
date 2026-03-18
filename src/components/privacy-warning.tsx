import { getCurrentWindow } from '@tauri-apps/api/window';

import { Button } from '@/components/ui/button';

type PrivacyWarningProps = {
  onAccept: () => void;
};

export function PrivacyWarning({ onAccept }: PrivacyWarningProps) {
  return (
    <div className='flex h-screen w-full flex-col items-center justify-center bg-background p-6'>
      <div className='flex max-w-md flex-col gap-6 text-center'>
        <div className='flex flex-col gap-2'>
          <h1 className='font-heading text-2xl leading-none font-semibold tracking-tight'>
            Privacy Notice
          </h1>
          <p className='text-left text-sm text-muted-foreground'>
            This application reads your local browser history to build memory and personalize its
            responses. That data is stored locally, but relevant excerpts from your browsing history
            may be included in the context sent to the AI providers you configure when you chat. By
            continuing, you acknowledge and consent to that access and processing.
          </p>
        </div>
        <div className='flex justify-center gap-3'>
          <Button
            variant='outline'
            onClick={() => {
              void getCurrentWindow().close();
            }}
          >
            Quit
          </Button>
          <Button
            onClick={() => {
              onAccept();
            }}
          >
            I Understand
          </Button>
        </div>
      </div>
    </div>
  );
}
