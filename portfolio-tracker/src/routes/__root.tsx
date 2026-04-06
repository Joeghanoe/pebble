import { createRootRouteWithContext, Link, Outlet, useRouterState } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { LayoutDashboard, Settings2, TrendingUp } from "lucide-react"
import { PositionsMenu } from "@/frontend/components/PositionsMenu"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"

export interface RouterContext {
  queryClient: QueryClient
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const { queryClient } = rootRoute.useRouteContext()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const isPosition = pathname.startsWith("/position/")

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <Sidebar collapsible="offcanvas" variant="inset">
          <SidebarHeader className="h-14 justify-center border-sidebar-border px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <TrendingUp size={14} />
              </div>
              <span className="text-sm text-sidebar-foreground">Portfolio Tracker</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Overview</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/"}>
                    <Link to="/" preload="intent">
                      <LayoutDashboard size={16} />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Positions</SidebarGroupLabel>
              <SidebarMenu>
                <PositionsMenu isPositionActive={isPosition} />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-sidebar-border pb-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings"}>
                  <Link to="/settings" preload="intent">
                    <Settings2 size={16} />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
