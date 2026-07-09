import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import DayDial from "../components/DayDial.jsx";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { todayKey, shiftDay } from "../lib/model.js";
import {
  BLOCK_CATEGORIES,
  categoryById,
  minutesToHHMM,
  hhmmToMinutes,
  minutesToLabel,
  nextFreeSlot,
} from "../lib/dayPlanner.js";

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
};

function BlockEditor({ draft, setDraft, onSave, onDelete, onClose, isNew }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const valid =
    draft.title.trim() &&
    hhmmToMinutes(draft.startHH) != null &&
    hhmmToMinutes(draft.endHH) != null &&
    hhmmToMinutes(draft.endHH) > hhmmToMinutes(draft.startHH);
  return (
    <div className="card dp-editor">
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
        Protected — this hour doesn't move when plans change
      </label>
      <div className="dp-editor-actions">
        {!isNew && (
          <button className="btn ghost sm dp-danger" onClick={onDelete}>
            <Icon.Trash width={13} height={13} /> Remove
          </button>
        )}
        <button
          className="btn primary sm"
          onClick={onSave}
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5 }}
        >
          <Icon.Check width={13} height={13} /> {isNew ? "Add block" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function DayPlanner({
  dayBlocks = [],
  addDayBlock,
  updateDayBlock,
  deleteDayBlock,
  tasks = [],
  toggleTask,
  goals = [],
  scheduledWorkouts = [],
  alarms = [],
  onOpenWorkout,
}) {
  const isMobile = useIsMobile(768);
  const [date, setDate] = useState(todayKey);
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
      title: extra.title || "",
      startHH: minutesToHHMM(start),
      endHH: minutesToHHMM(end),
      category: extra.category || "focus",
      protected: false,
      linkType: extra.linkType || null,
      linkId: extra.linkId || null,
    });

  const openExisting = (id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    setSelectedId(id);
    setDraft({
      id,
      title: b.title,
      startHH: minutesToHHMM(b.start),
      endHH: minutesToHHMM(b.end),
      category: b.category,
      protected: b.protected,
      linkType: b.linkType,
      linkId: b.linkId,
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
    if (draft.id) updateDayBlock?.(draft.id, fields);
    else addDayBlock?.({ ...fields, date });
    setDraft(null);
    setSelectedId(null);
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
      setPlaceMsg("No free slot left today — move or shrink something first.");
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

  const sidePanel = (
    <div className="dp-side">
      {draft && (
        <BlockEditor
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onDelete={removeDraft}
          onClose={() => {
            setDraft(null);
            setSelectedId(null);
          }}
          isNew={!draft.id}
        />
      )}

      {/* Chronological list — the accessible mirror of the dial. */}
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
                Place 1h
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
                Place 30m
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

  return (
    <div className="dp-wrap">
      <div className="page-head dp-head">
        <div>
          <div className="eyebrow">Planner</div>
          <h1 className="page-title">Your day, as a shape</h1>
          <p className="page-sub">
            Drag on the dial to carve out time. Protected hours stay put when
            the day moves.
          </p>
        </div>
        <div className="dp-nav">
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
        </div>
      </div>

      {isMobile ? (
        <>
          <p className="dp-mobile-note">
            The full dial lives on a bigger screen — here's the list view.
            Today's shape also shows on Home.
          </p>
          {sidePanel}
        </>
      ) : (
        <div className="dp-grid">
          <div className="dp-dial-wrap">
            <DayDial
              date={date}
              isToday={isToday}
              blocks={blocks}
              alarms={dialAlarms}
              selectedId={selectedId}
              textures={pref.textures}
              sleepStart={pref.sleepStart}
              sleepEnd={pref.sleepEnd}
              showSleepBand={pref.showSleepBand}
              onSelect={openExisting}
              onCreateRange={(s, e) => openNew(s, e)}
            />
          </div>
          {sidePanel}
        </div>
      )}
    </div>
  );
}
