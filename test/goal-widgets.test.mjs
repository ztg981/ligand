/* Goal dashboard layout: compaction maths, ordering, and the migration path
   for layouts saved by older versions.

   The bug these guard against is a dashboard that leaves a full-width blank
   region under a short widget, and a "fix" that quietly loses the arrangement
   somebody already made. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  WIDGET_LAYOUT_VERSION,
  createGoalWidgetLayout,
  normalizeWidgetOrders,
} from "../src/lib/goalWidgets.js";
import { WIDGET_GAP_PX, WIDGET_ROW_PX, widgetRowSpan } from "../src/hooks/useWidgetRowSpan.js";

/* Stand-in for the tab's registry: the layout code only ever reads these
   three fields, the rest of a real entry is icons and render functions. */
const REGISTRY = {
  goalDetails: { defaultSize: "wide", allowedSizes: ["compact", "medium", "wide"], locked: true },
  habits: { defaultSize: "medium", allowedSizes: ["compact", "medium", "tall"], locked: true },
  progress: { defaultSize: "medium", allowedSizes: ["medium", "tall"], locked: true },
  goalTasks: { defaultSize: "wide", allowedSizes: ["medium", "wide", "large"], locked: true },
  countUp: { defaultSize: "compact", allowedSizes: ["compact", "medium"], locked: false },
};

const PRESETS = [
  { id: "core-goal-details", type: "goalDetails", size: "wide", order: 10, source: "preset" },
  { id: "core-habits", type: "habits", size: "medium", order: 20, source: "preset" },
  { id: "core-progress", type: "progress", size: "medium", order: 30, source: "preset" },
];

const layout = createGoalWidgetLayout(REGISTRY, PRESETS);

// ---- compaction ------------------------------------------------------

test("row span covers the widget's height plus its gap, near-exactly", () => {
  // Rows carry no gap, so a span of n covers exactly n*ROW pixels, and the
  // widget needs its own height plus the 12px margin beneath it.
  for (const height of [1, 60, 156, 230, 240, 431, 460, 907]) {
    const span = widgetRowSpan(height);
    const covered = span * WIDGET_ROW_PX;
    assert.ok(covered >= height + WIDGET_GAP_PX, `span ${span} too short for ${height}px`);
    // Slack under a pixel. This is the whole point of 1px rows: with taller
    // rows every widget rounds up, and the accumulated slack across a
    // dashboard costs more than the dead space compaction reclaims.
    assert.ok(
      covered - (height + WIDGET_GAP_PX) < WIDGET_ROW_PX,
      `span ${span} wastes ${covered - height - WIDGET_GAP_PX}px at ${height}px`
    );
  }
});

test("a fractional measured height is rounded up, never clipped", () => {
  assert.equal(widgetRowSpan(230.4), Math.ceil(230.4 + WIDGET_GAP_PX));
});

test("a short widget beside a tall one spans far fewer rows", () => {
  // This ratio IS the fix: under the old one-row-per-widget grid both of
  // these occupied the same row, and the difference became dead space.
  const short = widgetRowSpan(156);
  const tall = widgetRowSpan(430);
  assert.ok(tall > short * 2, `expected a tall widget to span far more rows (${short} vs ${tall})`);
});

test("unmeasurable heights report no span so the CSS fallback holds the slot", () => {
  for (const value of [0, -20, null, undefined, Number.NaN, Infinity]) {
    assert.equal(widgetRowSpan(value), null);
  }
});

// ---- ordering + persistence ------------------------------------------

test("a stored layout is restored in its saved order", () => {
  const goal = {
    widgetLayoutV2: {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [
        { id: "core-progress", type: "progress", size: "medium", order: 10, source: "preset" },
        { id: "core-goal-details", type: "goalDetails", size: "wide", order: 20, source: "preset" },
        { id: "core-habits", type: "habits", size: "medium", order: 30, source: "preset" },
      ],
    },
  };
  assert.deepEqual(
    layout.resolveWidgetLayoutV2(goal).widgets.map((widget) => widget.id),
    ["core-progress", "core-goal-details", "core-habits"]
  );
});

