import { describe, expect, test } from "bun:test";
import {
  createSyncedDocument,
  type KeyValueStorage,
} from "../src/lib/synced-document";

interface Doc {
  theme: string;
  density: string;
}

const DEFAULTS: Doc = { theme: "dark", density: "dense" };
const KEY = "pebble.test";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
  return { storage, map };
}

function setup(
  initial: Record<string, string> = {},
  push?: (v: Doc) => Promise<unknown>,
) {
  const { storage, map } = memoryStorage(initial);
  const pushed: Doc[] = [];
  const doc = createSyncedDocument<Doc>({
    name: "test",
    storageKey: KEY,
    defaults: DEFAULTS,
    normalize: (raw) => ({ ...DEFAULTS, ...(raw as Partial<Doc>) }),
    storage,
    debounceMs: 5,
    push:
      push ??
      (async (value) => {
        pushed.push(value);
      }),
  });
  return { doc, map, pushed };
}

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe("synced document", () => {
  test("starts from the local cache, filled in with defaults", () => {
    const { doc } = setup({ [KEY]: JSON.stringify({ theme: "midnight" }) });
    expect(doc.get()).toEqual({ theme: "midnight", density: "dense" });
  });

  test("adopts the server copy over the cache", () => {
    const { doc, map } = setup({
      [KEY]: JSON.stringify({ theme: "midnight" }),
    });
    doc.hydrate({ theme: "system", density: "comfortable" });
    expect(doc.get()).toEqual({ theme: "system", density: "comfortable" });
    expect(JSON.parse(map.get(KEY)!)).toEqual(doc.get());
  });

  test("a write lands locally at once and reaches the server debounced", async () => {
    const { doc, pushed } = setup();
    doc.set({ ...doc.get(), theme: "midnight" });
    doc.set({ ...doc.get(), density: "comfortable" });
    expect(doc.get().theme).toBe("midnight");
    expect(doc.status()).toBe("saving");

    await tick();
    expect(pushed).toEqual([{ theme: "midnight", density: "comfortable" }]);
    expect(doc.status()).toBe("idle");
  });

  test("a pending edit is not overwritten by an older server copy", async () => {
    const { doc, pushed } = setup();
    doc.set({ ...doc.get(), theme: "midnight" });
    doc.hydrate({ theme: "dark", density: "dense" });
    expect(doc.get().theme).toBe("midnight");

    await tick();
    expect(pushed.at(-1)?.theme).toBe("midnight");
  });

  test("an edit made just before the tab closed is pushed on the next load", async () => {
    const first = setup(undefined, () => new Promise(() => {}));
    first.doc.set({ ...first.doc.get(), theme: "midnight" });
    const leftBehind = Object.fromEntries(first.map);

    const { doc, pushed } = setup(leftBehind);
    doc.hydrate({ theme: "dark", density: "dense" });
    expect(doc.get().theme).toBe("midnight");

    await tick();
    expect(pushed).toEqual([{ theme: "midnight", density: "dense" }]);
    expect(doc.isPending()).toBe(false);
  });

  test("an empty server is seeded from settings this device already had", async () => {
    const { doc, pushed } = setup({
      [KEY]: JSON.stringify({ theme: "midnight" }),
    });
    doc.hydrate(null);

    await tick();
    expect(pushed).toEqual([{ theme: "midnight", density: "dense" }]);
  });

  test("a fresh device does not write the defaults to an empty server", async () => {
    const { doc, pushed } = setup();
    doc.hydrate(null);

    await tick();
    expect(pushed).toEqual([]);
    expect(doc.get()).toEqual(DEFAULTS);
  });

  test("a failed push is reported, kept pending, and retried", async () => {
    let attempts = 0;
    const { doc } = setup(undefined, async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("offline");
      }
    });
    doc.set({ ...doc.get(), theme: "midnight" });
    await tick();
    expect(doc.status()).toBe("error");

    await doc.flush();
    expect(attempts).toBe(2);
    expect(doc.status()).toBe("idle");
  });
});
