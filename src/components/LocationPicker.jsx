import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { captureLocationName } from "../lib/geolocate.js";

/* A tiny, optional "add location" control for the journal/reflection compose
   area. Requests the browser location, resolves a city name, and reports it up
   via onChange. Only the resolved name is ever held - never coordinates.
   Failures are quiet: a small muted hint, no scary errors. */
export default function LocationPicker({ location, onChange }) {
  const [status, setStatus] = useState("idle"); // idle | locating | error

  const add = async () => {
    setStatus("locating");
    try {
      const name = await captureLocationName();
      if (name) {
        onChange(name);
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
          onClick={() => onChange(null)}
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
          ? "Location unavailable - that's okay, it's optional."
          : "Only the city name is saved, never your exact location."}
      </span>
    </div>
  );
}
