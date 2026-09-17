"use client";

import {
  ArrowLeftRight,
  AudioLines,
  CalendarDays,
  ChartLine,
  ClipboardCheck,
  FileText,
  Gauge,
  LifeBuoy,
  LogOut,
  Mail,
  Map as MapIcon,
  PanelLeftClose,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logout, switchUser } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";

type NavItem = { label: string; href: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: ChartLine },
      { label: "Activity Logs", href: "/activity-logs", icon: AudioLines },
      { label: "Map", href: "/map", icon: MapIcon },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Audit Manager", href: "/audit", icon: ClipboardCheck },
      { label: "Reports", href: "/reports", icon: FileText },
      { label: "Schedule", href: "/schedule", icon: CalendarDays },
    ],
  },
  {
    title: "Team Management",
    items: [
      { label: "Employees", href: "/employees", icon: Users },
      { label: "Performance", href: "/performance", icon: Gauge },
      { label: "Messages", href: "/messages", icon: Mail },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Support", href: "/support", icon: LifeBuoy },
    ],
  },
];

export function Sidebar({ user, dashboardBadge }: { user: SessionUser; dashboardBadge: number }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <aside className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-surface px-3 pt-4 pb-3">
      {/* Farm / account */}
      <div className="flex items-center gap-3 px-2">
        <Avatar name={user.farm.name} src={user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-4 text-ink">{user.farm.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-muted">
            <Sparkles size={12} strokeWidth={2} aria-hidden />
            <span>{user.role === "ADMIN" ? "Admin" : "Worker"}</span>
          </div>
        </div>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-5 flex-1">
        {NAV.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-2">{section.title}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:font-medium aria-[current=page]:text-ink"
                    >
                      <Icon size={15} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === "/dashboard" && dashboardBadge > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-green px-1 text-[10px] font-semibold leading-none text-white">
                          {dashboardBadge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Session */}
      <div className="space-y-0.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => switchUser())}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-hover disabled:opacity-60"
        >
          <ArrowLeftRight size={15} strokeWidth={1.75} aria-hidden />
          Switch User
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => logout())}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-hover disabled:opacity-60"
        >
          <LogOut size={15} strokeWidth={1.75} aria-hidden />
          Log Out
        </button>
      </div>
    </aside>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-green-soft text-[12px] font-semibold text-green-ink">
      {name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
