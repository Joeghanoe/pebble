import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { RouterProvider } from "@tanstack/react-router"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { initApiBase } from "@/lib/api"
import { router } from "./router"
import { queryClient } from "@/lib/queryClient"

initApiBase().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <RouterProvider router={router} context={{ queryClient }} />
      </ThemeProvider>
    </StrictMode>
  )
})
