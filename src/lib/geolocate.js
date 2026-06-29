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
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000, // a 5-min-old fix is fine for a city name
    });
  });
}

// Pick the most specific human-friendly place name from a Nominatim address.
function placeNameFromAddress(address = {}) {
  const place =
    address.city ||
    address.town ||
    address.village ||
    address.neighbourhood ||
    address.suburb ||
    address.municipality ||
    address.county ||
    null;
  const region = address.state || address.country || null;
  if (!place) return region;
  if (region && region !== place) return `${place}, ${region}`;
  return place;
}

/* Request location permission (browser handles the prompt), then resolve a
   city / neighbourhood name. Returns the name string, or null if anything
   goes wrong (denied, offline, no match). Never returns coordinates. */
export async function captureLocationName() {
  const pos = await getPosition();
  // Destructure into locals; these never leave this function.
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  const url =
    "https://nominatim.openstreetmap.org/reverse?format=json&zoom=14" +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Reverse geocode failed");
  const data = await res.json();
  const name = placeNameFromAddress(data.address || {});
  return name || null;
}
