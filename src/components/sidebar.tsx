"use client";

import {
  ArrowRightLeft,
  AudioLines,
  BookCheck,
  Calendar,
  ChartLine,
  ChartPie,
  Cog,
  Files,
  Handshake,
  Inbox,
  LogOut,
  Mail,
  Map as MapIcon,
  Users,
  UserStar,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logout, switchUser } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";

type NavItem = { label: string; href: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

// Icons are the same Lucide glyphs the Figma file uses (user-star, inbox,
// chart-line, audio-lines, map, book-check, files, calendar, users, chart-pie,
// mail, cog, handshake, arrow-right-left, log-out).
export const NAV: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: ChartLine },
      { label: "Activity Logs", href: "/activity-logs", icon: AudioLines },
      { label: "Map", href: "/map", icon: MapIcon },
    ],
  },
  {
    title: "COMPLIANCE",
    items: [
      { label: "Audit Manager", href: "/audit", icon: BookCheck },
      { label: "Reports", href: "/reports", icon: Files },
      { label: "Schedule", href: "/schedule", icon: Calendar },
    ],
  },
  {
    title: "TEAM MANAGEMENT",
    items: [
      { label: "Employees", href: "/employees", icon: Users },
      { label: "Performance", href: "/performance", icon: ChartPie },
      { label: "Messages", href: "/messages", icon: Mail },
    ],
  },
  {
    title: "OTHER",
    items: [
      { label: "Settings", href: "/settings", icon: Cog },
      { label: "Support", href: "/support", icon: Handshake },
    ],
  },
];

const navButton =
  "flex w-full items-center gap-[14px] rounded-[4px] px-[14px] py-[10px] text-left text-[14px] leading-[normal] text-ink hover:bg-nav-active";

export function Sidebar({ user, dashboardBadge }: { user: SessionUser; dashboardBadge: number }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <aside className="sticky top-[var(--page-gap)] flex h-[calc(100vh-2*var(--page-gap))] w-[var(--sidebar-w)] shrink-0 flex-col gap-[10px] overflow-y-auto rounded-[16px] border border-line-4 bg-surface p-[10px]">
      {/* Farm / account */}
      <div className="flex items-center justify-between rounded-[4px] py-[4px] pr-[14px] pl-[4px]">
        <div className="flex items-center gap-[10px]">
          <Avatar name={user.farm.name} src={user.avatarUrl} />
          <div className="flex flex-col items-start gap-[8px]">
            <span className="text-trim text-[14px] leading-[normal] font-medium whitespace-nowrap text-ink">{user.farm.name}</span>
            <span className="flex items-center gap-[5px]">
              <UserStar size={10} className="shrink-0 text-muted" aria-hidden />
              <span className="text-trim text-[14px] leading-[normal] font-medium whitespace-nowrap text-muted">
                {user.role === "ADMIN" ? "Admin" : "Worker"}
              </span>
            </span>
          </div>
        </div>
        <Link href="/messages" aria-label="Inbox" className="text-ink">
          <Inbox size={16} aria-hidden />
        </Link>
      </div>

      {/* Navigation — the last section grows so the session buttons sit at the bottom */}
      {NAV.map((section, i) => (
        <nav key={section.title} aria-label={section.title} className={`flex w-full flex-col items-start gap-[4px] ${i === NAV.length - 1 ? "flex-1" : ""}`}>
          <div className="flex w-full items-center px-[10px] py-[4px]">
            <span className="text-[10px] leading-[normal] font-medium whitespace-nowrap text-muted-2">{section.title}</span>
          </div>
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${navButton} justify-between aria-[current=page]:bg-nav-active`}
              >
                <span className="flex items-center gap-[14px]">
                  <Icon size={16} className="shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">{item.label}</span>
                </span>
                {item.href === "/dashboard" && dashboardBadge > 0 && (
                  <span
                    className="flex h-[14px] w-[20px] items-center justify-center rounded-[50px] border-[0.5px] border-badge-line bg-badge p-[4px] text-[10px] leading-[normal] font-medium text-white"
                    aria-label={`${dashboardBadge} new today`}
                  >
                    {dashboardBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      ))}

      {/* Session */}
      <button type="button" disabled={pending} onClick={() => startTransition(() => switchUser())} className={`${navButton} disabled:opacity-60`}>
        <ArrowRightLeft size={16} className="shrink-0" aria-hidden />
        <span className="whitespace-nowrap">Switch User</span>
      </button>
      <button type="button" disabled={pending} onClick={() => startTransition(() => logout())} className={`${navButton} disabled:opacity-60`}>
        <LogOut size={16} className="shrink-0" aria-hidden />
        <span className="whitespace-nowrap">Log Out</span>
      </button>
    </aside>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={42} height={42} className="size-[42px] shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-green-soft text-[14px] font-medium text-green-ink">
      {name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
