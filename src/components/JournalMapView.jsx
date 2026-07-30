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
import { geocodePlaceName } from "../lib/geolocate.js";

/* JournalMapView — where you've been writing.

   Leaflet with OpenStreetMap tiles: no API key, no billing, and no third-party
   script (Apple's and Google's SDKs are both blocked by the app's
   script-src 'self' policy anyway). Tiles are the only external request, and
   the CSP allows exactly that one host.

   Bubbles are drawn from our own clustering (lib/journalMap.js) rather than a
   plugin, so they restyle with the app and the counts stay unit-tested. They
   re-cluster on every zoom, which is what makes a bubble of 12 split into
   three of 4 as you move in. */

/* CARTO's Positron / Dark Matter basemaps rather than raw OpenStreetMap tiles.

   Standard OSM tiles are a cartographer's map — every road name, shop and
   footpath at full saturation — which fights the bubbles drawn on top and only
   exists in light. These are deliberately muted, and the pair means the map can
   actually follow the app's theme instead of glaring white in dark mode.
   Still OSM data, still no key and no billing. */
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; ' +
  '<a href="https://carto.com/attributions">CARTO</a>';

/** The app's resolved light/dark, so the map matches the page it sits on. */
function currentMode() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Bubble size grows with the count, but sub-linearly so 100 isn't a blob. */
function bubbleSize(count) {
  return Math.round(28 + Math.min(26, Math.sqrt(count) * 7));
}

/* Declared at module scope, not inside the view: a component created during
   render is a brand-new type every pass, so React remounts it and it loses its
   state (here, the running progress count). */
function BackfillButton({ busy, done, total, onRun, disabled }) {
  return (
    <button
      type="button"
      className="btn ghost sm"
      style={{ marginTop: 10 }}
      onClick={onRun}
      disabled={busy || disabled}
    >
      {busy
        ? `Looking up… ${done}/${total}`
        : `Put ${total} older ${total === 1 ? "entry" : "entries"} on the map`}
    </button>
  );
}

export default function JournalMapView({ journal = [], onOpenEntry, updateJournalEntry }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);
  const [zoom, setZoom] = useState(3);
  const [ready, setReady] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(0);

  /* Entries recorded before positions were stored: a place NAME and nothing
     else, so they can never appear. Their names can be looked back up. */
  const pending = useMemo(
    () =>
      (journal || []).filter(
        (e) => e?.location && !(Number.isFinite(e?.geo?.lat) && Number.isFinite(e?.geo?.lon))
      ),
    [journal]
  );
  const backfillable = pending.length;

  const runBackfill = async () => {
    if (backfilling || !updateJournalEntry) return;
    setBackfilling(true);
    setBackfillDone(0);
    // One at a time, a second apart: Nominatim's usage policy asks for at most
    // one request per second, and this is their service being borrowed.
    for (const entry of pending) {
      const geo = await geocodePlaceName(entry.location);
      if (geo) updateJournalEntry(entry.id, { geo });
      setBackfillDone((n) => n + 1);
      await new Promise((r) => setTimeout(r, 1100));
    }
    setBackfilling(false);
  };

  const points = useMemo(() => entriesWithGeo(journal), [journal]);
  const stats = useMemo(() => placeStats(points), [points]);
  const clusters = useMemo(() => clusterPoints(points, zoom), [points, zoom]);

  // Create the map once there is somewhere to put it.
  //
  // Keyed on `hasPoints`, not []: with no places the component returns the
  // empty state early, so the canvas doesn't exist and this effect would bail
  // with nothing to attach to — and, running only once, never try again. The
  // map then stayed blank forever after the first location was added (or after
  // backfilling older entries), which is exactly when it should appear.
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (!hasPoints) return undefined;
    if (!hostRef.current || mapRef.current) return undefined;
    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
      // The page already scrolls; grabbing the wheel inside it is hostile.
      scrollWheelZoom: false,
    });
    tileRef.current = L.tileLayer(
      currentMode() === "dark" ? TILE_DARK : TILE_LIGHT,
      { attribution: ATTRIBUTION, maxZoom: 19 }
    ).addTo(map);

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
  }, [hasPoints]);

  // Follow the app's theme while the map is open — switching Ligand to dark
  // shouldn't leave a glaring white rectangle sitting in the page.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (!tileRef.current) return;
      tileRef.current.setUrl(currentMode() === "dark" ? TILE_DARK : TILE_LIGHT);
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    sync();
    return () => observer.disconnect();
  }, [hasPoints]);

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
            Add a location to a journal entry and it'll appear here.
            {backfillable > 0 && (
              <>
                {" "}
                {backfillable} older {backfillable === 1 ? "entry has" : "entries have"}
                {" "}a place name but no coordinates — they can be looked up.
              </>
            )}
          </div>
          {backfillable > 0 && (
            <BackfillButton busy={backfilling} done={backfillDone} total={backfillable} onRun={runBackfill} disabled={!updateJournalEntry} />
          )}
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
        {/* Older entries kept a place name but no coordinates; offer to look
           them up rather than silently leaving them off the map. */}
        {backfillable > 0 && (
          <div className="jmap-backfill">
            <div className="jmap-top-lbl">Not on the map</div>
            <div className="jmap-backfill-sub">
              {backfillable} {backfillable === 1 ? "entry has" : "entries have"} a
              place name from before coordinates were saved.
            </div>
            <BackfillButton busy={backfilling} done={backfillDone} total={backfillable} onRun={runBackfill} disabled={!updateJournalEntry} />
          </div>
        )}
      </div>
    </div>
  );
}
