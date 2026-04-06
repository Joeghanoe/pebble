import { QueryClientProvider } from "@tanstack/react-query"
import { LayoutDashboard, Settings2, TrendingUp } from "lucide-react"
import { Dashboard } from "@/frontend/screens/Dashboard"
import { PositionDetail } from "@/frontend/screens/PositionDetail"
import { Settings } from "@/frontend/screens/Settings"
import { PositionsMenu } from "@/frontend/components/PositionsMenu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useRoute } from "@/hooks/use-route"
import { queryClient } from "@/lib/queryClient"

export function App() {
  const { route, navigate } = useRoute()

  const topNavItems = [
    {
      label: "Dashboard",
      path: "/",
      icon: LayoutDashboard,
      active: route.name === "dashboard",
    },
  ]

  const currentAssetId = route.name === "position" ? route.id : null

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <Sidebar collapsible="offcanvas" variant="inset">
          <SidebarHeader className="h-14 justify-center border-sidebar-border px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <TrendingUp size={14} />
              </div>
              <span className="text-sm text-sidebar-foreground">
                Portfolio Tracker
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {/* Top-level pages */}
            <SidebarGroup>
              <SidebarGroupLabel>Overview</SidebarGroupLabel>
              <SidebarMenu>
                {topNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={item.active}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>

            {/* Collapsible positions list */}
            <SidebarGroup>
              <SidebarGroupLabel>Positions</SidebarGroupLabel>
              <SidebarMenu>
                <PositionsMenu
                  currentAssetId={currentAssetId}
                  onNavigate={navigate}
                />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-sidebar-border pb-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={route.name === "settings"}
                  onClick={() => navigate("/settings")}
                >
                  <Settings2 size={16} />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          {route.name === "dashboard" && <Dashboard onNavigate={navigate} />}
          {route.name === "position" && (
            <PositionDetail assetId={route.id} onBack={() => navigate("/")} />
          )}
          {route.name === "settings" && <Settings />}
        </SidebarInset>
      </SidebarProvider>
    </QueryClientProvider>
  )
}

export default App
