import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { assetPlugin } from "./routes/assets";
import { exchangePlugin } from "./routes/exchanges";
import { transactionPlugin } from "./routes/transactions";
import { positionPlugin } from "./routes/positions";
import { pricePlugin } from "./routes/prices";
import { netWorthPlugin } from "./routes/net-worth";
import { exportPlugin } from "./routes/export";
import { secretPlugin } from "./routes/secrets";

export function createApp() {
  return new Elysia()
    .use(cors())
    .use(assetPlugin)
    .use(exchangePlugin)
    .use(transactionPlugin)
    .use(positionPlugin)
    .use(pricePlugin)
    .use(netWorthPlugin)
    .use(exportPlugin)
    .use(secretPlugin);
}
