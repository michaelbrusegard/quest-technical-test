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

let globalStrongholdPromise: Promise<{ stronghold: Stronghold; client: Client }> | null = null;
let globalKeysPromise: Promise<ApiKeys> | null = null;
let cachedKeys: ApiKeys | null = null;
const pendingWrites: Partial<Record<keyof ApiKeys, Promise<void>>> = {};
const listeners = new Set<(keys: ApiKeys) => void>();

function initStronghold() {
  if (!globalStrongholdPromise) {
    globalStrongholdPromise = (async () => {
      const dir = await appDataDir();
      const vaultPath = `${dir}/vault.hold`;
      const stronghold = await Stronghold.load(vaultPath, VAULT_PASSWORD);

      let client: Client;
      try {
        client = await stronghold.loadClient(CLIENT_NAME);
      } catch {
        client = await stronghold.createClient(CLIENT_NAME);
      }

      return { stronghold, client };
    })();
  }
  return globalStrongholdPromise;
}

function initKeys() {
  if (!globalKeysPromise) {
    globalKeysPromise = (async () => {
      const { client } = await initStronghold();
      const store = client.getStore();
      const loadedKeys = { openai: '', anthropic: '', cerebras: '' };

      for (const provider of ['openai', 'anthropic', 'cerebras']) {
        try {
          const data = await store.get(provider);
          if (data) {
            loadedKeys[provider as keyof ApiKeys] = new TextDecoder().decode(new Uint8Array(data));
          }
        } catch {
          continue;
        }
      }

      const resolvedKeys = cachedKeys ?? loadedKeys;
      cachedKeys = resolvedKeys;
      return resolvedKeys;
    })();
  }
  return globalKeysPromise;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(
    cachedKeys ?? {
      openai: '',
      anthropic: '',
      cerebras: '',
    },
  );
  const [isLoading, setIsLoading] = useState(!cachedKeys);
  const [strongholdState, setStrongholdState] = useState<{
    stronghold: Stronghold;
    client: Client;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const listener = (newKeys: ApiKeys) => {
      if (mounted) {
        setKeys(newKeys);
      }
    };
    listeners.add(listener);

    async function load() {
      try {
        const state = await initStronghold();
        if (mounted) {
          setStrongholdState(state);
        }

        const initialKeys = await initKeys();
        if (mounted) {
          setKeys(cachedKeys ?? initialKeys);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize Stronghold:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    if (!cachedKeys) {
      void load();
    } else {
      initStronghold()
        .then((state) => {
          if (mounted) {
            setStrongholdState(state);
          }
        })
        .catch((error) => {
          console.error('Failed to get cached Stronghold:', error);
        });
    }

    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const updateKey = useCallback(
    async (provider: keyof ApiKeys, value: string) => {
      const newKeys = { ...(cachedKeys ?? keys), [provider]: value };
      setKeys(newKeys);
      cachedKeys = newKeys;
      globalKeysPromise = Promise.resolve(newKeys);
      listeners.forEach((listener) => listener(newKeys));

      try {
        const state = strongholdState ?? (await initStronghold());
        if (!strongholdState) {
          setStrongholdState(state);
        }

        const previousWrite = pendingWrites[provider] ?? Promise.resolve();
        const nextWrite = previousWrite
          .catch(() => undefined)
          .then(async () => {
            const latestValue = cachedKeys?.[provider] ?? '';
            const store = state.client.getStore();
            if (latestValue) {
              const data = Array.from(new TextEncoder().encode(latestValue));
              await store.insert(provider, data);
            } else {
              await store.remove(provider);
            }
            await state.stronghold.save();
          });

        pendingWrites[provider] = nextWrite;
        await nextWrite;
      } catch (error) {
        console.error(`Failed to save key for ${provider}:`, error);
      }
    },
    [keys, strongholdState],
  );

  return { keys, isLoading, updateKey };
}
