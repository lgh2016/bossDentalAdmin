import { Bell, Moon, Search, Sun, Menu, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";

export default function Header({ onMenuClick }) {
  const { theme, toggle } = useTheme();
  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 h-16 border-b border-border bg-background/70 backdrop-blur-xl"
    >
      <div className="h-full flex items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            data-testid="open-sidebar"
          >
            <Menu size={18} />
          </Button>
          <div className="relative w-full max-w-md hidden md:block">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              data-testid="global-search-input"
              placeholder="Buscar pacientes, citas, pagos…"
              className="pl-9 pr-12 h-9 bg-secondary/50 border-border focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Command size={10} /> K
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            data-testid="theme-toggle"
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="size-9"
            title="Cambiar tema"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <Button
            data-testid="notifications-button"
            variant="ghost"
            size="icon"
            className="size-9 relative"
            title="Notificaciones"
          >
            <Bell size={16} />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" />
          </Button>
        </div>
      </div>
    </header>
  );
}
