import { Cog8ToothIcon, KeyIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiKeys } from '@/hooks/use-api-keys';

type SettingsDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { keys, isLoading, updateKey } = useApiKeys();
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('v0.0.0'));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        className='hover:bg-muted/50 relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors outline-none'
        aria-label='Settings'
      >
        <Cog8ToothIcon className='text-muted-foreground hover:text-foreground size-4 transition-colors' />
      </DialogTrigger>

      <DialogContent className='flex h-full max-h-[100dvh] overflow-hidden p-0 sm:h-[600px] sm:max-h-[85vh] sm:max-w-4xl'>
        <Tabs
          defaultValue='api-keys'
          className='flex h-full w-full flex-1 flex-col gap-0 sm:flex-row'
        >
          {/* Sidebar */}
          <div className='bg-muted/30 flex w-full shrink-0 flex-col border-b pt-4 pb-2 sm:w-[240px] sm:border-r sm:border-b-0 sm:pt-6 sm:pb-4'>
            <div className='mb-2 hidden px-4 sm:block'>
              <span className='text-muted-foreground text-xs font-semibold'>General</span>
            </div>

            <TabsList className='h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-2 sm:flex-col sm:justify-start sm:gap-0.5'>
              <TabsTrigger
                value='api-keys'
                className='data-[state=active]:bg-muted shrink-0 justify-center gap-2 px-3 py-2 data-[state=active]:shadow-none sm:w-full sm:justify-start sm:gap-3'
              >
                <KeyIcon className='size-4' />
                API Keys
              </TabsTrigger>
              <TabsTrigger
                value='memory-settings'
                className='data-[state=active]:bg-muted shrink-0 justify-center gap-2 px-3 py-2 data-[state=active]:shadow-none sm:w-full sm:justify-start sm:gap-3'
              >
                <CpuChipIcon className='size-4' />
                Memory Settings
              </TabsTrigger>
            </TabsList>

            <div className='mt-auto hidden px-5 pb-2 sm:block'>
              <div className='text-sm font-medium'>Quest Desktop</div>
              <div className='text-muted-foreground mt-0.5 text-xs'>v{appVersion}</div>
            </div>
          </div>

          {/* Main Content */}
          <div className='bg-background relative flex-1 overflow-y-auto p-6 sm:p-8'>
            <TabsContent value='api-keys' className='m-0 mt-0 h-full'>
              <div className='max-w-2xl'>
                <h2 className='mb-6 text-xl font-medium sm:mb-8'>API Keys</h2>

                {isLoading ? (
                  <div className='space-y-4'>
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                  </div>
                ) : (
                  <div className='bg-card/50 divide-y rounded-xl border shadow-sm'>
                    {/* OpenAI */}
                    <div className='flex flex-col gap-3 p-4'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='openai-key' className='text-sm font-medium'>
                          OpenAI API Key
                        </Label>
                        <span className='text-muted-foreground text-xs'>
                          Required for using OpenAI models like GPT
                        </span>
                      </div>
                      <Input
                        id='openai-key'
                        type='password'
                        placeholder='sk-...'
                        className='bg-background'
                        value={keys.openai}
                        onChange={(e) => updateKey('openai', e.target.value)}
                      />
                    </div>

                    {/* Anthropic */}
                    <div className='flex flex-col gap-3 p-4'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='anthropic-key' className='text-sm font-medium'>
                          Anthropic API Key
                        </Label>
                        <span className='text-muted-foreground text-xs'>
                          Required for using Anthropic models like Claude Sonnet
                        </span>
                      </div>
                      <Input
                        id='anthropic-key'
                        type='password'
                        placeholder='sk-ant-...'
                        className='bg-background'
                        value={keys.anthropic}
                        onChange={(e) => updateKey('anthropic', e.target.value)}
                      />
                    </div>

                    {/* Cerebras */}
                    <div className='flex flex-col gap-3 p-4'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='cerebras-key' className='text-sm font-medium'>
                          Cerebras API Key
                        </Label>
                        <span className='text-muted-foreground text-xs'>
                          Required for using Cerebras fast inference models
                        </span>
                      </div>
                      <Input
                        id='cerebras-key'
                        type='password'
                        placeholder='csk-...'
                        className='bg-background'
                        value={keys.cerebras}
                        onChange={(e) => updateKey('cerebras', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value='memory-settings' className='m-0 mt-0 h-full'>
              <div className='max-w-2xl'>
                <h2 className='mb-6 text-xl font-medium sm:mb-8'>Memory Settings</h2>
                <div className='text-muted-foreground text-sm'>
                  This section is under construction.
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
