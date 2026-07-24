import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey } from "../lib/model.js";
import {
  WEEKDAY_MIN,
  itemsForDate,
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
  weekOf,
} from "../lib/calendar.js";
import { describeRepeat } from "../lib/recurrence.js";
import { parseNaturalEvent } from "../lib/scheduleParse.js";
import { parseEventNL } from "../lib/aiApi.js";

/* CalendarViews — the Week and Month lenses of the Day tab.

   One tab, three zoom levels (Apple Calendar's model): Day is the dial
   close-up, Week is the agenda strip, Month is the wide grid. Month cells
   show what the day actually holds — colored event chips on wide screens,
   dots and a count on phones — and selecting a day opens its item list
   right below, where every block is one tap from the editor.

   The "type it" bar turns natural language ("meeting with James every
   sunday 7/19 to end of august") into a PREFILLED editor — the local
   parser first, Gemini for messier phrasing when signed in. Nothing is
   saved until the user confirms the editor. */

const KIND_ICON = {
  block: (p) => <Icon.Timer {...p} />,
  workout: (p) => <Icon.Dumbbell {...p} />,
  task: (p) => <Icon.Check {...p} />,
  alarm: (p) => <Icon.Bell {...p} />,
  deadline: (p) => <Icon.Target {...p} />,
};

