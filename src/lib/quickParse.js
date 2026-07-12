/* quickParse — natural-language token parsing for Quick Add.

   The pattern every leading capture tool ships (Todoist, TickTick): you type
   "call mom tomorrow urgent" or "stretch every morning at 7am" and the app
   understands the structured bits without making you touch a form. Ligand's
   version is deliberately conservative:

   - It only extracts what Ligand's model can actually store (Urgent/Today
     labels, daily/weekly repeats, an HH:MM alarm time). No fake due dates.
   - Every extraction is shown to the user as a removable chip BEFORE saving —
     a wrong guess is one tap to undo, never silent data corruption.
   - Time tokens don't hijack the save; they power an optional "make it an
     alarm" suggestion instead.

   Pure functions only — no Date.now() side effects beyond defaults — so the
   whole thing is unit-testable. */

const WEEKDAYS = [
  ["sunday", "sun"],
  ["monday", "mon"],
  ["tuesday", "tue", "tues"],
  ["wednesday", "wed", "weds"],
  ["thursday", "thu", "thur", "thurs"],
  ["friday", "fri"],
  ["saturday", "sat"],
];

const pad = (n) => String(n).padStart(2, "0");

// Strip a matched token and tidy leftover double spaces / dangling connectors.
function stripToken(text, match) {
  return text
    .replace(match, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/** Parse a 12/24h time expression to "HH:MM", or null.
 *  Accepts "7am", "7:30pm", "19:00", "at 7" (bare hours need the "at"). */
export function parseTimeToken(text) {
  // "7am" / "7:30 pm" / "at 7pm"
  let m = text.match(/(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h >= 1 && h <= 12 && min < 60) {
      const isPm = m[3].toLowerCase() === "pm";
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return { time: `${pad(h)}:${pad(min)}`, match: m[0] };
    }
  }
  // 24h with colon: "19:00", "at 7:30"
  m = text.match(/(?:\bat\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) {
    return { time: `${pad(parseInt(m[1], 10))}:${m[2]}`, match: m[0] };
  }
  // bare hour ONLY with an explicit "at": "at 7" (avoids "buy 3 apples")
  m = text.match(/\bat\s+(\d{1,2})\b/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return { time: `${pad(h)}:00`, match: m[0] };
  }
  return null;
}

/** Parse repeat expressions: "every day"/"daily" → daily,
 *  "every monday"/"every mon" → weekly on that weekday (JS getDay: 0=Sun). */
export function parseRepeatToken(text) {
  let m = text.match(/\b(every\s*day|everyday|daily)\b/i);
  if (m) return { repeat: { type: "daily" }, match: m[0] };
  m = text.match(/\bevery\s+([a-z]+)\b/i);
  if (m) {
    const word = m[1].toLowerCase();
    for (let d = 0; d < WEEKDAYS.length; d++) {
      if (WEEKDAYS[d].includes(word)) {
        return { repeat: { type: "weekly", weekday: d }, match: m[0] };
      }
    }
    // "every morning/evening/night" reads as daily intent
    if (["morning", "evening", "night", "afternoon"].includes(word)) {
      return { repeat: { type: "daily" }, match: m[0] };
    }
  }
  return null;
}

/** Parse urgency: "urgent", "asap", trailing "!!"/"!!!". */
export function parseUrgentToken(text) {
  const m = text.match(/\b(urgent|asap)\b|(!{2,})\s*$/i);
  if (m) return { match: m[0] };
  return null;
}

/** Parse "today"/"tonight" → the Today label. */
export function parseTodayToken(text) {
  const m = text.match(/\b(today|tonight|this evening)\b/i);
  if (m) return { match: m[0] };
  return null;
}

/**
 * Full pass over quick-add input. Returns:
 * {
 *   cleanText,           // input with recognized tokens stripped
 *   label,               // "Urgent" | "Today" | null
 *   repeat,              // null | {type:"daily"} | {type:"weekly", weekday}
 *   time,                // "HH:MM" | null — alarm suggestion, never a task field
 *   tokens: [{ kind, display, match }]  // chips, in match order
 * }
 */
export function parseQuickAdd(input) {
  const tokens = [];
  let text = input || "";

  const urgent = parseUrgentToken(text);
  if (urgent) {
    tokens.push({ kind: "urgent", display: "Urgent", match: urgent.match });
    text = stripToken(text, urgent.match);
  }

  const today = !urgent ? parseTodayToken(text) : parseTodayToken(text);
  if (today) {
    tokens.push({ kind: "today", display: "Today", match: today.match });
    text = stripToken(text, today.match);
  }

  const repeat = parseRepeatToken(text);
  if (repeat) {
    const disp =
      repeat.repeat.type === "daily"
        ? "Repeats daily"
        : `Every ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][repeat.repeat.weekday]}`;
    tokens.push({ kind: "repeat", display: disp, match: repeat.match });
    text = stripToken(text, repeat.match);
  }

  const time = parseTimeToken(text);
  if (time) {
    // Display in the local 12h style for readability.
    const [h, m] = time.time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    tokens.push({
      kind: "time",
      display: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      match: time.match,
    });
    text = stripToken(text, time.match);
  }

  return {
    cleanText: text,
    label: urgent ? "Urgent" : today ? "Today" : null,
    repeat: repeat ? repeat.repeat : null,
    time: time ? time.time : null,
    tokens,
  };
}

export default parseQuickAdd;
