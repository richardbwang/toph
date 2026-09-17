"use client";

import dynamic from "next/dynamic";
import type { MapField } from "./field-map-inner";

/**
 * Leaflet touches `window` at import time, so the real map is loaded on the
 * client only. The server renders the placeholder box in its place.
 */
const FieldMapInner = dynamic(() => import("./field-map-inner"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#e9ece9]" aria-hidden />,
});

export type { MapField };

export function FieldMap(props: { fields: MapField[]; focus?: MapField | null; interactive: boolean; zoom?: number }) {
  return <FieldMapInner {...props} />;
}
