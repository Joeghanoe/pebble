import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import "./index.css"
import { RouterProvider } from "@tanstack/react-router"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { initApiBase } from "@/lib/api"
import { router } from "./router"
import { queryClient } from "@/lib/queryClient"

await initApiBase()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} context={{ queryClient }} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
