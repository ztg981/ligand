import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
import "./OnboardingTour.css";

/* ============================================================
   OnboardingTour — a guided first-run walkthrough.

   Shows a spotlight overlay that dims the app and highlights one
   real element at a time (the nav, quick-add, focus, and so on),
   with a small card explaining it. A few steps switch tabs so the
   real screen shows behind the cutout. It ends by walking the
   user through creating their first goal and a couple of habits.

   Everything is optional: a Skip control ends the tour at any
   point, and it can be replayed from the profile menu. The parent
   owns whether it's open and what "done" means (see App.jsx).

   Props:
     open          — render + run the tour when true
     isMobile      — pick mobile vs desktop spotlight targets
     initialName   — prefill the name field (empty for a fresh guest)
     onSaveName    — (name) => void, persists the profile name
     setTab        — (tabId) => void, drives the app behind the tour
     onCreateGoal  — ({ name, starterHabits }) => goal, makes it real
     onFinish      — () => void, tour is done or skipped
   ============================================================ */

// One entry per step. `target` is a CSS selector for the element to
// spotlight; `mobileTarget` overrides it on phones. A step with no target
// (or whose target isn't on screen) shows a centered card instead.
const STEPS = [
  { kind: "welcome" },
  {
    kind: "spotlight",
    tab: "home",
    target: "[data-tour='nav']",
    mobileTarget: "[data-tour='nav-mobile']",
    icon: "Home",
    title: "Everything lives here",
    body: "Goals, habits, tasks, focus, notes, journal, sleep and workouts. Tap around whenever you like. Nothing is locked away.",
  },
  {
    kind: "spotlight",
    tab: "habits",
    icon: "CheckCircle",
    title: "Build habits that stick",
    body: "Check off a habit each day and watch the streak grow. Small and daily beats big and rare.",
  },
  {
    kind: "spotlight",
    tab: "pomodoro",
    target: "[data-tour='focus']",
    icon: "Bolt",
    title: "Get into deep focus",
    body: "Run a Pomodoro timer, or flip on Hyperfocus for a calm, locked-in screen when you really need to concentrate.",
  },
  {
    kind: "spotlight",
    tab: "home",
    target: "[data-tour='quickadd']",
    mobileTarget: "[data-tour='quickadd-mobile']",
    icon: "Plus",
    title: "Capture in one tap",
    body: "Add a task, note, workout, alarm or focus session from here without losing your place.",
  },
  {
    kind: "spotlight",
    tab: "stats",
    icon: "Grid",
    title: "See your progress",
    body: "Stats turn your days into a clear picture, and badges celebrate the milestones along the way.",
  },
  {
    kind: "spotlight",
    tab: "home",
    target: "[data-tour='theme']",
    icon: "Wand",
    title: "Make it yours",
    body: "Light or dark, your own accent color, wallpapers and sounds. Set it up once and it follows you across devices.",
  },
  { kind: "goal" },
  { kind: "habits" },
  { kind: "finish" },
];

const GOAL_SUGGESTIONS = [
  "Get fit",
  "Read more",
  "Learn a language",
  "Save money",
  "Sleep better",
];

const HABIT_SUGGESTIONS = [
  "Drink water",
  "Walk 20 min",
  "Read 10 pages",
  "No phone in bed",
  "Stretch",
  "Journal",
];

