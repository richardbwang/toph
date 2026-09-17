import { requireUser } from "@/lib/auth";
import { newLogsTodayCount } from "@/lib/queries";
import { Sidebar } from "@/components/sidebar";

/**
 * Everything under (app) requires a valid session. `requireUser()` redirects
 * anonymous visitors to /login; the proxy already did a cheap cookie check.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const badge = await newLogsTodayCount(user.farm.id, user.farm.timezone);
  return (
    <div className="flex min-h-full">
      <Sidebar user={user} dashboardBadge={badge} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
