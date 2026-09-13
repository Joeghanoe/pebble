import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { getStartedRoute } from "./routes/get-started";
import { indexRoute } from "./routes/index";
import { positionRoute } from "./routes/position.$assetId";
import { settingsRoute } from "./routes/settings";

const routeTree = rootRoute.addChildren([
  indexRoute,
  getStartedRoute,
  positionRoute,
  settingsRoute,
]);

// Browser history, not hash history.
//
// Hash routing came from the Tauri webview, where there was no server to ask about a
// path. Hosted it costs two things: /#/position/3 is not a URL you can bookmark to a
// phone home screen and expect to work, and a fragment is never sent to the server, so
// oauth2-proxy cannot return you to the page you were on after a sign-in redirect.
//
// This requires the web server to serve index.html for unknown paths —
// `try_files $uri $uri/ /index.html` in infra/web.nginx.conf.template.
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  context: {
    queryClient: undefined!,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
