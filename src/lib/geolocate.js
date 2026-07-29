/* ============================================================
   Geolocation → place name (+ coarse coordinates)
   ------------------------------------------------------------
   Captures the browser's location ONCE and reverse-geocodes it to a
   human place name via the free OpenStreetMap Nominatim API.

   PRIVACY NOTE — this module used to return the name ONLY and never
   surfaced coordinates. The journal map needs to plot entries, which
   is impossible without them, so `captureLocation` now also returns a
   position. Two deliberate limits keep that honest:

     • coordinates are ROUNDED to ~4 decimals (about 11 m) — enough to
       pin the shop you were in, not the room you were in;
     • `captureLocationName` still exists and still returns just the
       string, so any caller that doesn't need a position can't
       accidentally start storing one.

   Everything fails silently (returns null / throws a generic error
   the caller swallows): location is always optional.
   ============================================================ */

/** ~11 m of precision: a venue, not a doorway. */
export function coarse(value) {
  return Math.round(Number(value) * 1e4) / 1e4;
}

// Get the current position as a promise (with a sane timeout).
function getPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      // Naming the actual place you're standing in ("Costco") needs a real
      // fix — a coarse one lands you somewhere in the neighbourhood, which is
      // only ever good enough for a city name.
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60 * 1000,
    });
  });
}

// The settlement a place sits in — the second half of "Costco, Brooklyn".
function areaFromAddress(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.suburb ||
    address.neighbourhood ||
    address.municipality ||
    address.county ||
    null
  );
}

/* The named venue you're actually standing in, if there is one.

   Nominatim puts a POI's own name at the top level (`name`) once the zoom is
   fine enough to resolve a building. The address keys are the fallback: a
   shop, amenity or office often carries the brand even when `name` doesn't. */
function venueFromResult(data = {}) {
  const address = data.address || {};
  const venue =
    data.name ||
    address.shop ||
    address.amenity ||
    address.office ||
    address.leisure ||
    address.tourism ||
    address.building ||
    null;
  // A "venue" that's really just the street isn't worth naming.
  if (!venue || venue === address.road) return null;
  return venue;
}

/* Build the display name, most specific part first.

   "Costco, Brooklyn" beats "Brooklyn", and "Brooklyn, New York" beats
   "Brooklyn" — but never repeat a name ("Brooklyn, Brooklyn"). */
export function placeNameFromResult(data = {}) {
  const address = data.address || {};
  const area = areaFromAddress(address);
  const region = address.state || address.country || null;
  const venue = venueFromResult(data);

  const parts = [];
  if (venue) parts.push(venue);
  if (area && area !== venue) parts.push(area);
  // Only reach for the region when there's nothing more specific, so a venue
  // doesn't drag a whole "Costco, Brooklyn, New York" tail behind it.
  if (!parts.length && region) parts.push(region);
  else if (parts.length === 1 && !venue && region && region !== area) {
    parts.push(region);
  }
  return parts.join(", ") || null;
}

/* Request location permission (browser handles the prompt), then resolve the
   place. Returns { name, lat, lon } with coordinates rounded to ~11 m, or
   null if anything goes wrong (denied, offline, no match). */
export async function captureLocation() {
  const pos = await getPosition();
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // zoom=18 resolves an individual building/POI rather than a district, which
  // is what turns "Brooklyn" into "Costco, Brooklyn".
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1" +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Reverse geocode failed");
  const data = await res.json();
  const name = placeNameFromResult(data);
  if (!name) return null;
  return { name, lat: coarse(lat), lon: coarse(lon) };
}

/* Name-only variant. Kept so callers that have no business holding a position
   cannot start storing one by accident. */
export async function captureLocationName() {
  const place = await captureLocation();
  return place?.name || null;
}

/* Look a place name back up to coordinates.

   Entries written before entries stored a position have a name and nothing
   else, so they can never appear on the map. This is the way back: geocode
   what was recorded ("Costco Wholesale, Brooklyn", or just "Brooklyn") and
   put the entry roughly where it belongs. Coarse by nature — a city name maps
   to the city's centre, which is exactly the resolution that name deserves.

   Returns { lat, lon } or null. Never throws. */
export async function geocodePlaceName(name) {
  const query = String(name || "").trim();
  if (!query) return null;
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const rows = await res.json();
    const hit = Array.isArray(rows) ? rows[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: coarse(lat), lon: coarse(lon) };
  } catch {
    return null;
  }
}
