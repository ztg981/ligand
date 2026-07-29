import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "./Icons.jsx";
import {
  entriesWithGeo,
  clusterPoints,
  placeStats,
  boundsOf,
} from "../lib/journalMap.js";

/* JournalMapView — where you've been writing.

   Leaflet with OpenStreetMap tiles: no API key, no billing, and no third-party
   script (Apple's and Google's SDKs are both blocked by the app's
   script-src 'self' policy anyway). Tiles are the only external request, and
   the CSP allows exactly that one host.

   Bubbles are drawn from our own clustering (lib/journalMap.js) rather than a
   plugin, so they restyle with the app and the counts stay unit-tested. They
   re-cluster on every zoom, which is what makes a bubble of 12 split into
   three of 4 as you move in. */

const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Bubble size grows with the count, but sub-linearly so 100 isn't a blob. */
function bubbleSize(count) {
  return Math.round(28 + Math.min(26, Math.sqrt(count) * 7));
}

export default function JournalMapView({ journal = [], onOpenEntry }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [zoom, setZoom] = useState(3);
  const [ready, setReady] = useState(false);

  const points = useMemo(() => entriesWithGeo(journal), [journal]);
  const stats = useMemo(() => placeStats(points), [points]);
  const clusters = useMemo(() => clusterPoints(points, zoom), [points, zoom]);

  // Create the map once.
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined;
    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
      // The page already scrolls; grabbing the wheel inside it is hostile.
      scrollWheelZoom: false,
    });
    L.tileLayer(TILE_LIGHT, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

    const box = boundsOf(points);
    if (box) map.fitBounds(box, { padding: [40, 40], maxZoom: 13 });
    else map.setView([20, 0], 2);

    map.on("zoomend", () => setZoom(map.getZoom()));
    mapRef.current = map;
    setZoom(map.getZoom());
    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaflet measures the container on creation; inside a tab that was hidden
  // it can come up zero-sized and render a grey box until something resizes.
  useEffect(() => {
    if (!ready || !mapRef.current) return undefined;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [ready]);

  // Redraw bubbles whenever the clustering changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) layerRef.current.remove();
    const layer = L.layerGroup();

    for (const cluster of clusters) {
      const size = bubbleSize(cluster.count);
      const single = cluster.count === 1;
      const marker = L.marker([cluster.lat, cluster.lon], {
        icon: L.divIcon({
          className: "jmap-bubble-wrap",
          html:
            `<span class="jmap-bubble${single ? " single" : ""}" ` +
            `style="width:${size}px;height:${size}px">${cluster.count}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      });
      const where = cluster.places > 1 ? `${cluster.places} places` : cluster.label;
      marker.bindTooltip(
        `${where} · ${cluster.count} ${cluster.count === 1 ? "entry" : "entries"}`,
        { direction: "top", offset: [0, -size / 2] }
      );
      marker.on("click", () => {
        // One entry opens it; a cluster zooms in and lets it break apart.
        if (single && onOpenEntry) onOpenEntry(cluster.ids[0]);
        else map.setView([cluster.lat, cluster.lon], Math.min(19, map.getZoom() + 3));
      });
      layer.addLayer(marker);
    }

    layer.addTo(map);
    layerRef.current = layer;
  }, [clusters, onOpenEntry]);

  if (!points.length) {
    return (
      <div className="card jmap-empty">
        <span className="jmap-empty-ic"><Icon.Pin2 /></span>
        <div>
          <div className="jmap-empty-title">No places yet</div>
          <div className="jmap-empty-sub">
            Add a location to a journal entry and it'll appear here. Entries
            written before locations were saved won't have one.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jmap">
      <div className="jmap-canvas" ref={hostRef} />

      <div className="jmap-stats">
        <div className="jmap-stat">
          <span className="jmap-stat-num">{stats.total}</span>
          <span className="jmap-stat-lbl">
            {stats.total === 1 ? "placed entry" : "placed entries"}
          </span>
        </div>
        <div className="jmap-stat">
          <span className="jmap-stat-num">{stats.distinct}</span>
          <span className="jmap-stat-lbl">
            {stats.distinct === 1 ? "place" : "places"}
          </span>
        </div>
        {stats.top.length > 0 && (
          <div className="jmap-top">
            <div className="jmap-top-lbl">Most written</div>
            {stats.top.map((place) => (
              <div key={place.name} className="jmap-top-row">
                <span className="jmap-top-name">{place.name}</span>
                <span className="jmap-top-count">{place.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
