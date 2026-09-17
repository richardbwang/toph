"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 5000;

/**
 * Keeps every page current without websockets. While the tab is visible, ask
 * `/api/pulse` every 5 s for the timestamp of the farm's newest log change
 * and re-run the Server Components only when it moved — so a log filed from
 * a phone appears on the manager's dashboard on its own, and a review made
 * by a colleague shows up too. `router.refresh()` keeps client state (an
 * expanded row, a half-typed tag, a playing clip) intact; a hidden tab polls
 * nothing, so an idle dashboard costs nothing.
 */
export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const active = !pathname.startsWith("/record"); // the recorder has its own thing going on

  useEffect(() => {
    if (!active) return;
    let last: string | null = null; // first poll only sets the baseline
    let stopped = false;
    let inflight = false;

    const poll = async () => {
      if (stopped || inflight || document.visibilityState !== "visible") return;
      inflight = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (last !== null && v !== last) router.refresh();
        last = v;
      } catch {
        /* offline or mid-navigation — try again next tick */
      } finally {
        inflight = false;
      }
    };

    void poll();
    const id = setInterval(poll, INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [active, router]);

  return null;
}
