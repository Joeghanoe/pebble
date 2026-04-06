import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { SidebarTrigger } from "./ui/sidebar"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

export function SiteHeader({
  children,
  name,
}: {
  children?: React.ReactNode
  name?: string
}) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b py-3 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="font-heading text-base font-medium capitalize">
          {name}
        </h1>
      </div>
      <div className="flex flex-row items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="icon"
        className="mr-6 h-8 w-8"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  )
}
