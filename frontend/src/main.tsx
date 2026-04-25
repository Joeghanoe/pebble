import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { BiometricGate } from "@/components/BiometricGate";
import { router } from "./router";
import { OpenAPI } from "@/client";

// In dev, Vite proxies /api → localhost:1430, so base can be empty.
// In production (Tauri sidecar), call the backend directly.
OpenAPI.BASE = import.meta.env.DEV ? "" : "http://127.0.0.1:1430";

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BiometricGate>
          <RouterProvider router={router} context={{ queryClient }}/>
        </BiometricGate>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
