# Research Notes — Overnight Product Pass (2026-07-07)

Working notes on the evidence and reasoning behind this session's product
choices. Kept honest: these are design-informing findings, not medical
claims; Ligand does not treat or diagnose anything.

## Principles applied and their grounding

1. **Externalized memory / quick capture.** Working-memory limits are a core
   executive-function difficulty (Barkley's model of ADHD as an EF/working-
   memory disorder; CBT-for-adult-ADHD manuals like Safren et al. build
   their first module around a single capture system). Product implication:
   ONE always-reachable capture point with near-zero friction.
   → Built: unified Quick Add (task/note/workout/alarm/focus) as a floating
   button on the phone and a topbar `+` on desktop. One field first, chips
   reroute it; Enter saves.

2. **Time blindness → make time spatial.** Research on time perception in
   ADHD (Barkley et al. on time reproduction deficits) and the popularity of
   analog "time timer" clocks suggest showing time as a finite shape helps.
   The Reassign-style circular day (screenshots provided) is a strong
   pattern here — used as INSPIRATION only, not cloned.
   → Built: DayRing on Home — 24h dial, elapsed time filled, real events
   only (completed workouts, alarms, now-marker, hours-left counter). We
   deliberately did NOT fake time-blocks for untimed tasks.

3. **Task initiation → shrink the first step.** Implementation-intention
   research (Gollwitzer's "when X, I will Y" meta-analyses) and behavioral-
   activation practice support tiny concrete starts.
   → Built: Quick Add's Focus chip carries a "start for five minutes" nudge;
   the existing "Pick one thing" card already covers choice-narrowing.

4. **Forgiving recovery, no shame mechanics.** Habit research (Lally et al.
   2010) found single missed days don't break habit formation; guilt-based
   streak resets are motivation-toxic for the exact users who need help.
   → Preserved/extended: "Quiet days never count against you", pause-not-
   shatter streaks; the new Fuel suggestions are additive-only, with a
   PROPERTY TEST asserting no suggestion can contain restrictive language.

5. **Low-stimulation option.** Sensory sensitivity co-occurs with ADHD/ASD;
   WCAG's reduced-motion guidance points the same way.
   → Built: "Low Stim" dark palette (muted contrast deltas, desaturated
   accent, ambient animation off), alongside High Contrast for the opposite
   need. Palettes are per-mode so auto light/dark switching respects both.

6. **Nutrition without diet culture.** Eating-disorder screening literature
   flags calorie counting and food moralization as risk factors, especially
   for teens. NEDA and similar guidance: track behaviors gently, never
   assign moral value to foods.
   → Built: Fuel logs meal names + balance chips only; no calories, no
   scores, no "good/bad"; a visible note routes personal dietary needs to
   qualified professionals.

## Considered and rejected

- **Full drag-to-create circular day planner** (Reassign-style): rejected
  for this pass — Ligand has no timed-task model yet, so an interactive
  dial would either fake data or demand a large new scheduling model
  mid-sprint. The DayRing ships the time-visibility value now; a
  block-scheduling model is the documented next iteration.
- **Streak freezes / gamified tokens**: adds a currency to manage — more
  executive load, not less.
- **AI everywhere**: kept AI at two chokepoints (workout parsing, weekly
  insight) with deterministic fallbacks; every other "smart" behavior is
  a legible rule.
- **Calorie/macros mode**: rejected on safety grounds (teen users), not
  effort.

## Sources consulted (types)

Peer-reviewed EF/ADHD literature summaries (Barkley; Safren CBT manual),
habit-formation research (Lally 2010, Gollwitzer implementation
intentions), WCAG 2.2 guidance (contrast, reduced motion, target size),
NEDA-style eating-disorder-safe design guidance, plus product-pattern
review of Reassign (provided screenshots), Strong/Hevy (workout logging),
and Time Timer (visual time). Anecdotal community patterns (ADHD
subreddits' recurring "I need one inbox" / "lists rot" complaints) were
treated as inspiration, not evidence.
