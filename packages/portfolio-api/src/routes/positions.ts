import { Elysia } from "elysia";
import { buildPositions } from "../services/positions";

export const positionPlugin = new Elysia({ prefix: "/api/positions" })
  .get("/", () => buildPositions());
