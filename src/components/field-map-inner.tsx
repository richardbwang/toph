"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression } from "leaflet";
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip } from "react-leaflet";

export type MapField = {
  id: string;
  name: string;
  crop?: string | null;
  centerLat: number;
  centerLng: number;
  boundary: GeoJSON.Polygon;
};

// Esri World Imagery: free satellite tiles, no API key, attribution required.
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

function ring(polygon: GeoJSON.Polygon): [number, number][] {
  // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
  return polygon.coordinates[0].map(([lng, lat]) => [lat, lng]);
}

export default function FieldMapInner({
  fields,
  focus,
  interactive,
  zoom = 15,
}: {
  fields: MapField[];
  focus?: MapField | null;
  interactive: boolean;
  zoom?: number;
}) {
  const all = fields.flatMap((f) => ring(f.boundary));
  const bounds: LatLngBoundsExpression | undefined = all.length ? all : undefined;
  const center: [number, number] = focus ? [focus.centerLat, focus.centerLng] : fields.length ? [fields[0].centerLat, fields[0].centerLng] : [37.8, -120.84];

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      bounds={focus ? undefined : bounds}
      boundsOptions={{ padding: [24, 24] }}
      zoomControl={interactive}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      attributionControl={interactive}
      className="h-full w-full bg-[#2f3a2f]"
    >
      <TileLayer url={SATELLITE} attribution={ATTRIBUTION} maxZoom={19} />
      {fields.map((f) => {
        const isFocus = focus?.id === f.id;
        return (
          <Polygon
            key={f.id}
            positions={ring(f.boundary)}
            pathOptions={{
              color: isFocus ? "#0065f0" : "rgba(255,255,255,0.8)",
              weight: isFocus ? 1 : 1.25,
              fillColor: isFocus ? "#0065f0" : "#ffffff",
              fillOpacity: isFocus ? 0.2 : 0.08,
            }}
          >
            {interactive && (
              <Tooltip direction="top" sticky>
                <span className="text-[12px] font-medium">{f.name}</span>
                {f.crop ? <span className="text-[11px] text-muted"> · {f.crop}</span> : null}
              </Tooltip>
            )}
          </Polygon>
        );
      })}
      {focus && (
        <>
          <CircleMarker center={[focus.centerLat, focus.centerLng]} radius={8.5} pathOptions={{ color: "#0065f0", weight: 0, fillColor: "#0065f0", fillOpacity: 0.3 }} />
          <CircleMarker center={[focus.centerLat, focus.centerLng]} radius={4} pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: "#0065f0", fillOpacity: 1 }} />
        </>
      )}
    </MapContainer>
  );
}