test("reordering renumbers cleanly and survives a save/restore round trip", () => {
  const initial = layout.resolveWidgetLayoutV2({}).widgets;
  const moved = [initial[2], initial[0], initial[1]];
  const saved = { widgetLayoutV2: { version: WIDGET_LAYOUT_VERSION, widgets: normalizeWidgetOrders(moved) } };

  assert.deepEqual(
    saved.widgetLayoutV2.widgets.map((widget) => widget.order),
    [10, 20, 30]
  );
  // Reloading the goal — the refresh case — must give back the same sequence.
  assert.deepEqual(
    layout.resolveWidgetLayoutV2(saved).widgets.map((widget) => widget.id),
    ["core-progress", "core-goal-details", "core-habits"]
  );
});

test("hiding a widget keeps it in the layout so it can be restored", () => {
  const stored = layout.resolveWidgetLayoutV2({}).widgets.map((widget) =>
    widget.id === "core-habits" ? { ...widget, hidden: true } : widget
  );
  const resolved = layout.resolveWidgetLayoutV2({
    widgetLayoutV2: { version: WIDGET_LAYOUT_VERSION, widgets: stored },
  }).widgets;

  assert.equal(resolved.length, 3);
  assert.equal(resolved.find((widget) => widget.id === "core-habits").hidden, true);
  assert.deepEqual(
    resolved.filter((widget) => !widget.hidden).map((widget) => widget.id),
    ["core-goal-details", "core-progress"]
  );
});

test("mobile order is the stored desktop reading order", () => {
  // The single-column phone layout is DOM order, and DOM order is the stored
  // array — dense packing only changes where the browser paints them.
  const stored = [PRESETS[2], PRESETS[0], PRESETS[1]].map((widget, index) => ({
    ...widget,
    order: (index + 1) * 10,
  }));
  const resolved = layout.resolveWidgetLayoutV2({
    widgetLayoutV2: { version: WIDGET_LAYOUT_VERSION, widgets: stored },
  }).widgets;
  assert.deepEqual(
    resolved.map((widget) => widget.id),
    ["core-progress", "core-goal-details", "core-habits"]
  );
});

// ---- migration + resilience ------------------------------------------

test("a goal with no stored layout gets the presets", () => {
  assert.deepEqual(
    layout.resolveWidgetLayoutV2({}).widgets.map((widget) => widget.id),
    ["core-goal-details", "core-habits", "core-progress"]
  );
});

test("a v1 layout is carried forward instead of discarded", () => {
  const resolved = layout.resolveWidgetLayoutV2({
    // v1 used different type and size names.
    widgetLayout: [{ type: "countup", size: "small" }, { type: "tasks", size: "large" }],
  }).widgets;

  const carried = resolved.filter((widget) => widget.source === "user");
  assert.deepEqual(
    carried.map((widget) => [widget.type, widget.size]),
    [["countUp", "compact"], ["goalTasks", "wide"]]
  );
  // ...and the presets are still there, ahead of it.
  assert.ok(resolved.some((widget) => widget.id === "core-goal-details"));
});

test("a preset added after the user saved their layout still reaches them", () => {
  const resolved = layout.resolveWidgetLayoutV2({
    widgetLayoutV2: {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [{ id: "core-goal-details", type: "goalDetails", size: "wide", order: 10 }],
    },
  }).widgets;

  assert.deepEqual(resolved.map((widget) => widget.id).sort(), [
    "core-goal-details",
    "core-habits",
    "core-progress",
  ]);
});

test("a widget whose type no longer exists is dropped, not rendered blank", () => {
  const resolved = layout.resolveWidgetLayoutV2({
    widgetLayoutV2: {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [
        { id: "gone", type: "widgetFromAnOldBuild", size: "medium", order: 5 },
        { id: "core-goal-details", type: "goalDetails", size: "wide", order: 10 },
      ],
    },
  }).widgets;
  assert.equal(resolved.some((widget) => widget.id === "gone"), false);
});

test("a size the widget does not allow falls back to its default", () => {
  const resolved = layout.resolveWidgetLayoutV2({
    widgetLayoutV2: {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [{ id: "core-progress", type: "progress", size: "compact", order: 10 }],
    },
  }).widgets;
  assert.equal(resolved.find((widget) => widget.id === "core-progress").size, "medium");
});

test("a corrupt stored layout falls back to the presets rather than throwing", () => {
  for (const broken of [null, undefined, { widgetLayoutV2: {} }, { widgetLayoutV2: { widgets: "nope" } }]) {
    assert.deepEqual(
      layout.resolveWidgetLayoutV2(broken).widgets.map((widget) => widget.id),
      ["core-goal-details", "core-habits", "core-progress"]
    );
  }
});
