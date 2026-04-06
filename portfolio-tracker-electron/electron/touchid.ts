import keytar from "keytar";
import { systemPreferences } from "electron";

const SERVICE = "com.portfolio-tracker.desktop";
const ACCOUNT_DB_KEY = "db-encryption-key";
const ACCOUNT_API_KEY_PREFIX = "api-key-";

// ─── Touch ID ─────────────────────────────────────────────────────────────────

/**
 * Prompt the user with Touch ID (or system password fallback).
 * Returns true on success, false on cancel / failure.
 */
export async function authenticateWithTouchID(reason: string): Promise<boolean> {
  // canPromptTouchID is available on macOS 10.15+
  const canUseTouchID =
    process.platform === "darwin" &&
    typeof systemPreferences.canPromptTouchID === "function" &&
    systemPreferences.canPromptTouchID();

  if (!canUseTouchID) {
    // Non-mac or Touch ID not enrolled — skip the prompt and just open
    console.warn("[touchid] Touch ID unavailable, skipping auth prompt");
    return true;
  }

  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false;
  }
}

// ─── DB encryption key ────────────────────────────────────────────────────────

/**
 * Retrieve the DB encryption key from macOS Keychain.
 * On first launch a random 64-char hex key is generated and stored.
 */
export async function getDbEncryptionKey(): Promise<string> {
  let key = await keytar.getPassword(SERVICE, ACCOUNT_DB_KEY);
  if (!key) {
    // First launch — generate and persist a strong random key
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await keytar.setPassword(SERVICE, ACCOUNT_DB_KEY, key);
    console.log("[keychain] Generated and stored new DB encryption key");
  }
  return key;
}

// ─── API keys (CoinGecko, etc.) ───────────────────────────────────────────────

export async function getApiKey(name: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, `${ACCOUNT_API_KEY_PREFIX}${name}`);
}

export async function setApiKey(name: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, `${ACCOUNT_API_KEY_PREFIX}${name}`, value);
}

export async function deleteApiKey(name: string): Promise<void> {
  await keytar.deletePassword(SERVICE, `${ACCOUNT_API_KEY_PREFIX}${name}`);
}
