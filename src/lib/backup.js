const ONE_MIB = 1024 * 1024;

export const MAX_BACKUP_BYTES = 6 * ONE_MIB;

export const BACKUP_KEYS = Object.freeze([
  "ligand.data",
  "ligand.settings",
  "ligand.mobileSettings",
  "ligand.tweaks",
  "ligand.mobileTweaks",
  "ligand.mobileTheme",
  "ligand.pomodoro",
  "ligand.pomodoroPresets",
  "ligand.userPresets",
  "ligand.customWallpapers",
  "ligand.hyperfocus",
  "ligand.lastVisit",
  "ligand.visitDates",
  "ligand.activeDays",
  "ligand.activeDaysDay",
  "ligand.badges",
  "ligand.badgesKnown",
  "ligand.notifications",
  "ligand.journalSort",
  "ligand.focusTaskId",
  "ligand.activeWorkout",
  "ligand.pickOneHiddenDate",
  "ligand.goalSidebarCollapsed",
]);

const BACKUP_KEY_SET = new Set(BACKUP_KEYS);

function byteLength(text) {
  if (typeof Blob !== "undefined") return new Blob([text]).size;
  return new TextEncoder().encode(text).byteLength;
}

function isPlainJsonValue(value, depth = 0) {
  if (depth > 40) return false;
  if (value == null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return Number.isFinite(value) || t !== "number";
  }
  if (Array.isArray(value)) {
    return value.every((item) => isPlainJsonValue(item, depth + 1));
  }
  if (t === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value).every((item) => isPlainJsonValue(item, depth + 1));
  }
  return false;
}

export function safeBackupFilename(date = new Date()) {
  return `ligand-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function buildBackup(storage) {
  const dump = {};
  for (const key of BACKUP_KEYS) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw);
      if (isPlainJsonValue(value)) dump[key] = value;
    } catch {
      // Skip malformed local entries instead of blocking the user's backup.
    }
  }
  return dump;
}

export function serializeBackup(storage) {
  return JSON.stringify(buildBackup(storage), null, 2);
}

export function validateBackupText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "That backup file is empty." };
  }
  if (byteLength(text) > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      error: `That backup is larger than ${MAX_BACKUP_BYTES / ONE_MIB} MB. Export or import smaller Ligand backups only.`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "Couldn't read the backup file. Is it valid JSON?",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "That backup does not look like a Ligand export.",
    };
  }

  const clean = {};
  const ignored = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (!BACKUP_KEY_SET.has(key)) {
      ignored.push(key);
      continue;
    }
    if (!isPlainJsonValue(value)) {
      return {
        ok: false,
        error: `The backup value for ${key} is not safe JSON.`,
      };
    }
    clean[key] = value;
  }

  if (Object.keys(clean).length === 0) {
    return {
      ok: false,
      error: "That backup did not contain any Ligand data keys.",
    };
  }

  return { ok: true, data: clean, ignored };
}

export function applyBackupData(storage, data) {
  for (const [key, value] of Object.entries(data || {})) {
    if (!BACKUP_KEY_SET.has(key)) continue;
    storage.setItem(key, JSON.stringify(value));
  }
}

export function downloadBackup(storage = window.localStorage, doc = document) {
  const text = serializeBackup(storage);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = safeBackupFilename();
  a.click();
  URL.revokeObjectURL(url);
}

export function readBackupFile(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve({ ok: false, error: "Choose a Ligand backup file first." });
      return;
    }
    if (file.size > MAX_BACKUP_BYTES) {
      resolve({
        ok: false,
        error: `That backup is larger than ${MAX_BACKUP_BYTES / ONE_MIB} MB. Export or import smaller Ligand backups only.`,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => resolve(validateBackupText(String(ev.target?.result || "")));
    reader.onerror = () =>
      resolve({
        ok: false,
        error: "Couldn't read the backup file. Try exporting it again.",
      });
    reader.readAsText(file);
  });
}
