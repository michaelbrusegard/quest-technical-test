import { appDataDir } from '@tauri-apps/api/path';
import { Stronghold, type Client } from '@tauri-apps/plugin-stronghold';
import { useState, useEffect, useCallback } from 'react';

const VAULT_PASSWORD = 'default-app-vault-password';
const CLIENT_NAME = 'api-keys-client';

export type ApiKeys = {
  openai: string;
  anthropic: string;
  cerebras: string;
};

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>({ openai: '', anthropic: '', cerebras: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [strongholdState, setStrongholdState] = useState<{
    stronghold: Stronghold;
    client: Client;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const dir = await appDataDir();
        const vaultPath = `${dir}/vault.hold`;
        const stronghold = await Stronghold.load(vaultPath, VAULT_PASSWORD);

        let client: Client;
        try {
          client = await stronghold.loadClient(CLIENT_NAME);
        } catch {
          client = await stronghold.createClient(CLIENT_NAME);
        }

        if (mounted) {
          setStrongholdState({ stronghold, client });

          const store = client.getStore();

          // Read existing keys
          const loadedKeys = { openai: '', anthropic: '', cerebras: '' };

          for (const provider of ['openai', 'anthropic', 'cerebras']) {
            try {
              const data = await store.get(provider);
              if (data) {
                loadedKeys[provider as keyof ApiKeys] = new TextDecoder().decode(
                  new Uint8Array(data),
                );
              }
            } catch {
              // Key might not exist yet
            }
          }

          setKeys(loadedKeys);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize Stronghold:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  const updateKey = useCallback(
    async (provider: keyof ApiKeys, value: string) => {
      setKeys((prev) => ({ ...prev, [provider]: value }));

      if (!strongholdState) {
        return;
      }

      try {
        const store = strongholdState.client.getStore();
        if (value) {
          const data = Array.from(new TextEncoder().encode(value));
          await store.insert(provider, data);
        } else {
          await store.remove(provider);
        }
        await strongholdState.stronghold.save();
      } catch (error) {
        console.error(`Failed to save key for ${provider}:`, error);
      }
    },
    [strongholdState],
  );

  return { keys, isLoading, updateKey };
}
