import { Cog8ToothIcon, KeyIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useApiKeys } from '@/hooks/use-api-keys';
import { useMemorySettings } from '@/hooks/use-memory-settings';

type SettingsDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { keys, isLoading, updateKey } = useApiKeys();
  const { settings, isLoading: isLoadingMemorySettings, updateSettings } = useMemorySettings();
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('v0.0.0'));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        className='relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors outline-none hover:bg-muted/50'
        aria-label='Settings'
      >
        <Cog8ToothIcon className='size-4 text-muted-foreground transition-colors hover:text-foreground' />
      </DialogTrigger>

      <DialogContent className='flex h-full max-h-[100dvh] overflow-hidden p-0 sm:h-[600px] sm:max-h-[85vh] sm:max-w-4xl'>
        <Tabs
          defaultValue='api-keys'
          className='flex h-full w-full flex-1 flex-col gap-0 sm:flex-row'
        >
          {/* Sidebar */}
          <div className='flex w-full shrink-0 flex-col border-b bg-muted/30 pt-4 pb-2 sm:w-[240px] sm:border-r sm:border-b-0 sm:pt-6 sm:pb-4'>
            <div className='mb-2 hidden px-4 sm:block'>
              <span className='text-xs font-semibold text-muted-foreground'>General</span>
            </div>

            <TabsList className='h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-2 sm:flex-col sm:justify-start sm:gap-0.5'>
              <TabsTrigger
                value='api-keys'
                className='shrink-0 justify-center gap-2 px-3 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none sm:w-full sm:justify-start sm:gap-3'
              >
                <KeyIcon className='size-4' />
                API Keys
              </TabsTrigger>
              <TabsTrigger
                value='memory-settings'
                className='shrink-0 justify-center gap-2 px-3 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none sm:w-full sm:justify-start sm:gap-3'
              >
                <CpuChipIcon className='size-4' />
                Memory Settings
              </TabsTrigger>
            </TabsList>

            <div className='mt-auto hidden px-5 pb-2 sm:block'>
              <div className='text-sm font-medium'>Quest Desktop</div>
              <div className='mt-0.5 text-xs text-muted-foreground'>v{appVersion}</div>
            </div>
          </div>

          {/* Main Content */}
          <div className='relative flex-1 overflow-y-auto bg-background p-6 sm:p-8'>
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
                  <div className='divide-y rounded-xl border bg-card/50 shadow-sm'>
                    {/* OpenAI */}
                    <div className='flex flex-col gap-3 p-4'>
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
                    <div className='flex flex-col gap-3 p-4'>
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
                    <div className='flex flex-col gap-3 p-4'>
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
                {isLoadingMemorySettings ? (
                  <div className='space-y-4'>
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[72px] w-full rounded-xl' />
                    <Skeleton className='h-[96px] w-full rounded-xl' />
                  </div>
                ) : (
                  <div className='divide-y rounded-xl border bg-card/50 shadow-sm'>
                    <div className='flex items-center justify-between gap-4 p-4'>
                      <div className='space-y-1'>
                        <Label className='text-sm font-medium'>Enable memory</Label>
                        <p className='text-xs text-muted-foreground'>
                          Store browser-derived visits, sessions, and mentor insights in the local
                          SQLite memory database.
                        </p>
                      </div>
                      <Switch
                        checked={settings.enabled}
                        onCheckedChange={(checked) => {
                          void updateSettings({ enabled: checked });
                        }}
                      />
                    </div>

                    <div className='flex items-center justify-between gap-4 p-4'>
                      <div className='space-y-1'>
                        <Label className='text-sm font-medium'>Auto-enrich sessions</Label>
                        <p className='text-xs text-muted-foreground'>
                          Use Cerebras to summarize new sessions and infer themes, behavior signals,
                          and tentative goals.
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoEnrich}
                        onCheckedChange={(checked) => {
                          void updateSettings({ autoEnrich: checked });
                        }}
                      />
                    </div>

                    <div className='grid gap-4 p-4 sm:grid-cols-2'>
                      <div className='space-y-2'>
                        <Label htmlFor='session-gap'>Session gap (minutes)</Label>
                        <Input
                          id='session-gap'
                          type='number'
                          min={5}
                          max={240}
                          value={settings.sessionGapMinutes}
                          onChange={(event) => {
                            void updateSettings({
                              sessionGapMinutes:
                                Number(event.target.value) || settings.sessionGapMinutes,
                            });
                          }}
                        />
                      </div>

                      <div className='space-y-2'>
                        <Label htmlFor='retention-days'>Retention (days)</Label>
                        <Input
                          id='retention-days'
                          type='number'
                          min={7}
                          max={730}
                          value={settings.retentionDays}
                          onChange={(event) => {
                            void updateSettings({
                              retentionDays: Number(event.target.value) || settings.retentionDays,
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className='space-y-3 p-4'>
                      <div className='space-y-1'>
                        <Label htmlFor='excluded-domains' className='text-sm font-medium'>
                          Excluded domains
                        </Label>
                        <p className='text-xs text-muted-foreground'>
                          One domain per line. Matching domains are ignored during sync.
                        </p>
                      </div>
                      <Textarea
                        id='excluded-domains'
                        className='min-h-28 bg-background'
                        value={settings.excludedDomains.join('\n')}
                        onChange={(event) => {
                          void updateSettings({
                            excludedDomains: event.target.value.split('\n'),
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
