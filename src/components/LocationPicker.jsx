import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { captureLocation } from "../lib/geolocate.js";

/* A tiny, optional "add location" control for the journal/reflection compose
   area. Requests the browser location and resolves the place you're at.

   Reports BOTH the name (for the entry line) and a coarse position (for the
   journal map) via onChange(name, geo). Callers that don't want a position
   simply ignore the second argument. Failures are quiet: a small muted hint,
   no scary errors. */
export default function LocationPicker({ location, onChange }) {
  const [status, setStatus] = useState("idle"); // idle | locating | error

  const add = async () => {
    setStatus("locating");
    try {
      const place = await captureLocation();
      if (place?.name) {
        onChange(place.name, { lat: place.lat, lon: place.lon });
        setStatus("idle");
      } else {
        setStatus("error");
      }
    } catch {
      // Denied, unavailable, or offline - location is always optional.
      setStatus("error");
    }
  };

  if (location) {
    return (
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="entry-location">
          <Icon.Pin2 width={11} height={11} /> {location}
        </span>
        <button
          type="button"
          className="iconbtn sm location-remove-btn"
          title="Remove location"
          onClick={() => onChange(null, null)}
          style={{ color: "var(--ink-4)" }}
        >
          <Icon.Close width={11} height={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn ghost sm location-add-btn"
        onClick={add}
        disabled={status === "locating"}
        title="Add your current city to this entry"
      >
        <Icon.Map width={13} height={13} />
        {status === "locating" ? "Finding…" : "Add location"}
      </button>
      <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
        {status === "error"
          ? "Location unavailable. That's okay, it's optional."
          : "Only the city name is saved, never your exact location."}
      </span>
    </div>
  );
}
