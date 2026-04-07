import { Elysia, t } from "elysia";
import { resetPriceService } from "../services/price-service-factory";

const SERVICE = "com.pebble.desktop";

async function keytarSet(name: string, value: string): Promise<void> {
  const { default: keytar } = await import("keytar");
  await keytar.setPassword(SERVICE, name, value);
}

async function keytarDelete(name: string): Promise<void> {
  const { default: keytar } = await import("keytar");
  await keytar.deletePassword(SERVICE, name);
}

export const secretPlugin = new Elysia({ prefix: "/api/secrets" })
  .post("/:name", async ({ params, body }) => {
    const name = params.name;
    const { value } = body;
    try {
      await keytarSet(name, value);
    } catch {
      // Fallback: keytar not available in plain dev mode
    }
    process.env[`SECRET_${name.toUpperCase().replace(/-/g, "_")}`] = value;
    if (name === "coingecko-api-key") {
      process.env["COINGECKO_API_KEY"] = value;
      resetPriceService();
    }
    return { ok: true };
  }, {
    body: t.Object({
      value: t.String(),
    })
  })
  .delete("/:name", async ({ params }) => {
    const name = params.name;
    try { await keytarDelete(name); } catch { /* ignore */ }
    delete process.env[`SECRET_${name.toUpperCase().replace(/-/g, "_")}`];
    if (name === "coingecko-api-key") {
      delete process.env["COINGECKO_API_KEY"];
      resetPriceService();
    }
    return { ok: true };
  });
