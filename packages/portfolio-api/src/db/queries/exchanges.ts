import { db } from "../runner";
import type { Exchange } from "../../types/db";

export function listExchanges(): Exchange[] {
  return db.query<Exchange, []>("SELECT id, name, type FROM exchanges ORDER BY name ASC").all();
}

export function getExchangeById(id: number): Exchange | null {
  return db.query<Exchange, [number]>("SELECT id, name, type FROM exchanges WHERE id = ?").get(id);
}

export function createExchange(name: string, type: Exchange["type"]): Exchange {
  const result = db
    .query<{ id: number }, [string, string]>(
      "INSERT INTO exchanges (name, type) VALUES (?, ?) RETURNING id"
    )
    .get(name, type);
  if (!result) throw new Error("Failed to create exchange");
  return { id: result.id, name, type };
}

export function deleteExchange(id: number): void {
  db.query("DELETE FROM exchanges WHERE id = ?").run(id);
}
