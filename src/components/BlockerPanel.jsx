import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { useLocalStorage } from "../hooks/useLocalStorage.js";

/* BlockerPanel — focus-mode website blocker (Windows desktop app only).

   Empowering, not punitive: you choose what to silence while you focus, one
   click flips it on, and everything is always restored when Ligand closes. The
   actual work happens in the main process (electron/appBlocker.js) via the
   Windows hosts file; this is just the control surface.

   Rendered only when window.electron.blocker exists (packaged/dev Electron on
   Windows), so it's inert on web/PWA and other platforms. */

const PRESET_META = [
  { id: "social", label: "Social", icon: "💬" },
  { id: "video", label: "Video", icon: "📺" },
  { id: "gaming", label: "Gaming", icon: "🎮" },
  { id: "news", label: "News", icon: "📰" },
];

export default function BlockerPanel() {
  const blocker = typeof window !== "undefined" && window.electron?.blocker;
  const [store, setStore] = useLocalStorage("ligand.blocker", {
    presets: ["social"],
    custom: [],
    autoFocus: false,
  });
  const [status, setStatus] = useState({ supported: true, active: false, blocked: [], presets: {} });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [customInput, setCustomInput] = useState("");

  const refresh = useCallback(async () => {
    if (!blocker) return;
    try {
      const s = await blocker.status();
      setStatus(s || {});
    } catch {
      /* ignore */
    }
  }, [blocker]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!blocker) return null; // web / non-Windows — nothing to show

  const presetDomains = status.presets || {};
  // The full set of domains the current selection would block.
  const selectedDomains = [
    ...new Set([
      ...store.presets.flatMap((p) => presetDomains[p] || []),
      ...store.custom,
    ]),
  ];

  const togglePreset = (id) =>
    setStore((s) => ({
      ...s,
      presets: s.presets.includes(id)
        ? s.presets.filter((p) => p !== id)
        : [...s.presets, id],
    }));

  const addCustom = () => {
    const d = customInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!d) return;
    setStore((s) => ({ ...s, custom: [...new Set([...s.custom, d])] }));
    setCustomInput("");
  };
  const removeCustom = (d) =>
    setStore((s) => ({ ...s, custom: s.custom.filter((x) => x !== d) }));

  const start = async () => {
    if (!selectedDomains.length) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await blocker.apply(selectedDomains);
      if (!res.ok) setMsg(res.cancelled ? "Blocking needs admin approval to edit the hosts file." : res.error || "Couldn't start the block.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await blocker.clear();
      if (!res.ok) setMsg(res.error || "Couldn't lift the block.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card blocker-card">
      <div className="card-head">
        <div className="card-title"><Icon.Bolt /> Focus block</div>
      </div>

      {status.active ? (
        <div className="blocker-active">
          <div className="blocker-active-badge">
            <span className="blocker-active-dot" />
            You're in focus mode
          </div>
          <p className="blocker-active-sub">
            {status.blocked?.length || selectedDomains.length} site
            {(status.blocked?.length || selectedDomains.length) === 1 ? "" : "s"} are
            out of reach. Distractions can wait.
          </p>
          <button className="btn blocker-stop" onClick={stop} disabled={busy}>
            {busy ? "Lifting…" : "End focus block"}
          </button>
        </div>
      ) : (
        <>
          <p className="blocker-sub">
            Silence the sites that pull you away. Pick a preset or add your own,
            then start a block while you work.
          </p>

          <div className="blocker-presets">
            {PRESET_META.map((p) => (
              <button
                key={p.id}
                className={"blocker-preset" + (store.presets.includes(p.id) ? " on" : "")}
                onClick={() => togglePreset(p.id)}
                type="button"
              >
                <span className="blocker-preset-ic">{p.icon}</span>
                {p.label}
                <span className="blocker-preset-n">{(presetDomains[p.id] || []).length}</span>
              </button>
            ))}
          </div>

          <div className="blocker-custom">
            <input
              className="input"
              placeholder="Add a site (e.g. news.ycombinator.com)"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
            />
            <button className="btn sm" onClick={addCustom} type="button">Add</button>
          </div>

          {store.custom.length > 0 && (
            <div className="blocker-chips">
              {store.custom.map((d) => (
                <span key={d} className="blocker-chip">
                  {d}
                  <button onClick={() => removeCustom(d)} title={`Remove ${d}`}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="blocker-count">
            {selectedDomains.length
              ? `${selectedDomains.length} site${selectedDomains.length === 1 ? "" : "s"} will be blocked`
              : "Nothing selected yet"}
          </div>

          <button
            className="btn primary blocker-start"
            onClick={start}
            disabled={busy || !selectedDomains.length}
          >
            {busy ? "Starting…" : "Start focus block"}
          </button>
        </>
      )}

      {msg && <div className="blocker-msg">{msg}</div>}

      <label className="blocker-auto">
        <input
          type="checkbox"
          checked={store.autoFocus}
          onChange={(e) => setStore((s) => ({ ...s, autoFocus: e.target.checked }))}
        />
        <span>Auto-block whenever Hyperfocus is on</span>
      </label>

      <p className="blocker-note">
        Blocking edits your Windows hosts file, so Windows asks for admin
        approval once when it changes. Sites are always unblocked when you close
        Ligand. Requires admin rights on this PC.
      </p>
    </div>
  );
}
