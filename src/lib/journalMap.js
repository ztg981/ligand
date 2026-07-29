/* journalMap — turning journal entries into map points, clusters and stats.

   Clustering is done here rather than by a plugin so it stays pure and
   testable, and so the bubbles can look like the rest of Ligand. The rule is
   a grid whose cells shrink as you zoom in: two entries a street apart merge
   into one bubble when you're looking at the whole country and separate when
   you're looking at the neighbourhood. That is what makes the counts feel
   "relative to the zoom" rather than fixed.

   No React, no network, no Leaflet — just geometry. */

/** Entries that can actually be placed on a map. */
export function entriesWithGeo(journal = []) {
  return (journal || [])
    .filter((e) => e && e.geo && Number.isFinite(e.geo.lat) && Number.isFinite(e.geo.lon))
    .map((e) => ({
      id: e.id,
      lat: e.geo.lat,
      lon: e.geo.lon,
      name: e.location || "Somewhere",
      createdAt: e.createdAt || null,
    }));
}

/**
 * Cell size in degrees for a zoom level.
 *
 * The web-mercator world is 2^zoom tiles across, so dividing 360° by that
 * (times a few cells per tile) gives a cell that stays a roughly constant
 * size ON SCREEN at every zoom — which is what keeps bubbles from either
 * swallowing the map when zoomed out or scattering when zoomed in.
 */
export function cellSizeDeg(zoom, cellsPerTile = 4) {
  const z = Math.max(0, Math.min(22, Number(zoom) || 0));
  return 360 / (2 ** z * cellsPerTile);
}

/**
 * Group points into clusters for a zoom level.
 *
 * Each cluster carries its member ids and a centre that is the mean of its
 * members, so a bubble sits over the places it represents rather than on an
 * arbitrary grid corner. Sorted biggest-first so the busiest place draws on
 * top when bubbles overlap.
 */
export function clusterPoints(points = [], zoom = 2, { cellsPerTile = 4 } = {}) {
  const cell = cellSizeDeg(zoom, cellsPerTile);
  const buckets = new Map();

  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lon / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.points.push(p);
    } else {
      buckets.set(key, { points: [p] });
    }
  }

  const clusters = [];
  for (const { points: members } of buckets.values()) {
    const lat = members.reduce((s, p) => s + p.lat, 0) / members.length;
    const lon = members.reduce((s, p) => s + p.lon, 0) / members.length;
    // Name the cluster after the place that appears most often in it.
    const tally = new Map();
    for (const p of members) tally.set(p.name, (tally.get(p.name) || 0) + 1);
    let label = members[0].name;
    let best = 0;
    for (const [name, n] of tally) {
      if (n > best) {
        best = n;
        label = name;
      }
    }
    clusters.push({
      lat,
      lon,
      count: members.length,
      ids: members.map((p) => p.id),
      label,
      places: tally.size,
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/** Headline numbers for the panel beside the map. */
export function placeStats(points = []) {
  const tally = new Map();
  for (const p of points) tally.set(p.name, (tally.get(p.name) || 0) + 1);
  const top = [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    total: points.length,
    distinct: tally.size,
    top: top.slice(0, 5),
  };
}

/** A [[south, west], [north, east]] box containing every point, or null. */
export function boundsOf(points = []) {
  if (!points.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}