function dayTitle(key) {
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
function shortDay(key) {
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

/* The natural-language add bar. onDraft receives {title, date, start, end,
   repeat} for the editor; nothing writes to the store here. */
export function NaturalAddBar({ refDate, onDraft, signedIn = false }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  const go = async () => {
    const t = text.trim();
    if (!t) return;
    setHint("");
    let parsed = parseNaturalEvent(t, refDate);
    // The local parser handles most phrasings; Gemini picks up the messy
    // ones when signed in ("first thing monday", "after school", …).
    if ((!parsed || (!parsed.start && !parsed.repeat)) && signedIn) {
      setBusy(true);
      const ai = await parseEventNL(t, refDate);
      setBusy(false);
      if (ai.ok) parsed = ai.event;
    }
    if (!parsed) {
      setHint('Try something like "Meeting with James every Sunday 7/19 until end of August".');
      return;
    }
    setText("");
    onDraft(parsed);
  };

  return (
    <div className="calv-nl">
      <div className="calv-nl-row">
        <Icon.Spark width={15} height={15} />
        <input
          className="input calv-nl-input"
          placeholder='Type it: "Tennis every Saturday 10am until end of August"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
        />
        <button
          className="btn primary sm"
          onClick={go}
          disabled={busy || !text.trim()}
          style={{ opacity: busy || !text.trim() ? 0.5 : 1 }}
        >
          {busy ? "Reading…" : "Add"}
        </button>
      </div>
      {hint && <p className="qa-hint" role="alert">{hint}</p>}
    </div>
  );
}

function DayItems({ items, onEditBlock }) {
  if (!items.length) {
    return <p className="dp-empty">Nothing scheduled this day.</p>;
  }
  return (
    <div className="cal-items">
      {items.map((it) => {
        const Ic = KIND_ICON[it.kind] || KIND_ICON.block;
        const clickable = it.kind === "block" && onEditBlock;
        const Tag = clickable ? "button" : "div";
        return (
          <Tag
            key={it.id}
            className={"cal-item" + (it.done ? " done" : "") + (clickable ? " tap" : "")}
            onClick={clickable ? () => onEditBlock(it.refId) : undefined}
          >
            <span className="cal-item-time mono">{it.timeLabel || "all day"}</span>
            <span className="cal-item-ic" style={{ "--cat": it.color }}>
              <Ic width={12} height={12} />
            </span>
            <span className="cal-item-title">
              {it.title}
              {it.repeat && (
                <span className="cal-item-repeat" title={describeRepeat(it.repeat)}>
                  <Icon.Reset width={10} height={10} />
                </span>
              )}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

export function MonthView({
  stores,
  selected,
  onSelect,
  onOpenDay, // (dateKey) => void — zoom into the Day dial
  onNewEvent, // (dateKey) => void — open the editor for that day
  onEditBlock, // (blockId) => void
  onImport, // open the screenshot import sheet
  isMobile = false,
}) {
  const today = todayKey();
  const [mKey, setMKey] = useState(() => monthKey(selected || today));
  const [expanded, setExpanded] = useState(false);
  const grid = useMemo(() => monthGrid(mKey), [mKey]);
  // One merged item list per visible day (memoized on data + month).
  const byDay = useMemo(() => {
    const out = {};
    for (const week of grid) {
      for (const cell of week) out[cell.key] = itemsForDate(stores, cell.key);
    }
    return out;
  }, [grid, stores]);
  const dayItems = byDay[selected] || itemsForDate(stores, selected);

  return (
    <div className={(isMobile ? "cal-month-layout mobile" : "grid grid-12 cal-month-layout") + (expanded ? " expanded" : "")}>
      <div className={isMobile ? "" : expanded ? "col-12" : "col-7"} style={{ minWidth: 0 }}>
        <div className="card cal-card">
          <div className="cal-head">
            <div className="cal-month">{monthLabel(mKey)}</div>
            <div className="cal-nav">
              <button
                type="button"
                className="btn ghost sm cal-expand-btn"
                onClick={() => setExpanded((value) => !value)}
                aria-pressed={expanded}
              >
                {expanded ? "Fit view" : "Expand"}
              </button>
              {mKey !== monthKey(today) && (
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    setMKey(monthKey(today));
                    onSelect(today);
                  }}
                >
                  Today
                </button>
              )}
              <button className="iconbtn" title="Previous month" onClick={() => setMKey(shiftMonth(mKey, -1))}>
                ‹
              </button>
              <button className="iconbtn" title="Next month" onClick={() => setMKey(shiftMonth(mKey, 1))}>
                ›
              </button>
            </div>
          </div>

          <div
            className={
              "cal-grid" +
              (isMobile ? "" : " cal-grid-wide") +
              (expanded ? " cal-grid-expanded" : "")
            }
            role="grid"
            aria-label={monthLabel(mKey)}
          >
            {WEEKDAY_MIN.map((d, i) => (
              <div key={"h" + i} className="cal-dow" aria-hidden="true">
                {d}
              </div>
            ))}
            {grid.flat().map((cell) => {
              const items = byDay[cell.key] || [];
              const isToday = cell.key === today;
              const isSel = cell.key === selected;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={
                    "cal-cell" +
                    (cell.inMonth ? "" : " out") +
                    (isToday ? " today" : "") +
                    (isSel ? " sel" : "")
                  }
                  aria-pressed={isSel}
                  aria-label={`${dayTitle(cell.key)}${items.length ? `, ${items.length} scheduled` : ""}`}
                  onClick={() => onSelect(cell.key)}
                  onDoubleClick={() => onOpenDay?.(cell.key)}
                >
                  <span className="cal-cell-num">{Number(cell.key.slice(8))}</span>
                  {isMobile ? (
                    <span className="cal-cell-dots" aria-hidden="true">
                      {[...new Set(items.map((i) => i.color))].slice(0, 3).map((c, i) => (
                        <span key={i} className="cal-dot" style={{ background: c }} />
                      ))}
                      {items.length > 3 && <span className="cal-dot-more">+</span>}
                    </span>
                  ) : (
                    <span className="cal-cell-chips" aria-hidden="true">
                      {items.slice(0, 2).map((it) => (
                        <span key={it.id} className="cal-cell-chip" style={{ "--cat": it.color }}>
                          {it.title}
                        </span>
                      ))}
                      {items.length > 2 && (
                        <span className="cal-cell-chip more">+{items.length - 2} more</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={isMobile ? "" : expanded ? "col-12" : "col-5"} style={{ minWidth: 0 }}>
        <div className="card cal-day">
          <div className="card-head">
            <div className="card-title">
              <Icon.Calendar /> {selected === today ? "Today" : dayTitle(selected)}
            </div>
            <span className="cal-day-count">
              {dayItems.length ? `${dayItems.length} scheduled` : ""}
            </span>
          </div>
          <DayItems items={dayItems} onEditBlock={onEditBlock} />
          <div className="cal-day-actions">
            <button className="btn primary sm" onClick={() => onNewEvent(selected)}>
              <Icon.Plus width={13} height={13} /> New event
            </button>
            <button className="btn ghost sm" onClick={() => onOpenDay?.(selected)}>
              <Icon.Timer width={13} height={13} /> Day view
            </button>
            <button className="btn ghost sm" onClick={onImport}>
              <Icon.Image width={13} height={13} /> Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeekView({
  stores,
  date,
  onShiftWeek, // (deltaDays) => void
  onOpenDay,
  onNewEvent,
  onEditBlock,
  isMobile = false,
}) {
  const today = todayKey();
  const [expanded, setExpanded] = useState(false);
  const week = useMemo(() => weekOf(date), [date]);
  const byDay = useMemo(() => {
    const out = {};
    for (const key of week) out[key] = itemsForDate(stores, key);
    return out;
  }, [week, stores]);

  const label = `${shortDay(week[0])} – ${shortDay(week[6])}`;

  return (
    <div className="card cal-card">
      <div className="cal-head">
        <div className="cal-month">{label}</div>
        <div className="cal-nav">
          {!week.includes(today) && (
            <button className="btn ghost sm" onClick={() => onShiftWeek(null)}>
              Today
            </button>
          )}
          <button
            type="button"
            className="btn ghost sm cal-expand-btn"
            onClick={() => setExpanded((value) => !value)}
            aria-pressed={expanded}
          >
            {expanded ? "Compact" : "Expand"}
          </button>
          <button className="iconbtn" title="Previous week" onClick={() => onShiftWeek(-7)}>
            ‹
          </button>
          <button className="iconbtn" title="Next week" onClick={() => onShiftWeek(7)}>
            ›
          </button>
        </div>
      </div>

      <div className={"calv-week" + (isMobile ? " stack-days" : "") + (expanded ? " expanded" : "")}>
        {week.map((key) => {
          const items = byDay[key];
          const isToday = key === today;
          return (
            <div key={key} className={"calv-week-day" + (isToday ? " today" : "")}>
              <button
                type="button"
                className="calv-week-head"
                onClick={() => onOpenDay?.(key)}
                title="Open in Day view"
              >
                <span className="calv-week-dow">{shortDay(key)}</span>
                {items.length > 0 && <span className="calv-week-count">{items.length}</span>}
              </button>
              {items.length === 0 ? (
                <button className="calv-week-empty" onClick={() => onNewEvent(key)} title="Add here">
                  +
                </button>
              ) : (
                <div className="calv-week-items">
                  {items.map((it) => {
                    const clickable = it.kind === "block" && onEditBlock;
                    const Tag = clickable ? "button" : "div";
                    return (
                      <Tag
                        key={it.id}
                        className={"calv-week-item" + (it.done ? " done" : "") + (clickable ? " tap" : "")}
                        style={{ "--cat": it.color }}
                        onClick={clickable ? () => onEditBlock(it.refId) : undefined}
                      >
                        {it.timeLabel && <span className="calv-week-time mono">{it.timeLabel.split(" – ")[0]}</span>}
                        <span className="calv-week-title">{it.title}</span>
                      </Tag>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
