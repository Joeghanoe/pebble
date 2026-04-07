import { existsSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3-multiple-ciphers";

/**
 * Encrypts an existing plaintext SQLite database in-place using SQLCipher's PRAGMA rekey.
 * Safe to call repeatedly — detects whether the file is already encrypted and skips if so.
 * If the database file does not yet exist, this is a no-op (new DBs are created encrypted).
 */
export function encryptExistingDatabase(dbPath: string, encryptionKey: string): void {
  if (!existsSync(dbPath)) return;

  // Probe without a key: succeeds on plaintext, throws on encrypted.
  let isPlaintext: boolean;
  try {
    const probe = new BetterSqlite3(dbPath);
    probe.prepare("SELECT 1 FROM sqlite_master").get();
    probe.close();
    isPlaintext = true;
  } catch {
    isPlaintext = false;
  }

  if (!isPlaintext) return;

  console.log("Encrypting existing database…");
  const db = new BetterSqlite3(dbPath);
  db.pragma(`rekey='${encryptionKey}'`);
  db.close();
  console.log("Database encrypted successfully.");
}
