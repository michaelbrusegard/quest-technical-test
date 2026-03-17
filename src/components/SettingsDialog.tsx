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
        className='relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md outline-none transition-colors hover:bg-muted/50'
        aria-label='Settings'
      >
        <Cog8ToothIcon className='size-4 text-muted-foreground transition-colors hover:text-foreground' />
      </DialogTrigger>

      <DialogContent className='sm:max-w-4xl p-0 overflow-hidden h-full max-h-[100dvh] sm:h-[600px] flex sm:max-h-[85vh]'>
        <Tabs
          defaultValue='api-keys'
          className='flex-1 w-full h-full gap-0 flex flex-col sm:flex-row'
        >
          {/* Sidebar */}
          <div className='w-full sm:w-[240px] border-b sm:border-b-0 sm:border-r bg-muted/30 flex flex-col pt-4 sm:pt-6 pb-2 sm:pb-4 shrink-0'>
            <div className='hidden sm:block px-4 mb-2'>
              <span className='text-xs font-semibold text-muted-foreground'>General</span>
            </div>

            <TabsList className='flex-row sm:flex-col h-auto w-full items-stretch justify-start sm:justify-start bg-transparent p-2 gap-1 sm:gap-0.5 overflow-x-auto overflow-y-hidden'>
              <TabsTrigger
                value='api-keys'
                className='justify-center sm:justify-start gap-2 sm:gap-3 px-3 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none shrink-0 sm:w-full'
              >
                <KeyIcon className='size-4' />
                API Keys
              </TabsTrigger>
              <TabsTrigger
                value='memory-settings'
                className='justify-center sm:justify-start gap-2 sm:gap-3 px-3 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none shrink-0 sm:w-full'
              >
                <CpuChipIcon className='size-4' />
                Memory Settings
              </TabsTrigger>
            </TabsList>

            <div className='hidden sm:block mt-auto px-5 pb-2'>
              <div className='text-sm font-medium'>Quest Desktop</div>
              <div className='text-xs text-muted-foreground mt-0.5'>v{appVersion}</div>
            </div>
          </div>

          {/* Main Content */}
          <div className='flex-1 overflow-y-auto bg-background p-6 sm:p-8 relative'>
            <TabsContent value='api-keys' className='m-0 mt-0 h-full'>
              <div className='max-w-2xl'>
                <h2 className='text-xl font-medium mb-6 sm:mb-8'>API Keys</h2>

                {isLoading ? (
                  <div className='space-y-4'>
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                  </div>
                ) : (
                  <div className='rounded-xl border bg-card/50 shadow-sm divide-y'>
                    {/* OpenAI */}
                    <div className='p-4 flex flex-col gap-3'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='openai-key' className='text-sm font-medium'>
                          OpenAI API Key
                        </Label>
                        <span className='text-xs text-muted-foreground'>
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
                    <div className='p-4 flex flex-col gap-3'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='anthropic-key' className='text-sm font-medium'>
                          Anthropic API Key
                        </Label>
                        <span className='text-xs text-muted-foreground'>
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
                    <div className='p-4 flex flex-col gap-3'>
                      <div className='flex flex-col gap-1'>
                        <Label htmlFor='cerebras-key' className='text-sm font-medium'>
                          Cerebras API Key
                        </Label>
                        <span className='text-xs text-muted-foreground'>
                          Required for using Cerebras fast inference models
                        </span>
                      </div>
                      <Input
                        id='cerebras-key'
                        type='password'
                        placeholder='cb-...'
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
                <h2 className='text-xl font-medium mb-6 sm:mb-8'>Memory Settings</h2>
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
