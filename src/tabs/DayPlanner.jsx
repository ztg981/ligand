import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icons.jsx";
import DayDial from "../components/DayDial.jsx";
import DayStory from "../components/DayStory.jsx";
import AssistantReviewPanel from "../components/AssistantReviewPanel.jsx";
import ScheduleImportSheet from "../components/ScheduleImportSheet.jsx";
import MobileDayTimeline from "../components/MobileDayTimeline.jsx";
import { MonthView, NaturalAddBar, WeekView } from "../components/CalendarViews.jsx";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { createDayBlock, todayKey, shiftDay } from "../lib/model.js";
import {
  BLOCK_CATEGORIES,
  categoryById,
  minutesToHHMM,
  hhmmToMinutes,
  minutesToLabel,
  nextFreeSlot,
} from "../lib/dayPlanner.js";
import { describeRepeat, expandRepeat } from "../lib/recurrence.js";

/* DayPlanner — the Day tab: plan the day as a shape, not a list.

   Left: the big interactive dial (drag to carve out a block, click to edit).
   Right: the editor, the chronological list (the accessible mirror of the
   dial), things waiting to be placed (today's tasks, planned workouts,
   habits), and dial preferences. Blocks link back to what they schedule, so
   marking a linked block done completes the task, and a placed workout
   still starts the real session. */

const DEFAULT_PREFS = {
  textures: true,
  showSleepBand: true,
  sleepStart: "23:00",
  sleepEnd: "07:00",
  showAlarms: true,
  dialTopHour: 0, // which hour sits at the top of the dial (0/6/12/18)
  compressSleep: false, // squeeze the sleep window to expand waking hours
};

const WEEKDAY_CHIPS = ["M", "T", "W", "T", "F", "S", "S"]; // Mon=0..Sun=6

