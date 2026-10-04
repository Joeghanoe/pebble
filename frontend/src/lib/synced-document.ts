// src/lib/synced-document.ts
import * as React from "react";

/**
 * A settings document kept in the API and cached on this machine.
 *
 * Reads are synchronous: the UI renders from `current`, which is seeded from the
 * localStorage cache on load so the theme and table density are right on first
 * paint, before any request returns. The server copy is authoritative and
 * replaces the cache once it arrives (`hydrate`).
 *
 * Writes land locally at once and reach the server debounced, as the whole
 * document. Until the server confirms a write, the document is "pending", and a
 * pending local copy beats whatever the server returns — otherwise a refetch
 * racing a save would snap the control back. The pending flag lives in storage
 * too, so an edit made just before the tab closed is pushed on the next load
 * rather than overwritten by the older server copy.
 *
 * Conflicts between devices resolve as last write wins. There is one owner, and
 * two devices editing the same setting in the same second is not a case worth a
 * merge strategy.
 */

export type SyncStatus = "idle" | "saving" | "error";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncedDocumentOptions<T> {
  readonly name: string;
  /** The localStorage key the cache lives under. Unchanged from before the sync. */
  readonly storageKey: string;
  readonly defaults: T;
  /** Coerces a stored or fetched value into a full document, filling in defaults. */
  readonly normalize: (raw: unknown) => T;
  /** Stores the whole document on the server. */
  readonly push: (value: T) => Promise<unknown>;
  readonly storage?: KeyValueStorage | null;
  readonly debounceMs?: number;
  /** Called once per failed push; the push itself is retried. */
  readonly onError?: (error: unknown) => void;
}

export interface SyncedDocument<T> {
  get(): T;
  set(next: T): void;
  /** Adopts the server's copy. `null` means the server has never stored one. */
  hydrate(remote: unknown): void;
  /** Re-reads the cache, for a change another tab made. */
  reloadFromStorage(): void;
  /** Sends a pending write now instead of after the debounce. */
  flush(): Promise<void>;
  isPending(): boolean;
  /** Saving while a write is pending, error once a push has failed, idle otherwise. */
  status(): SyncStatus;
  subscribe(listener: () => void): () => void;
  readonly storageKey: string;
}

const RETRY_MAX_MS = 60_000;

export function createSyncedDocument<T>(
  options: SyncedDocumentOptions<T>,
): SyncedDocument<T> {
  const {
    storageKey,
    defaults,
    normalize,
    push,
    debounceMs = 600,
    onError,
  } = options;
  const storage = options.storage ?? null;
  const pendingKey = `${storageKey}.pending`;

  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let failures = 0;

  function readCache(): { value: T; stored: boolean } {
    try {
      const raw = storage?.getItem(storageKey);
      if (raw) {
        return { value: normalize(JSON.parse(raw)), stored: true };
      }
    } catch {
      // Unparseable cache: fall through to the defaults.
    }
    return { value: defaults, stored: false };
  }

  function readPending(): boolean {
    try {
      return storage?.getItem(pendingKey) === "1";
    } catch {
      return false;
    }
  }

  const initial = readCache();
  let current = initial.value;
  let hasLocalCopy = initial.stored;
  let pending = readPending();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function writeCache() {
    try {
      storage?.setItem(storageKey, JSON.stringify(current));
      if (pending) {
        storage?.setItem(pendingKey, "1");
      } else {
        storage?.removeItem(pendingKey);
      }
    } catch {
      // Storage blocked: the session still works, and the server still gets it.
    }
  }

  function schedule(delay: number) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  }

  async function send(): Promise<void> {
    const sent = current;
    try {
      await push(sent);
      failures = 0;
      // Edited again while this was in flight: that edit is still pending and
      // has its own push scheduled.
      if (current === sent) {
        pending = false;
        writeCache();
      }
      emit();
    } catch (error) {
      failures += 1;
      if (failures === 1) {
        onError?.(error);
        emit();
      }
      schedule(Math.min(RETRY_MAX_MS, 2_000 * 2 ** (failures - 1)));
    }
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // One request at a time, so an older document never lands after a newer one.
    while (inFlight) {
      await inFlight;
    }
    if (!pending) {
      return;
    }
    inFlight = send().finally(() => {
      inFlight = null;
    });
    await inFlight;
  }

  function set(next: T) {
    current = next;
    hasLocalCopy = true;
    pending = true;
    writeCache();
    emit();
    schedule(debounceMs);
  }

  function hydrate(remote: unknown) {
    if (pending) {
      // This device has an edit the server has not seen. Send it rather than
      // let the older server copy replace it.
      if (!timer && !inFlight) {
        void flush();
      }
      return;
    }
    if (remote === null || remote === undefined) {
      // The server has never stored this document. A device that already has
      // settings from before the sync seeds it; a fresh one leaves the defaults
      // implicit rather than writing them.
      if (hasLocalCopy) {
        pending = true;
        writeCache();
        void flush();
      }
      return;
    }
    const next = normalize(remote);
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return;
    }
    current = next;
    hasLocalCopy = true;
    writeCache();
    emit();
  }

  function reloadFromStorage() {
    const cached = readCache();
    current = cached.value;
    hasLocalCopy = cached.stored;
    // The other tab owns the push for its own edit.
    emit();
  }

  return {
    get: () => current,
    set,
    hydrate,
    reloadFromStorage,
    flush,
    isPending: () => pending,
    status: () => (!pending ? "idle" : failures > 0 ? "error" : "saving"),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    storageKey,
  };
}

export function useSyncedDocument<T>(
  document: SyncedDocument<T>,
  serverDefault: T,
): T {
  return React.useSyncExternalStore(
    document.subscribe,
    document.get,
    () => serverDefault,
  );
}

/** localStorage when it exists and is reachable, null otherwise. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
