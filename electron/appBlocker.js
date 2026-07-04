// App/website blocker (Windows) — a focus-mode site blocker in the spirit of
// Cold Turkey / Freedom.
//
// Mechanism: rewrite the Windows hosts file so blocked domains resolve to
// 127.0.0.1 (a dead end). All of Ligand's entries live between two marker lines
// so cleanup is surgical — we never touch anything else in the file:
//
//   # LIGAND-BLOCK-START
//   127.0.0.1 instagram.com
//   ...
//   # LIGAND-BLOCK-END
//
// Editing the hosts file needs admin rights. Reading it does not, so we compute
// the new content unprivileged and only elevate for the write: if a direct
// write fails with EPERM we relaunch just the copy step via PowerShell
// `Start-Process -Verb RunAs`, which shows ONE UAC prompt. If the user is
// already running elevated (or has been granted write access), no prompt shows
// at all.
//
// Safety: the block is tied to the app being open. We reconcile on startup and
// clear on quit, and expose a "leftover block detected" signal so a crash or
// force-quit can be recovered from gracefully rather than silently leaving sites
// blocked forever.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const START = "# LIGAND-BLOCK-START";
const END = "# LIGAND-BLOCK-END";

const HOSTS_PATH = path.join(
  process.env.WINDIR || "C:\\Windows",
  "System32",
  "drivers",
  "etc",
  "hosts"
);

// Preset domain groups. Kept deliberately small and mainstream — the goal is
// removing the biggest reflexive time-sinks, not an exhaustive blocklist.
const PRESETS = {
  social: [
    "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
    "reddit.com", "snapchat.com", "linkedin.com", "tumblr.com", "pinterest.com",
  ],
  video: [
    "youtube.com", "netflix.com", "twitch.tv", "hulu.com", "disneyplus.com",
    "primevideo.com",
  ],
  gaming: [
    "steampowered.com", "epicgames.com", "roblox.com", "ign.com", "chess.com",
  ],
  news: [
    "cnn.com", "foxnews.com", "buzzfeed.com", "dailymail.co.uk",
  ],
};

function isWindows() {
  return process.platform === "win32";
}

function readHosts() {
  try {
    return fs.readFileSync(HOSTS_PATH, "utf8");
  } catch {
    return "";
  }
}

function hasBlock(content = readHosts()) {
  return content.includes(START) && content.includes(END);
}

// Everything with our block region removed (and trailing whitespace tidied).
function stripBlock(content) {
  const re = new RegExp(`\\r?\\n?${START}[\\s\\S]*?${END}`, "g");
  return content.replace(re, "").replace(/[\r\n]+$/g, "") + "\r\n";
}

// Normalise a user-entered domain: drop scheme/path/www, lowercase.
function normalizeDomain(d) {
  return String(d || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

function buildBlockText(domains) {
  const clean = [...new Set((domains || []).map(normalizeDomain).filter(Boolean))];
  if (!clean.length) return "";
  const lines = [START, `# Added by Ligand focus mode — removed automatically.`];
  for (const d of clean) {
    lines.push(`127.0.0.1 ${d}`);
    lines.push(`127.0.0.1 www.${d}`);
  }
  lines.push(END);
  return lines.join("\r\n");
}

// Write the hosts file, elevating only if a direct write is denied.
function writeHosts(newContent) {
  return new Promise((resolve) => {
    // 1) Try a direct write (works when elevated or already permitted).
    try {
      fs.writeFileSync(HOSTS_PATH, newContent, "utf8");
      flushDns();
      resolve({ ok: true, elevated: false });
      return;
    } catch (err) {
      if (err && err.code !== "EPERM" && err.code !== "EACCES") {
        resolve({ ok: false, error: err.message });
        return;
      }
    }

    // 2) Elevated fallback: stage the content in temp, then copy it into place
    //    from an elevated PowerShell (one UAC prompt).
    const tmp = path.join(os.tmpdir(), `ligand-hosts-${Date.now()}.txt`);
    const ps1 = path.join(os.tmpdir(), `ligand-block-${Date.now()}.ps1`);
    try {
      fs.writeFileSync(tmp, newContent, "utf8");
      fs.writeFileSync(
        ps1,
        [
          "$ErrorActionPreference='Stop'",
          `Copy-Item -LiteralPath '${tmp}' -Destination '${HOSTS_PATH}' -Force`,
          "ipconfig /flushdns | Out-Null",
        ].join("\r\n"),
        "utf8"
      );
    } catch (err) {
      resolve({ ok: false, error: `Could not stage the update: ${err.message}` });
      return;
    }

    // Outer (non-elevated) PowerShell launches the elevated child and waits,
    // forwarding its exit code. A cancelled UAC prompt makes Start-Process
    // throw, which we surface as a clean "cancelled" result.
    const outer = `try { $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${ps1}'; exit $p.ExitCode } catch { exit 1223 }`;

    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", outer],
      { windowsHide: true }
    );
    child.on("exit", (code) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      try { fs.unlinkSync(ps1); } catch { /* ignore */ }
      if (code === 0) resolve({ ok: true, elevated: true });
      else if (code === 1223) resolve({ ok: false, cancelled: true, error: "Permission was declined." });
      else resolve({ ok: false, error: `Update failed (code ${code}).` });
    });
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

function flushDns() {
  try {
    spawn("ipconfig", ["/flushdns"], { windowsHide: true });
  } catch { /* best-effort */ }
}

// ---- public API --------------------------------------------------------
let _blockedDomains = [];

async function apply(domains) {
  if (!isWindows()) return { ok: false, error: "Blocking is Windows-only." };
  const content = stripBlock(readHosts());
  const block = buildBlockText(domains);
  const next = block ? `${content}${block}\r\n` : content;
  const res = await writeHosts(next);
  if (res.ok) _blockedDomains = block ? [...new Set((domains || []).map(normalizeDomain).filter(Boolean))] : [];
  return { ...res, blocked: _blockedDomains };
}

async function clear() {
  if (!isWindows()) return { ok: true, blocked: [] };
  if (!hasBlock()) {
    _blockedDomains = [];
    return { ok: true, blocked: [] };
  }
  const next = stripBlock(readHosts());
  const res = await writeHosts(next);
  if (res.ok) _blockedDomains = [];
  return { ...res, blocked: _blockedDomains };
}

function status() {
  return {
    supported: isWindows(),
    active: hasBlock(),
    blocked: _blockedDomains,
    presets: PRESETS,
  };
}

module.exports = { apply, clear, status, PRESETS, hasBlock, HOSTS_PATH };
