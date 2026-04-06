import { createRouter, createHashHistory } from "@tanstack/react-router"
import { rootRoute } from "./routes/__root"
import { indexRoute } from "./routes/index"
import { positionRoute } from "./routes/position.$assetId"
import { settingsRoute } from "./routes/settings"

const routeTree = rootRoute.addChildren([indexRoute, positionRoute, settingsRoute])

const hashHistory = createHashHistory()

export const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: "intent",
  context: {
    queryClient: undefined!,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
