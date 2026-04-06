/**
 * Bundles the Electron main process + embedded API server for packaging.
 *
 * Uses esbuild so that:
 *  • TypeScript is compiled
 *  • `bun:sqlite` is aliased to the SQLCipher-compatible shim
 *  • Native modules (keytar, better-sqlite3-multiple-ciphers) are left external
 *    so electron-builder can copy their prebuilt binaries
 */

import { build } from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dir);

async function buildElectron() {
  // ── Main process (includes embedded server) ──────────────────────────────
  await build({
    entryPoints: [path.join(root, "electron/main.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: path.join(root, "dist-electron/main.mjs"),
    external: [
      "electron",
      "keytar",
      "better-sqlite3-multiple-ciphers",
    ],
    alias: {
      // Swap bun:sqlite for the SQLCipher-compatible shim
      "bun:sqlite": path.join(root, "../portfolio-api/src/db/sqlcipher-compat.ts"),
    },
    nodePaths: [path.join(root, "../portfolio-api/node_modules")],
    // Polyfill __dirname / __filename which are not available in native ESM
    banner: {
      js: `import { fileURLToPath as __ftu } from 'url'; import { dirname as __dn } from 'path'; const __filename = __ftu(import.meta.url); const __dirname = __dn(__filename);`,
    },
    define: {
      "import.meta.dir": "__dirname",
    },
    // Embed .sql migration files as strings
    loader: { ".sql": "text" },
  });

  // ── Preload script ────────────────────────────────────────────────────────
  await build({
    entryPoints: [path.join(root, "electron/preload.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.join(root, "dist-electron/preload.cjs"),
    external: ["electron"],
  });

  console.log("✓ Electron build complete → dist-electron/");
}

await buildElectron();
