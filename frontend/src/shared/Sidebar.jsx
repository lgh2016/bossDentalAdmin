import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NAV_BY_ROLE } from "@/constants/navigation";
import { ROLE_LABELS } from "@/constants/roles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/utils/format";
import { cn } from "@/lib/utils";

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sections = NAV_BY_ROLE[user.role] || [];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside
      data-testid="app-sidebar"
      className="h-full w-full flex flex-col bg-card/60 dark:bg-background/60 backdrop-blur-xl border-r border-border"
    >
      <div className="px-5 h-16 flex items-center gap-2 border-b border-border">
        <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Sparkles size={16} strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Boss Dental</p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Admin Suite</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      data-testid={`nav-${item.to.replace(/\//g, "")}`}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                        )
                      }
                    >
                      <Icon size={16} strokeWidth={1.7} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar className="size-9">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
          <Button
            data-testid="logout-button"
            onClick={handleLogout}
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </aside>
  );
}