export default function OnboardingTour({
  open,
  isMobile = false,
  initialName = "",
  onSaveName,
  setTab,
  onCreateGoal,
  onFinish,
}) {
  const [i, setI] = useState(0);
  const [name, setName] = useState(initialName);
  const [goalName, setGoalName] = useState("");
  const [habits, setHabits] = useState(["", "", ""]);
  const [rect, setRect] = useState(null);
  const createdRef = useRef(false);

  const step = STEPS[i];
  const last = STEPS.length - 1;

  // The component stays mounted while closed (open just gates rendering), so
  // reset back to the first step every time it opens — otherwise "Replay
  // intro" would resume wherever the last run left off.
  useEffect(() => {
    if (!open) return;
    setI(0);
    setGoalName("");
    setHabits(["", "", ""]);
    setName(initialName);
    createdRef.current = false;
    // initialName is intentionally read only at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Switch the app to the step's tab so the real screen shows behind the
  // spotlight. Runs whenever the step changes.
  useEffect(() => {
    if (!open) return;
    if (step?.tab) setTab?.(step.tab);
  }, [open, i, step?.tab, setTab]);

  // Measure the element to spotlight. Waits a beat after a tab switch so the
  // new screen has laid out, then re-measures on resize/scroll. Falls back to
  // a centered card when there's no target or it isn't visible (e.g. a
  // desktop-only control on a phone).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const sel = step?.kind === "spotlight"
      ? (isMobile ? step.mobileTarget || step.target : step.target)
      : null;
    if (!sel) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      setRect(null);
    };
    // A tab switch needs a beat to lay out; measure a couple of times to catch
    // it. Plain timeouts (not rAF) so this still runs if the page is hidden.
    const delays = step?.tab ? [60, 200, 340] : [0, 120];
    const timers = delays.map((d) => window.setTimeout(measure, d));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, i, isMobile, step]);

  if (!open) return null;

  const commitName = () => {
    const clean = name.trim();
    if (clean) onSaveName?.(clean);
  };

  const finish = (nav) => {
    commitName();
    onFinish?.(nav);
  };

  // Create the goal + habits the user entered, once. Called when leaving the
  // habits step. A blank goal name just skips creation.
  const commitGoal = () => {
    if (createdRef.current) return;
    const gName = goalName.trim();
    if (!gName) return;
    createdRef.current = true;
    const starterHabits = habits.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    onCreateGoal?.({ name: gName, starterHabits });
  };

  const next = () => {
    if (step.kind === "welcome") commitName();
    if (step.kind === "habits") commitGoal();
    if (i >= last) {
      finish(createdRef.current ? "goal" : "home");
      return;
    }
    setI((n) => Math.min(n + 1, last));
  };

  const back = () => setI((n) => Math.max(n - 1, 0));

  // --- card placement: below the spotlight if there's room, else above,
  // else centered. Kept clamped to the viewport with a small margin.
  const CARD_W = isMobile ? Math.min(340, window.innerWidth - 28) : 380;
  const MARGIN = 14;
  let cardStyle;
  if (rect) {
    const below = rect.top + rect.height + 320 < window.innerHeight;
    const top = below
      ? rect.top + rect.height + MARGIN
      : Math.max(MARGIN, rect.top - MARGIN - 300);
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - CARD_W - MARGIN));
    cardStyle = { top, left, width: CARD_W, transform: "none" };
  } else {
    cardStyle = {
      top: "50%",
      left: "50%",
      width: CARD_W,
      transform: "translate(-50%, -50%)",
    };
  }

  const StepIcon = step.icon ? Icon[step.icon] : null;
  const stepNum = i; // welcome is 0; show 1-based over the walkthrough range
  const walkTotal = last; // steps after welcome, up to finish

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Welcome tour">
      {rect ? (
        <div
          className="tour-spot"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour-scrim" aria-hidden="true" />
      )}

      <div className="tour-card" style={cardStyle}>
        {step.kind !== "welcome" && step.kind !== "finish" && (
          <button className="tour-skip" onClick={() => finish("home")}>
            Skip
          </button>
        )}

        {step.kind === "welcome" && (
          <div className="tour-welcome">
            <span className="tour-badge"><span className="brand-dot" /></span>
            <h2 className="tour-title">Welcome to Ligand</h2>
            <p className="tour-body">
              One calm home for your goals, habits, focus time and journal.
              What should we call you?
            </p>
            <input
              className="input tour-name"
              type="text"
              autoFocus
              placeholder="Your name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
            />
            <div className="tour-actions">
              <button className="btn primary tour-cta" onClick={next}>
                Take the tour
              </button>
              <button className="btn ghost" onClick={() => finish("home")}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step.kind === "spotlight" && (
          <div className="tour-step">
            {StepIcon && (
              <span className="tour-step-ic"><StepIcon /></span>
            )}
            <h3 className="tour-title sm">{step.title}</h3>
            <p className="tour-body">{step.body}</p>
            <TourNav
              num={stepNum}
              total={walkTotal}
              onBack={back}
              onNext={next}
              nextLabel="Next"
            />
          </div>
        )}

        {step.kind === "goal" && (
          <div className="tour-step">
            <span className="tour-step-ic"><Icon.Target /></span>
            <h3 className="tour-title sm">Set your first goal</h3>
            <p className="tour-body">
              What's one thing you'd like to work toward? You can rename or
              remove it later.
            </p>
            <input
              className="input tour-name"
              type="text"
              autoFocus
              placeholder="e.g. Get fit"
              value={goalName}
              maxLength={60}
              onChange={(e) => setGoalName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
            />
            <div className="tour-chips">
              {GOAL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="tour-chip"
                  onClick={() => setGoalName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <TourNav
              num={stepNum}
              total={walkTotal}
              onBack={back}
              onNext={next}
              nextLabel={goalName.trim() ? "Next" : "Skip this"}
            />
          </div>
        )}

        {step.kind === "habits" && (
          <div className="tour-step">
            <span className="tour-step-ic"><Icon.CheckCircle /></span>
            <h3 className="tour-title sm">
              {goalName.trim() ? `Add habits for "${goalName.trim()}"` : "Add a few habits"}
            </h3>
            <p className="tour-body">
              Small daily actions that move you forward. Add up to three, or
              leave them blank and add your own later.
            </p>
            <div className="tour-habits">
              {habits.map((h, idx) => (
                <input
                  key={idx}
                  className="input"
                  type="text"
                  placeholder={`Habit ${idx + 1}`}
                  value={h}
                  maxLength={50}
                  onChange={(e) =>
                    setHabits((arr) => arr.map((v, k) => (k === idx ? e.target.value : v)))
                  }
                />
              ))}
            </div>
            <div className="tour-chips">
              {HABIT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="tour-chip"
                  onClick={() =>
                    setHabits((arr) => {
                      if (arr.includes(s)) return arr;
                      const slot = arr.findIndex((v) => !v.trim());
                      if (slot === -1) return arr;
                      return arr.map((v, k) => (k === slot ? s : v));
                    })
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <TourNav
              num={stepNum}
              total={walkTotal}
              onBack={back}
              onNext={next}
              nextLabel="Next"
            />
          </div>
        )}

        {step.kind === "finish" && (
          <div className="tour-welcome">
            <span className="tour-badge tour-badge-done"><Icon.Check /></span>
            <h2 className="tour-title">You're all set{name.trim() ? `, ${name.trim()}` : ""}</h2>
            <p className="tour-body">
              That's the tour. Want to see it again? It's under your profile
              menu, top right, as Replay intro. Now go make today count.
            </p>
            <div className="tour-actions">
              <button
                className="btn primary tour-cta"
                onClick={() => finish(createdRef.current ? "goal" : "home")}
              >
                Start
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TourNav({ num, total, onBack, onNext, nextLabel = "Next" }) {
  return (
    <div className="tour-nav">
      <div className="tour-dots" aria-hidden="true">
        {Array.from({ length: total }).map((_, k) => (
          <span key={k} className={"tour-dot" + (k + 1 === num ? " on" : "")} />
        ))}
      </div>
      <div className="tour-nav-btns">
        {num > 1 && (
          <button className="btn ghost sm" onClick={onBack}>
            Back
          </button>
        )}
        <button className="btn primary sm" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
