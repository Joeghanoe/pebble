import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { SidebarTrigger } from "./ui/sidebar";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function SiteHeader({
  children,
  name,
}: {
  children?: React.ReactNode;
  name?: string;
}) {
  const { theme, setTheme } = useTheme();

  return (
    // `w-full` on the title block used to push the action buttons off the right edge
    // at phone widths. The title shrinks and truncates now; the actions never do.
    <header className="flex h-(--header-height) shrink-0 items-center gap-1 border-b py-3 pr-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) sm:gap-2 sm:pr-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-2 sm:px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator
          orientation="vertical"
          className="mx-1 hidden data-[orientation=vertical]:h-4 sm:mx-2 sm:block"
        />
        <h1 className="truncate font-heading text-base font-medium capitalize">
          {name}
        </h1>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-1 sm:gap-2">
        {children}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
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
  );
}
