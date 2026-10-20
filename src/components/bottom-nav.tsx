"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Watch, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Today", icon: Clock, match: (p: string) => p === "/" || p.startsWith("/day") },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p: string) => p.startsWith("/calendar") },
  { href: "/collection", label: "Collection", icon: Watch, match: (p: string) => p.startsWith("/collection") || p.startsWith("/watch") },
  { href: "/stats", label: "Stats", icon: BarChart3, match: (p: string) => p.startsWith("/stats") },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
