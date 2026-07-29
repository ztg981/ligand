/* ============================================================
   Geolocation → place name (privacy-first)
   ------------------------------------------------------------
   Captures the browser's location ONCE, reverse-geocodes it to a
   human place name via the free OpenStreetMap Nominatim API, and
   returns ONLY that string. The raw coordinates are never returned
   or stored — they live only inside this function's scope.

   Everything fails silently (returns null / throws a generic error
   the caller swallows): location is always optional.
   ============================================================ */

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

/* Request location permission (browser handles the prompt), then resolve a
   city / neighbourhood name. Returns the name string, or null if anything
   goes wrong (denied, offline, no match). Never returns coordinates. */
export async function captureLocationName() {
  const pos = await getPosition();
  // Destructure into locals; these never leave this function.
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
  return placeNameFromResult(data) || null;
}