function BlockEditor({
  draft,
  setDraft,
  onSave,
  onDelete,
  onDeleteSeries,
  onClose,
  isNew,
  isMobile = false,
  overlay = false, // week/month views: float the editor instead of inlining it
}) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const valid =
    draft.title.trim() &&
    hhmmToMinutes(draft.startHH) != null &&
    hhmmToMinutes(draft.endHH) != null &&
    hhmmToMinutes(draft.endHH) > hhmmToMinutes(draft.startHH);

  const repeat = draft.repeat; // null | {freq, interval, weekdays, until}
  const setRepeatFreq = (freq) =>
    set({
      repeat:
        freq === "none"
          ? null
          : {
              freq,
              interval: repeat?.interval || 1,
              weekdays:
                freq === "weekly"
                  ? repeat?.weekdays?.length
                    ? repeat.weekdays
                    : [(new Date(draft.date + "T00:00:00").getDay() + 6) % 7]
                  : [],
              until: repeat?.until || null,
            },
    });
  const toggleWeekday = (wd) => {
    if (!repeat) return;
    const has = repeat.weekdays.includes(wd);
    const next = has
      ? repeat.weekdays.filter((d) => d !== wd)
      : [...repeat.weekdays, wd].sort();
    if (!next.length) return; // a weekly repeat needs at least one day
    set({ repeat: { ...repeat, weekdays: next } });
  };
  const body = (
    <>
      <div className="card-head">
        <div className="card-title">
          <Icon.Pencil /> {isNew ? "New block" : "Edit block"}
        </div>
        <button className="iconbtn sm" title="Close" onClick={onClose}>
          <Icon.Close width={13} height={13} />
        </button>
      </div>
      <input
        className="input dp-editor-title"
        placeholder="What is this time for?"
        value={draft.title}
        autoFocus={isNew}
        onChange={(e) => set({ title: e.target.value.slice(0, 60) })}
      />
      <div className="dp-editor-times">
        <label className="dp-time" style={{ flex: "1 1 100%" }}>
          <span>Day</span>
          <input
            className="input"
            type="date"
            value={draft.date}
            onChange={(e) => set({ date: e.target.value || draft.date })}
          />
        </label>
      </div>
      <div className="dp-editor-times">
        <label className="dp-time">
          <span>From</span>
          <input
            className="input"
            type="time"
            value={draft.startHH}
            onChange={(e) => set({ startHH: e.target.value })}
          />
        </label>
        <label className="dp-time">
          <span>To</span>
          <input
            className="input"
            type="time"
            value={draft.endHH}
            onChange={(e) => set({ endHH: e.target.value })}
          />
        </label>
      </div>
      <div className="dp-cats" role="group" aria-label="Category">
        {BLOCK_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={"dp-cat" + (draft.category === c.id ? " on" : "")}
            style={{ "--cat": c.color }}
            onClick={() => set({ category: c.id })}
            aria-pressed={draft.category === c.id}
          >
            <span className="dp-cat-dot" /> {c.name}
          </button>
        ))}
      </div>
      <label className="dp-check">
        <input
          type="checkbox"
          checked={draft.protected}
          onChange={(e) => set({ protected: e.target.checked })}
        />
        Protected: this hour doesn't move when plans change
      </label>

      {/* Repeat, Apple-Calendar style. New blocks only: an existing block is
         one occurrence, and its edits stay its own. */}
      {isNew && (
        <div className="dp-repeat">
          <div className="dp-repeat-head">
            <span className="dp-repeat-lbl">Repeat</span>
            <div className="seg dp-repeat-seg">
              {[
                { id: "none", label: "Off" },
                { id: "daily", label: "Daily" },
                { id: "weekly", label: "Weekly" },
                { id: "monthly", label: "Monthly" },
              ].map((o) => (
                <button
                  key={o.id}
                  className={(repeat?.freq || "none") === o.id ? "active" : ""}
                  onClick={() => setRepeatFreq(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {repeat?.freq === "weekly" && (
            <div className="dp-repeat-days" role="group" aria-label="On these days">
              {WEEKDAY_CHIPS.map((d, wd) => (
                <button
                  key={wd}
                  type="button"
                  className={"dp-repeat-day" + (repeat.weekdays.includes(wd) ? " on" : "")}
                  aria-pressed={repeat.weekdays.includes(wd)}
                  onClick={() => toggleWeekday(wd)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          {repeat && (
            <div className="dp-repeat-row">
              <label className="dp-repeat-every">
                every
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="12"
                  value={repeat.interval}
                  onChange={(e) =>
                    set({
                      repeat: {
                        ...repeat,
                        interval: Math.min(12, Math.max(1, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
                {{ daily: "day(s)", weekly: "week(s)", monthly: "month(s)" }[repeat.freq]}
              </label>
              <label className="dp-repeat-until">
                until
                <input
                  className="input"
                  type="date"
                  value={repeat.until || ""}
                  min={draft.date}
                  onChange={(e) => set({ repeat: { ...repeat, until: e.target.value || null } })}
                />
              </label>
            </div>
          )}
          {repeat && (
            <p className="dp-repeat-desc">
              {describeRepeat(repeat)}
              {!repeat.until && " (adds about 6 months ahead)"}
            </p>
          )}
        </div>
      )}

      {!isNew && draft.repeat && (
        <p className="dp-repeat-desc">
          <Icon.Reset width={11} height={11} /> Part of a series: {describeRepeat(draft.repeat)}
        </p>
      )}

      <div className="dp-editor-actions">
        {!isNew &&
          (draft.seriesId ? (
            <>
              <button className="btn ghost sm dp-danger" onClick={onDelete}>
                <Icon.Trash width={13} height={13} /> This one
              </button>
              <button
                className="btn ghost sm dp-danger"
                onClick={onDeleteSeries}
                title="Remove this and every future occurrence"
              >
                <Icon.Trash width={13} height={13} /> Whole series
              </button>
            </>
          ) : (
            <button className="btn ghost sm dp-danger" onClick={onDelete}>
              <Icon.Trash width={13} height={13} /> Remove
            </button>
          ))}
        <button
          className="btn primary sm"
          onClick={onSave}
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5 }}
        >
          <Icon.Check width={13} height={13} /> {isNew ? "Add block" : "Save"}
        </button>
      </div>
    </>
  );

  // Phone: the editor rises as a bottom sheet (the platform-native "edit this
  // thing" gesture), instead of rendering somewhere below the fold — the old
  // behavior made tapping a dial block look like it did nothing.
  if (isMobile) {
    return createPortal(
      <div
        className="sheet-scrim quick-note-scrim"
        role="presentation"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="bottom-sheet quick-note-sheet dp-editor-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? "New block" : "Edit block"}
        >
          <div className="sheet-drag-area">
            <span className="sheet-handle" />
          </div>
          <div className="sheet-body dp-editor">{body}</div>
        </div>
      </div>,
      document.body
    );
  }

  if (overlay) {
    return createPortal(
      <div
        className="scrim"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="modal qa-modal dp-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? "New event" : "Edit event"}
        >
          <div className="qa-modal-body dp-editor">{body}</div>
        </div>
      </div>,
      document.body
    );
  }

  return <div className="card dp-editor">{body}</div>;
}

export default function DayPlanner({
  date: dateProp,
  onDateChange,
  dayBlocks = [],
  addDayBlock,
  updateDayBlock,
  deleteDayBlock,
  addDayBlockSeries,
  deleteDayBlockSeries,
  tasks = [],
  toggleTask,
  goals = [],
  scheduledWorkouts = [],
  alarms = [],
  onOpenWorkout,
  activities = [],
  workouts = [],
  focusLog = [],
  journal = [],
  meals = [],
  sleepLog = [],
  removeActivity,
  onLogActivity, // (dateKey) => void — open the activity sheet for this date
  confirmBeforeDelete = true,
  signedIn = false,
}) {
  const isMobile = useIsMobile(768);
  // Zoom level: Day (the dial), Week (agenda strip), Month (the wide grid).
  const [view, setView] = useLocalStorage("ligand.dayView", "day");
  const [importOpen, setImportOpen] = useState(false);
  // The viewed date is App-owned when provided (so the Calendar can hand a
  // day over); the local state is the standalone fallback.
  const [localDate, setLocalDate] = useState(todayKey);
  const date = dateProp || localDate;
  const setDate = (d) => {
    setLocalDate(d);
    onDateChange?.(d);
  };
  const [prefs, setPrefs] = useLocalStorage("ligand.dayPlanner", DEFAULT_PREFS);
  const pref = { ...DEFAULT_PREFS, ...prefs };
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // editor draft; {id?} present = editing existing
  const [placeMsg, setPlaceMsg] = useState(""); // inline "day is full" note (never alert())
  const isToday = date === todayKey();

  const blocks = useMemo(
    () =>
      dayBlocks
        .filter((b) => b.date === date)
        .sort((a, b) => a.start - b.start),
    [dayBlocks, date]
  );

  const weekdayIdx = (new Date(date + "T00:00:00").getDay() + 6) % 7;
  const dialAlarms = useMemo(() => {
    if (!pref.showAlarms) return [];
    return alarms
      .filter((a) => a.enabled && (!a.days?.length || a.days.includes(weekdayIdx)))
      .map((a) => ({ id: a.id, label: a.label, minutes: hhmmToMinutes(a.time) ?? 0 }));
  }, [alarms, weekdayIdx, pref.showAlarms]);

  // ---- editor plumbing ------------------------------------------------
  const openNew = (start, end, extra = {}) =>
    setDraft({
      id: null,
      date: extra.date || date,
      title: extra.title || "",
      startHH: extra.startHH || minutesToHHMM(start),
      endHH: extra.endHH || minutesToHHMM(end),
      category: extra.category || "focus",
      protected: false,
      linkType: extra.linkType || null,
      linkId: extra.linkId || null,
      repeat: extra.repeat || null,
      seriesId: null,
    });

  const openExisting = (id, source = null) => {
    const b = (source || dayBlocks).find((x) => x.id === id);
    if (!b) return;
    setSelectedId(id);
    setDraft({
      id,
      date: b.date,
      title: b.title,
      startHH: minutesToHHMM(b.start),
      endHH: minutesToHHMM(b.end),
      category: b.category,
      protected: b.protected,
      linkType: b.linkType,
      linkId: b.linkId,
      repeat: b.repeat || null,
      seriesId: b.seriesId || null,
    });
  };

  const saveDraft = () => {
    const start = hhmmToMinutes(draft.startHH);
    const end = hhmmToMinutes(draft.endHH);
    const fields = {
      title: draft.title.trim(),
      start,
      end,
      category: draft.category,
      protected: draft.protected,
      linkType: draft.linkType,
      linkId: draft.linkId,
    };
    if (draft.id) {
      updateDayBlock?.(draft.id, { ...fields, date: draft.date });
    } else if (draft.repeat) {
      // Materialize the whole series as real blocks sharing a seriesId, so
      // every surface (dial, ring, story, sync) sees them with zero magic.
      const seriesId = `ser_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const dates = expandRepeat(draft.date, draft.repeat);
      addDayBlockSeries?.(
        dates.map((d) =>
          createDayBlock({ ...fields, date: d, seriesId, repeat: draft.repeat })
        )
      );
    } else {
      addDayBlock?.({ ...fields, date: draft.date });
    }
    setDraft(null);
    setSelectedId(null);
  };

  // "Whole series" removes this and every future occurrence; days already
  // lived stay in the record.
  const removeSeries = () => {
    if (draft?.seriesId) deleteDayBlockSeries?.(draft.seriesId, draft.date);
    setDraft(null);
    setSelectedId(null);
  };

  // Everything the calendar lenses merge per day.
  const calStores = useMemo(
    () => ({ dayBlocks, scheduledWorkouts, tasks, alarms, goals }),
    [dayBlocks, scheduledWorkouts, tasks, alarms, goals]
  );

  // A parsed natural-language line lands here as a PREFILLED editor draft.
  const draftFromParsed = (ev) => {
    const startHH = ev.start || "09:00";
    const endHH =
      ev.end ||
      minutesToHHMM(Math.min(24 * 60, (hhmmToMinutes(startHH) ?? 540) + 60));
    setDraft({
      id: null,
      date: ev.date || date,
      title: ev.title,
      startHH,
      endHH,
      category: "work",
      protected: false,
      linkType: null,
      linkId: null,
      repeat: ev.repeat || null,
      seriesId: null,
    });
  };

  const removeDraft = () => {
    if (draft?.id) deleteDayBlock?.(draft.id);
    setDraft(null);
    setSelectedId(null);
  };

  // Done on a linked task-block also completes the task itself.
  const toggleDone = (b) => {
    updateDayBlock?.(b.id, { done: !b.done });
    if (b.linkType === "task" && b.linkId) toggleTask?.(b.linkId);
  };

  // ---- placement helpers ----------------------------------------------
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const placeFrom = isToday ? Math.max(nowMin, 7 * 60) : 9 * 60;

  const place = (durMin, extra) => {
    const slot = nextFreeSlot(blocks, placeFrom, durMin);
    if (!slot) {
      setPlaceMsg("No free slot left today. Move or shrink something first.");
      return;
    }
    setPlaceMsg("");
    addDayBlock?.({ ...extra, date, start: slot.start, end: slot.end });
  };

  const unscheduledTasks = useMemo(() => {
    const linked = new Set(blocks.filter((b) => b.linkType === "task").map((b) => b.linkId));
    // Newest first: the thing you just captured is the thing you most
    // likely want to give a time.
    return tasks
      .filter((t) => !t.done && !linked.has(t.id))
      .slice(-5)
      .reverse();
  }, [tasks, blocks]);

  const todaysWorkouts = useMemo(() => {
    const linked = new Set(blocks.filter((b) => b.linkType === "workout").map((b) => b.linkId));
    return scheduledWorkouts.filter(
      (s) => s.date === date && s.status !== "done" && !linked.has(s.id)
    );
  }, [scheduledWorkouts, blocks, date]);

  const habitChips = useMemo(
    () =>
      goals
        .flatMap((g) => (g.habits || []).map((h) => ({ ...h, goalName: g.name })))
        .slice(0, 6),
    [goals]
  );

  // The reality track: what actually happened on this date, next to the plan.
  // The ‹ › date nav above already answers "what did I do yesterday?".
  const storyCard = (
    <DayStory
      date={date}
      activities={activities}
      workouts={workouts}
      focusLog={focusLog}
      journal={journal}
      meals={meals}
      sleepLog={sleepLog}
      onLogActivity={onLogActivity ? () => onLogActivity(date) : null}
      onRemoveActivity={removeActivity}
      confirmBeforeDelete={confirmBeforeDelete}
    />
  );

  const sidePanel = (
    <div className="dp-side">
      <AssistantReviewPanel />
      {draft && (
        <BlockEditor
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onDelete={removeDraft}
          onDeleteSeries={removeSeries}
          onClose={() => {
            setDraft(null);
            setSelectedId(null);
          }}
          isNew={!draft.id}
          isMobile={isMobile}
        />
      )}

      {/* Chronological list — the accessible mirror of the dial. Phones skip
         it: the agenda timeline above IS the list. */}
      {!isMobile && (
      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Calendar /> Blocks</div>
          <button className="btn ghost sm" onClick={() => openNew(placeFrom, placeFrom + 60)}>
            <Icon.Plus width={13} height={13} /> Add
          </button>
        </div>
        {blocks.length === 0 ? (
          <p className="dp-empty">
            Nothing planned. Drag on the dial (or Add) to carve out time.
          </p>
        ) : (
          <div className="dp-list">
            {blocks.map((b) => {
              const cat = categoryById(b.category);
              return (
                <div key={b.id} className={"dp-row" + (b.done ? " done" : "")}>
                  <button
                    className={"dp-row-check" + (b.done ? " on" : "")}
                    title={b.done ? "Mark not done" : "Mark done"}
                    aria-pressed={b.done}
                    onClick={() => toggleDone(b)}
                  >
                    {b.done && <Icon.Check width={12} height={12} />}
                  </button>
                  <span className="dp-row-dot" style={{ background: cat.color }} />
                  <button className="dp-row-main" onClick={() => openExisting(b.id)}>
                    <span className="dp-row-title">
                      {b.title} {b.protected && <span title="Protected">🔒</span>}
                    </span>
                    <span className="dp-row-time">
                      {minutesToLabel(b.start)} – {minutesToLabel(b.end)}
                    </span>
                  </button>
                  {b.linkType === "workout" && (
                    <button className="btn ghost sm" onClick={onOpenWorkout} title="Open workout">
                      <Icon.Dumbbell width={13} height={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* What actually happened — the plan's reality mirror. */}
      {storyCard}

      {/* Waiting to be placed */}
      {(unscheduledTasks.length > 0 || todaysWorkouts.length > 0 || habitChips.length > 0) && (
        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon.Bolt /> Place onto your day</div>
          </div>
          {placeMsg && <p className="dp-empty" role="status">{placeMsg}</p>}
          {todaysWorkouts.map((w) => (
            <div key={w.id} className="dp-place">
              <span className="dp-place-name"><Icon.Dumbbell width={13} height={13} /> {w.name}</span>
              <button
                className="btn ghost sm"
                onClick={() =>
                  place(60, {
                    title: w.name,
                    category: "exercise",
                    linkType: "workout",
                    linkId: w.id,
                  })
                }
              >
                + 1h
              </button>
            </div>
          ))}
          {unscheduledTasks.map((t) => (
            <div key={t.id} className="dp-place">
              <span className="dp-place-name">{t.text}</span>
              <button
                className="btn ghost sm"
                onClick={() =>
                  place(30, {
                    title: t.text.slice(0, 40),
                    category: "focus",
                    linkType: "task",
                    linkId: t.id,
                  })
                }
              >
                + 30m
              </button>
            </div>
          ))}
          {habitChips.length > 0 && (
            <div className="dp-habits">
              {habitChips.map((h) => (
                <button
                  key={h.id}
                  className="dp-habit-chip"
                  title={`Schedule 15 minutes for "${h.name}"`}
                  onClick={() =>
                    place(15, {
                      title: h.name,
                      category: "personal",
                      linkType: "habit",
                      linkId: h.id,
                    })
                  }
                >
                  + {h.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preferences */}
      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Gear /> Dial preferences</div>
        </div>
        <label className="dp-check">
          <input
            type="checkbox"
            checked={pref.textures}
            onChange={(e) => setPrefs({ ...pref, textures: e.target.checked })}
          />
          Textured blocks (waves, stripes, dots)
        </label>
        <label className="dp-check">
          <input
            type="checkbox"
            checked={pref.showAlarms}
            onChange={(e) => setPrefs({ ...pref, showAlarms: e.target.checked })}
          />
          Show alarms on the dial
        </label>
        <label className="dp-check">
          <input
            type="checkbox"
            checked={pref.showSleepBand}
            onChange={(e) => setPrefs({ ...pref, showSleepBand: e.target.checked })}
          />
          Shade my usual sleep window
        </label>
        {pref.showSleepBand && (
          <div className="dp-editor-times">
            <label className="dp-time">
              <span>Sleep from</span>
              <input
                className="input"
                type="time"
                value={pref.sleepStart}
                onChange={(e) => setPrefs({ ...pref, sleepStart: e.target.value })}
              />
            </label>
            <label className="dp-time">
              <span>Until</span>
              <input
                className="input"
                type="time"
                value={pref.sleepEnd}
                onChange={(e) => setPrefs({ ...pref, sleepEnd: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );

  const viewSeg = (
    <div className="seg dp-view-seg" role="tablist" aria-label="Zoom level">
      {[
        { id: "day", label: "Day" },
        { id: "week", label: "Week" },
        { id: "month", label: "Month" },
      ].map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          className={view === v.id ? "active" : ""}
          onClick={() => setView(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="dp-wrap">
      <div className="page-head dp-head">
        <div>
          <div className="eyebrow">Planner</div>
          <h1 className="page-title">
            {view === "day" ? "Your day, as a shape" : view === "week" ? "Your week" : "Your month"}
          </h1>
          <p className="page-sub">
            {view === "month"
              ? "The wide view. Pick a day, add events (they can repeat), or zoom into the dial."
              : view === "week"
                ? "Seven days at a glance. Tap a day's header to zoom in."
                : isMobile
                  ? "The plan up top, the real story below. Tap any block to edit it."
                  : "Drag empty ring to carve out time; drag a block to move it; click to edit. Protected hours stay put."}
          </p>
        </div>
        <div className="dp-nav">
          {viewSeg}
          {view === "day" && (
            <>
              <button className="iconbtn" title="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
                ‹
              </button>
              {!isToday && (
                <button className="btn ghost sm" onClick={() => setDate(todayKey())}>
                  Today
                </button>
              )}
              <button className="iconbtn" title="Next day" onClick={() => setDate(shiftDay(date, 1))}>
                ›
              </button>
            </>
          )}
        </div>
      </div>

      {view !== "day" && (
        <>
          <NaturalAddBar refDate={date} onDraft={draftFromParsed} signedIn={signedIn} />
          {view === "week" ? (
            <WeekView
              stores={calStores}
              date={date}
              isMobile={isMobile}
              onShiftWeek={(d) => setDate(d == null ? todayKey() : shiftDay(date, d))}
              onOpenDay={(k) => {
                setDate(k);
                setView("day");
              }}
              onNewEvent={(k) => openNew(9 * 60, 10 * 60, { date: k })}
              onEditBlock={(id) => openExisting(id)}
            />
          ) : (
            <MonthView
              stores={calStores}
              selected={date}
              isMobile={isMobile}
              onSelect={setDate}
              onOpenDay={(k) => {
                setDate(k);
                setView("day");
              }}
              onNewEvent={(k) => openNew(9 * 60, 10 * 60, { date: k })}
              onEditBlock={(id) => openExisting(id)}
              onImport={() => setImportOpen(true)}
            />
          )}
          {draft && (
            <BlockEditor
              draft={draft}
              setDraft={setDraft}
              onSave={saveDraft}
              onDelete={removeDraft}
              onDeleteSeries={removeSeries}
              onClose={() => {
                setDraft(null);
                setSelectedId(null);
              }}
              isNew={!draft.id}
              isMobile={isMobile}
              overlay
            />
          )}
          <ScheduleImportSheet
            key={importOpen ? "schimp-open" : "schimp-closed"}
            open={importOpen}
            onClose={() => setImportOpen(false)}
            isMobile={isMobile}
            addDayBlock={addDayBlock}
            defaultDate={date}
          />
        </>
      )}

      {view === "day" && (isMobile ? (
        <>
          {/* Phones get a vertical agenda instead of the dial: block cards
             in time order, tappable free gaps, and a warm now-line. The dial
             stays the instrument for pointer-and-tablet screens. */}
          <div className="card dp-mobile-agenda">
            <div className="dp-mobile-dial-foot" style={{ border: "none", padding: 0, marginBottom: 10 }}>
              <span className="dp-mobile-dial-sum">
                {blocks.length
                  ? `${blocks.length} block${blocks.length === 1 ? "" : "s"} planned`
                  : "A clear day"}
              </span>
              <button
                className="btn primary sm"
                onClick={() => openNew(placeFrom, placeFrom + 60)}
              >
                <Icon.Plus width={13} height={13} /> Add block
              </button>
            </div>
            <MobileDayTimeline
              blocks={blocks}
              isToday={isToday}
              onEdit={openExisting}
              onAddRange={(s, e) => openNew(s, e)}
              onToggleDone={toggleDone}
            />
          </div>
          {sidePanel}
        </>
      ) : (
        <div className="dp-grid">
          <div className="dp-dial-wrap">
            {/* Dial controls: rotate the face and squeeze the sleep hours.
               Both animate; the choices persist in the dial preferences. */}
            <div className="dp-dial-tools">
              {(() => {
                // The dial is ROTATED by pref.dialTopHour hours; the hour that
                // ends up at the top is the inverse of that rotation.
                const topH = (24 - pref.dialTopHour) % 24;
                const topLabel =
                  topH === 0 ? "midnight" : topH === 12 ? "noon"
                    : topH < 12 ? `${topH} am` : `${topH - 12} pm`;
                return (
                  <button
                    type="button"
                    className="iconbtn dp-dial-tool"
                    title={`Rotate the dial (currently ${topLabel} at top)`}
                    onClick={() =>
                      setPrefs((p) => {
                        const cur = { ...DEFAULT_PREFS, ...p };
                        return { ...cur, dialTopHour: (cur.dialTopHour + 6) % 24 };
                      })
                    }
                  >
                    <Icon.Reset width={15} height={15} />
                  </button>
                );
              })()}
              <button
                type="button"
                className={"iconbtn dp-dial-tool" + (pref.compressSleep ? " on" : "")}
                title={pref.compressSleep ? "Show sleep at full size" : "Shrink the sleep hours to expand your day"}
                aria-pressed={pref.compressSleep}
                onClick={() =>
                  setPrefs((p) => {
                    const cur = { ...DEFAULT_PREFS, ...p };
                    return { ...cur, compressSleep: !cur.compressSleep };
                  })
                }
              >
                <Icon.Moon width={15} height={15} />
              </button>
            </div>
            <DayDial
              date={date}
              isToday={isToday}
              blocks={blocks}
              alarms={dialAlarms}
              selectedId={selectedId}
              draftRange={
                draft && hhmmToMinutes(draft.startHH) != null && hhmmToMinutes(draft.endHH) != null
                  ? { start: hhmmToMinutes(draft.startHH), end: hhmmToMinutes(draft.endHH) }
                  : null
              }
              textures={pref.textures}
              sleepStart={pref.sleepStart}
              sleepEnd={pref.sleepEnd}
              showSleepBand={pref.showSleepBand}
              rotateHours={pref.dialTopHour}
              compressSleep={pref.compressSleep}
              onSelect={openExisting}
              onCreateRange={(s, e) => openNew(s, e)}
              onMove={(id, ns, ne) => {
                const b = blocks.find((x) => x.id === id);
                if (b?.protected) return; // protected hours don't move
                updateDayBlock?.(id, { start: ns, end: ne });
              }}
            />
          </div>
          {sidePanel}
        </div>
      ))}
    </div>
  );
}
