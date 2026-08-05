/* ============================================================
   Goal dashboard layout
   ------------------------------------------------------------
   The pure half of the goal-widget dashboard: what widgets a goal has, what
   size each is, what order they sit in, and how a stored layout from an older
   version is brought forward.

   Extracted from GoalTab.jsx so it can be tested without rendering React.
   The widget REGISTRY stays in the tab, because its entries hold JSX (icons
   and render functions); everything here needs only three plain fields from
   it — defaultSize, allowedSizes and locked — so the registry is passed in
   rather than imported.
   ============================================================ */

export const WIDGET_LAYOUT_VERSION = 2;
export const WIDGET_SIZE_VARIANTS = ["compact", "medium", "wide", "tall", "large"];
export const WIDGET_SIZE_LABELS = {
  compact: "Compact",
  medium: "Medium",
  wide: "Wide",
  tall: "Tall",
  large: "Large",
};

// v1 layouts used different names for the same things. Both maps are read-only
// translations applied on load; nothing rewrites the user's stored record.
export const LEGACY_WIDGET_SIZE_MAP = { small: "compact", medium: "medium", large: "wide" };
export const LEGACY_WIDGET_TYPE_MAP = {
  habits: "habits",
  tasks: "goalTasks",
  progress: "progress",
  countup: "countUp",
  reflections: "reflections",
  encouragement: "encouragement",
  pomodoro: "pomodoroQuickStart",
};

export function widgetId() {
  return `widget_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeWidgetType(type) {
  return LEGACY_WIDGET_TYPE_MAP[type] || type;
}

export function normalizeWidgetOrder(widget, fallbackOrder) {
  return Number.isFinite(widget?.order) ? widget.order : fallbackOrder;
}

/** Renumber to a clean 10, 20, 30… so later inserts have room between them. */
export function normalizeWidgetOrders(widgets) {
  return widgets.map((widget, index) => ({ ...widget, order: (index + 1) * 10 }));
}

/**
 * Bind the layout helpers to a widget registry.
 *
 * `presets` is the default set of widgets a goal starts with; fitness goals
 * pass their own so a Bulk-up dashboard opens on workout widgets instead of
 * the general-purpose ones.
 */
export function createGoalWidgetLayout(registry, presets = []) {
  function normalizeWidgetSize(size, type) {
    const entry = registry[type];
    const mapped = LEGACY_WIDGET_SIZE_MAP[size] || size || entry?.defaultSize || "medium";
    const allowed = entry?.allowedSizes || WIDGET_SIZE_VARIANTS;
    return allowed.includes(mapped) ? mapped : entry?.defaultSize || "medium";
  }

  /** A stored widget made safe to render, or null if its type no longer exists. */
  function normalizeWidget(widget, fallbackOrder = 100, fallbackSource = "user") {
    const type = normalizeWidgetType(widget?.type);
    const entry = registry[type];
    if (!entry) return null;
    return {
      id: widget.id || widgetId(),
      type,
      size: normalizeWidgetSize(widget.size, type),
      order: normalizeWidgetOrder(widget, fallbackOrder),
      hidden: Boolean(widget.hidden),
      locked: widget.locked ?? entry.locked ?? false,
      source: widget.source || fallbackSource,
      settings: widget.settings || undefined,
    };
  }

  function defaultWidgetLayout() {
    return presets
      .map((widget) => normalizeWidget(widget, widget.order, "preset"))
      .filter(Boolean);
  }

  function legacyWidgetsForV2(goal) {
    if (!Array.isArray(goal?.widgetLayout)) return [];
    return goal.widgetLayout
      .map((widget, index) =>
        normalizeWidget(
          {
            ...widget,
            id: widget.id || `legacy-widget-${index}`,
            type: normalizeWidgetType(widget.type),
            order: 100 + index * 10,
            locked: false,
            source: "user",
          },
          100 + index * 10,
          "user"
        )
      )
      .filter(Boolean);
  }

  /**
   * The layout to render for a goal.
   *
   * Three cases, and none of them discards anything the user arranged:
   *   - a v2 layout is used as stored, with any preset added since it was
   *     saved appended so new widgets still reach existing users;
   *   - a v1 layout is carried forward behind the presets;
   *   - nothing stored falls back to the presets.
   */
  function resolveWidgetLayoutV2(goal) {
    const presetWidgets = defaultWidgetLayout();
    const stored = goal?.widgetLayoutV2;
    const storedWidgets = Array.isArray(stored?.widgets)
      ? stored.widgets
          .map((widget, index) => normalizeWidget(widget, (index + 1) * 10, widget.source || "user"))
          .filter(Boolean)
      : null;

    if (storedWidgets) {
      const ids = new Set(storedWidgets.map((widget) => widget.id));
      const missingPresets = presetWidgets.filter((widget) => !ids.has(widget.id));
      return {
        version: WIDGET_LAYOUT_VERSION,
        widgets: [...storedWidgets, ...missingPresets].sort((a, b) => a.order - b.order),
      };
    }

    return {
      version: WIDGET_LAYOUT_VERSION,
      widgets: [...presetWidgets, ...legacyWidgetsForV2(goal)].sort((a, b) => a.order - b.order),
    };
  }

  return {
    normalizeWidget,
    normalizeWidgetSize,
    defaultWidgetLayout,
    legacyWidgetsForV2,
    resolveWidgetLayoutV2,
  };
}
