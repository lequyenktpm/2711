import { useCallback, useEffect, useState } from 'react';

export interface ClientApiKeys {
  elevenlabsApiKey: string;
  geminiApiKey: string;
}

const STORAGE_KEY = 'kineticsub_client_api_keys_v1';
const KEYS_UPDATED_EVENT = 'kineticsub:client-api-keys-updated';

const EMPTY_KEYS: ClientApiKeys = {
  elevenlabsApiKey: '',
  geminiApiKey: '',
};

export function loadClientApiKeys(): ClientApiKeys {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...EMPTY_KEYS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_KEYS };
    const parsed = JSON.parse(raw) as Partial<ClientApiKeys> & { elevenLabsApiKey?: string };
    return {
      elevenlabsApiKey:
        typeof parsed.elevenlabsApiKey === 'string'
          ? parsed.elevenlabsApiKey.trim()
          : typeof parsed.elevenLabsApiKey === 'string'
            ? parsed.elevenLabsApiKey.trim()
            : '',
      geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '',
    };
  } catch {
    return { ...EMPTY_KEYS };
  }
}

function persistLocalApiKeys(next: ClientApiKeys): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent<ClientApiKeys>(KEYS_UPDATED_EVENT, { detail: next }));
}

export function saveClientApiKeys(patch: Partial<ClientApiKeys>, syncToServer = true): ClientApiKeys {
  const current = loadClientApiKeys();
  const next: ClientApiKeys = {
    elevenlabsApiKey:
      patch.elevenlabsApiKey !== undefined
        ? patch.elevenlabsApiKey.trim()
        : current.elevenlabsApiKey,
    geminiApiKey:
      patch.geminiApiKey !== undefined ? patch.geminiApiKey.trim() : current.geminiApiKey,
  };
  persistLocalApiKeys(next);

  if (syncToServer && typeof fetch === 'function') {
    const serverPatch: Record<string, string> = {};
    if (patch.elevenlabsApiKey !== undefined) {
      serverPatch.elevenLabsApiKey = next.elevenlabsApiKey;
    }
    if (patch.geminiApiKey !== undefined) {
      serverPatch.geminiApiKey = next.geminiApiKey;
    }
    if (Object.keys(serverPatch).length > 0) {
      void fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPatch),
      }).catch(() => undefined);
    }
  }

  return next;
}

export async function hydrateClientApiKeysFromServer(): Promise<ClientApiKeys> {
  const local = loadClientApiKeys();
  if (typeof fetch !== 'function') return local;
  try {
    const res = await fetch('/api/settings/api-keys');
    if (!res.ok) return local;
    const data = (await res.json()) as {
      elevenLabsApiKey?: string;
      geminiApiKey?: string;
    };
    const merged: ClientApiKeys = {
      elevenlabsApiKey: local.elevenlabsApiKey || String(data.elevenLabsApiKey || '').trim(),
      geminiApiKey: local.geminiApiKey || String(data.geminiApiKey || '').trim(),
    };
    if (
      merged.elevenlabsApiKey !== local.elevenlabsApiKey ||
      merged.geminiApiKey !== local.geminiApiKey
    ) {
      persistLocalApiKeys(merged);
    }
    return merged;
  } catch {
    return local;
  }
}

export function buildApiKeyHeaders(baseHeaders: Record<string, string> = {}): Record<string, string> {
  const keys = loadClientApiKeys();
  const headers: Record<string, string> = { ...baseHeaders };
  if (keys.elevenlabsApiKey) {
    headers['x-elevenlabs-api-key'] = keys.elevenlabsApiKey;
  }
  if (keys.geminiApiKey) {
    headers['x-gemini-api-key'] = keys.geminiApiKey;
  }
  return headers;
}

export function useClientApiKeys(): {
  keys: ClientApiKeys;
  saveKeys: (patch: Partial<ClientApiKeys>) => ClientApiKeys;
} {
  const [keys, setKeys] = useState<ClientApiKeys>(() => loadClientApiKeys());

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<ClientApiKeys>).detail;
      setKeys(detail ?? loadClientApiKeys());
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY) {
        setKeys(loadClientApiKeys());
      }
    };
    window.addEventListener(KEYS_UPDATED_EVENT, onUpdated);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(KEYS_UPDATED_EVENT, onUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const saveKeys = useCallback((patch: Partial<ClientApiKeys>) => {
    const next = saveClientApiKeys(patch, true);
    setKeys(next);
    return next;
  }, []);

  return { keys, saveKeys };
}
