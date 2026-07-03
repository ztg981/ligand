/* MuscleDiagram - a tiny front-facing body silhouette that highlights the
   muscle group an exercise targets. Pure SVG, themed via currentColor + an
   accent highlight. Kept deliberately simple (a schematic, not anatomy) so it
   reads at ~40px on an exercise card. */

// Which silhouette regions to light up per muscle group.
const HIGHLIGHT = {
  chest: ["chest"],
  back: ["upperBack"],
  shoulders: ["deltL", "deltR"],
  biceps: ["armL", "armR"],
  triceps: ["armL", "armR"],
  legs: ["legL", "legR"],
  core: ["core"],
  cardio: ["chest", "core"],
};

export default function MuscleDiagram({ group, size = 44 }) {
  const on = new Set(HIGHLIGHT[group] || []);
  const hi = (id) => (on.has(id) ? "var(--accent)" : "transparent");

  return (
    <svg
      viewBox="0 0 40 72"
      width={size}
      height={size * 1.8}
      className="muscle-diagram"
      aria-hidden="true"
    >
      {/* base silhouette */}
      <g fill="var(--line-strong, rgba(120,120,130,.28))">
        <circle cx="20" cy="7" r="5" />
        <rect x="11" y="13" width="18" height="20" rx="5" />
        <rect x="4" y="14" width="6" height="18" rx="3" />
        <rect x="30" y="14" width="6" height="18" rx="3" />
        <rect x="13" y="33" width="6" height="30" rx="3" />
        <rect x="21" y="33" width="6" height="30" rx="3" />
      </g>
      {/* highlight overlays */}
      <g>
        <rect x="11" y="14" width="18" height="9" rx="4" fill={hi("chest")} opacity="0.9" />
        <rect x="11" y="13" width="18" height="7" rx="4" fill={hi("upperBack")} opacity="0.9" />
        <circle cx="11" cy="16" r="4" fill={hi("deltL")} opacity="0.9" />
        <circle cx="29" cy="16" r="4" fill={hi("deltR")} opacity="0.9" />
        <rect x="4" y="15" width="6" height="15" rx="3" fill={hi("armL")} opacity="0.9" />
        <rect x="30" y="15" width="6" height="15" rx="3" fill={hi("armR")} opacity="0.9" />
        <rect x="12" y="23" width="16" height="10" rx="4" fill={hi("core")} opacity="0.9" />
        <rect x="13" y="34" width="6" height="26" rx="3" fill={hi("legL")} opacity="0.9" />
        <rect x="21" y="34" width="6" height="26" rx="3" fill={hi("legR")} opacity="0.9" />
      </g>
    </svg>
  );
}
