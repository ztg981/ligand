/* ============================================================
   HyperfocusBackdrop — the full-screen animated layer behind the
   whole app while Hyperfocus mode is active.

   Pure CSS animation driven by class names + a few inline vars.
   Deep-black base, slow radar/sonar rings pulsing from centre,
   breathing red wave gradients, a vignette, and drifting particles.

   All motion is killed automatically by the global
   [data-reduce-motion="true"] / prefers-reduced-motion rules — the
   base (static) styles keep the dark-red colour theme intact.
   ============================================================ */

// Deterministic particle field (generated once at module scope so React
// never re-randomises positions between renders).
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53 + 11) % 100}%`,
  size: 1.5 + (i % 3),
  dur: 14 + (i % 6) * 4,
  delay: -(i * 1.7),
  dx: ((i % 5) - 2) * 26, // horizontal drift target, px
  dy: -(20 + (i % 4) * 22), // upward drift target, px
}));

export default function HyperfocusBackdrop() {
  return (
    <div className="hf-backdrop" aria-hidden="true">
      {/* Breathing wave gradients */}
      <div className="hf-wave hf-wave-1" />
      <div className="hf-wave hf-wave-2" />
      <div className="hf-wave hf-wave-3" />

      {/* Concentric radar rings pulsing outward */}
      <div className="hf-rings">
        <span className="hf-ring" style={{ animationDelay: "0s" }} />
        <span className="hf-ring" style={{ animationDelay: "1s" }} />
        <span className="hf-ring" style={{ animationDelay: "2s" }} />
      </div>

      {/* Drifting particles */}
      <div className="hf-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="hf-particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              "--hf-dx": `${p.dx}px`,
              "--hf-dy": `${p.dy}px`,
            }}
          />
        ))}
      </div>

      {/* Vignette — darker edges, slightly lighter centre */}
      <div className="hf-vignette" />
    </div>
  );
}
