/* Minimal icon set — line-based, 16px viewBox standard.
   Ported from the Claude Design bundle (icons.jsx). */
const make =
  (paths, vb = "0 0 16 16") =>
  (props) =>
    (
      <svg
        viewBox={vb}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {paths}
      </svg>
    );

export const Icon = {
  Home: make(
    <>
      <path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V7.5z" />
      <path d="M6.5 13.5V9.5h3v4" />
    </>
  ),
  Bolt: make(<path d="M8.5 1.5L3 9h4l-.5 5.5L12 7H8l.5-5.5z" />),
  Check: make(<path d="M3 8.5L6.5 12 13 4.5" />),
  Timer: make(
    <>
      <circle cx="8" cy="9" r="5" />
      <path d="M8 6V9l2 1.5M6 2h4M8 4V2" />
    </>
  ),
  Book: make(
    <>
      <path d="M3 3v10.5A.5.5 0 0 0 3.5 14H13V3.5A.5.5 0 0 0 12.5 3H4a1 1 0 0 0-1 1z" />
      <path d="M3 12.5h10" />
    </>
  ),
  Gear: make(
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  Plus: make(<path d="M8 3v10M3 8h10" />),
  Search: make(
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" />
    </>
  ),
  Bell: make(
    <>
      <path d="M3.5 11.5h9l-1-1.5V7a3.5 3.5 0 0 0-7 0v3l-1 1.5z" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    </>
  ),
  Sun: make(
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" />
    </>
  ),
  Moon: make(<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />),
  Play: make(<path d="M5 3.5v9l7-4.5-7-4.5z" fill="currentColor" />),
  Pause: make(
    <>
      <rect x="5" y="3.5" width="2" height="9" rx="0.4" fill="currentColor" stroke="none" />
      <rect x="9" y="3.5" width="2" height="9" rx="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  Reset: make(
    <>
      <path d="M3 8a5 5 0 1 0 1.5-3.5" />
      <path d="M2 2v3h3" />
    </>
  ),
  Volume: make(
    <>
      <path d="M3 6.5v3h2L8 12V4L5 6.5H3z" />
      <path d="M10 6c.7.5.7 3.5 0 4" />
    </>
  ),
  Cloud: make(<path d="M4.5 11.5h7a2.5 2.5 0 0 0 .3-5A3.5 3.5 0 0 0 5 5.5a2.5 2.5 0 0 0-.5 6z" />),
  Lock: make(
    <>
      <rect x="4" y="7" width="8" height="6" rx="1" />
      <path d="M6 7V5a2 2 0 1 1 4 0v2" />
    </>
  ),
  More: make(
    <>
      <circle cx="3.5" cy="8" r="0.8" fill="currentColor" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" />
      <circle cx="12.5" cy="8" r="0.8" fill="currentColor" />
    </>
  ),
  Spark: make(<path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.8 3.8l2 2M10.2 10.2l2 2M3.8 12.2l2-2M10.2 5.8l2-2" />),
  Pin: make(
    <>
      <path d="M6 2h4l-.5 4 2 2v1H4.5v-1l2-2L6 2z" />
      <path d="M8 9v5" />
    </>
  ),
  Flame: make(
    <path d="M8 14c2.5 0 4-1.6 4-3.8 0-1.4-.8-2.4-2-3.2.3 1.8-1 2-1 2 .5-2-1-4-2-5 .2 2.5-3 3.5-3 6 0 2.4 1.5 4 4 4z" />
  ),
  Arrow: make(<path d="M3 8h10M9 4l4 4-4 4" />),
  Trophy: make(
    <>
      <path d="M5 3h6v3a3 3 0 0 1-6 0V3z" />
      <path d="M5 4H3v1a2 2 0 0 0 2 2M11 4h2v1a2 2 0 0 1-2 2M6 13h4M7 9.5l-.5 3.5M9 9.5l.5 3.5" />
    </>
  ),
  Target: make(
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" />
    </>
  ),
  Calendar: make(
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
      <path d="M2.5 6.5h11M5 2v3M11 2v3" />
    </>
  ),
  Heart: make(<path d="M8 13s-4.5-2.8-4.5-6A2.5 2.5 0 0 1 8 5.5 2.5 2.5 0 0 1 12.5 7c0 3.2-4.5 6-4.5 6z" />),
  Mic: make(
    <>
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v2" />
    </>
  ),
  Edit: make(<path d="M10 3.5l2.5 2.5L6 12.5l-3 .5.5-3L10 3.5z" />),
  Close: make(<path d="M4 4l8 8M12 4l-8 8" />),
  Trash: make(<path d="M3.5 5h9M6 5V3.5h4V5M5 5l.5 8h5L11 5" />),
  Star: make(<path d="M8 2l1.8 3.7 4 .6-3 2.9.8 4.1L8 11.3l-3.6 2 .8-4.1-3-2.9 4-.6L8 2z" />),
  Sound: make(
    <>
      <path d="M3 6.5v3h2L8 12V4L5 6.5H3z" />
      <path d="M10 6c.7.5.7 3.5 0 4M11.5 4.5c1.5 1 1.5 6 0 7" />
    </>
  ),
  Wand: make(
    <>
      <path d="M3 13l8-8M9 3l2 2M10 7l1 1" />
      <path d="M13 10l.5 1.5L15 12l-1.5.5L13 14l-.5-1.5L11 12l1.5-.5L13 10z" fill="currentColor" />
    </>
  ),
  Mood: make(
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6 7v.5M10 7v.5M5.5 9.5a3 3 0 0 0 5 0" />
    </>
  ),
  Battery: make(
    <>
      <rect x="2" y="6" width="10" height="4" rx="0.5" />
      <rect x="13" y="7" width="1" height="2" rx="0.3" fill="currentColor" />
      <rect x="3" y="7" width="6" height="2" rx="0.2" fill="currentColor" stroke="none" />
    </>
  ),
  Leaf: make(
    <path d="M3 13c3-3 6.5-4 9-3.5C12.5 7 11 4 8 2.5 7 6 5 9 3 13z M6 10c1.5-1 3-1.5 5-1" />
  ),
};

export default Icon;
