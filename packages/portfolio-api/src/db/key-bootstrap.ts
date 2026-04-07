/**
 * Returns the DB encryption key from the DB_ENCRYPTION_KEY env var.
 * In production, Tauri (lib.rs) retrieves/generates the key from the OS keychain
 * and passes it here before the sidecar starts. For dev/CI, set DB_ENCRYPTION_KEY manually.
 */
export async function bootstrapEncryptionKey(): Promise<string> {
  const key = process.env["DB_ENCRYPTION_KEY"];
  if (!key) {
    throw new Error(
      "DB_ENCRYPTION_KEY is not set. In production this is provided by Tauri. " +
      "For local dev, set it manually: export DB_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    );
  }
  return key;
}
