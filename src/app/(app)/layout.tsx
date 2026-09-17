import { requireUser } from "@/lib/auth";
import { newLogsTodayCount } from "@/lib/queries";
import { MobileBar, Sidebar } from "@/components/sidebar";

/**
 * Everything under (app) requires a valid session. `requireUser()` redirects
 * anonymous visitors to /login; the proxy already did a cheap cookie check.
 *
 * Layout mirrors the Figma frame: 10px page padding, a 280px sidebar card and
 * the main area side by side with a 10px gap.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const badge = await newLogsTodayCount(user.farm.id, user.farm.timezone);
  return (
    <div className="flex min-h-screen flex-col items-start gap-[var(--page-gap)] p-[var(--page-gap)] md:flex-row">
      <MobileBar user={user} />
      <Sidebar user={user} dashboardBadge={badge} />
      <main className="w-full min-w-0 flex-1 self-stretch">{children}</main>
    </div>
  );
}
