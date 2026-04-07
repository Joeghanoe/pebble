import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import "./index.css"
import { RouterProvider } from "@tanstack/react-router"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { BiometricGate } from "@/components/BiometricGate"
import { router } from "./router"
import { queryClient } from "@/lib/queryClient"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BiometricGate>
          <RouterProvider router={router} context={{ queryClient }} />
        </BiometricGate>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
