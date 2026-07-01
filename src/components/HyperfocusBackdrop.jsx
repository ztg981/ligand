/* ============================================================
   HyperfocusBackdrop - the full-screen animated layer behind the
   whole app while Hyperfocus mode is active.

   Rebuilt for premium depth:
   - 4 radar/sonar rings with varying thickness + blur-trail so they
     feel like they're expanding toward the viewer from a distance
   - Breathing wave gradients for the dark-red base glow
   - HUD scanning line that sweeps the screen periodically
   - Red vignette to focus the eye inward

   All motion is killed automatically by [data-reduce-motion="true"] /
   prefers-reduced-motion - static colour theme stays intact.
   ============================================================ */

export default function HyperfocusBackdrop() {
  return (
    <div className="hf-backdrop" aria-hidden="true">
      {/* Breathing wave gradients */}
      <div className="hf-wave hf-wave-1" />
      <div className="hf-wave hf-wave-2" />
      <div className="hf-wave hf-wave-3" />

      {/* Concentric radar rings - 4 rings, staggered 1.375s apart.
          Each starts small+blurry+thick (near the viewer), then expands
          outward while thinning and sharpening - the "depth" effect. */}
      <div className="hf-rings">
        <span className="hf-ring" style={{ animationDelay: "0s" }} />
        <span className="hf-ring" style={{ animationDelay: "-1.375s" }} />
        <span className="hf-ring" style={{ animationDelay: "-2.75s" }} />
        <span className="hf-ring" style={{ animationDelay: "-4.125s" }} />
      </div>

      {/* HUD scanning line - thin horizontal sweep, subtle, periodic */}
      <div className="hf-scan" />

      {/* Red vignette - darker edges, focuses the eye inward */}
      <div className="hf-vignette" />
    </div>
  );
}
