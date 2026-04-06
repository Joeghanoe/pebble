import { Elysia } from "elysia";

const SERVICE = "com.portfolio-tracker.desktop";

async function keytarSet(name: string, value: string): Promise<void> {
  const { default: keytar } = await import("keytar");
  await keytar.setPassword(SERVICE, name, value);
}

async function keytarDelete(name: string): Promise<void> {
  const { default: keytar } = await import("keytar");
  await keytar.deletePassword(SERVICE, name);
}

export const secretPlugin = new Elysia({ prefix: "/api/secrets" })
  .post("/:name", async ({ params, body, set }) => {
    const name = params.name;
    const data = body as { value?: unknown };
    if (typeof data.value !== "string") { set.status = 400; return { error: "value must be a string" }; }
    try {
      await keytarSet(name, data.value);
    } catch {
      // Fallback: keytar not available in plain dev mode
    }
    process.env[`SECRET_${name.toUpperCase().replace(/-/g, "_")}`] = data.value;
    if (name === "coingecko-api-key") process.env["COINGECKO_API_KEY"] = data.value;
    return { ok: true };
  })
  .delete("/:name", async ({ params }) => {
    const name = params.name;
    try { await keytarDelete(name); } catch { /* ignore */ }
    delete process.env[`SECRET_${name.toUpperCase().replace(/-/g, "_")}`];
    if (name === "coingecko-api-key") delete process.env["COINGECKO_API_KEY"];
    return { ok: true };
  });
