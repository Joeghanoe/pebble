import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { PreferencesEffects } from "@/lib/preferences";
import { AccessGate } from "@/components/AccessGate";
import { Toaster } from "@/components/ui/sonner";
import { router } from "./router";
import { queryClient } from "@/lib/queryClient";
import { OpenAPI } from "@/client";

// The SPA and the API are served from the same origin: oauth2-proxy routes /api/* to the
// API and everything else to nginx. So the base is always relative, and the session
// cookie the proxy set travels with each request on its own.
//
// It used to point at http://127.0.0.1:1430 in a production build, which was the Tauri
// sidecar. There is no sidecar any more — the desktop app is a thin client over this
// same deployment.
OpenAPI.BASE = "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesEffects />
      <AccessGate>
        <RouterProvider router={router} context={{ queryClient }} />
      </AccessGate>
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
