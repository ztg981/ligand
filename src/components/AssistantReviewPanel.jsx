import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { Icon } from "./Icons.jsx";
import "./AssistantReviewPanel.css";

export default function AssistantReviewPanel() {
  const { user } = useAuth();
  const [marks, setMarks] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error } = await supabase
      .from("assistant_review_marks")
      .select("id,item_type,item_id,label,reason,created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) setMarks(Array.isArray(data) ? data : []);
  }, [user]);

  useEffect(() => {
    const initialLoad = window.setTimeout(load, 0);
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const resolve = async (id) => {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase
      .from("assistant_review_marks")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (!error) setMarks((current) => current.filter((mark) => mark.id !== id));
  };

  if (!user || marks.length === 0) return null;

  return (
    <section className="card assistant-review-card">
      <div className="card-head">
        <div className="card-title"><Icon.Pin /> Review marks from ChatGPT</div>
        <span className="assistant-review-count">{marks.length}</span>
      </div>
      <div className="assistant-review-list">
        {marks.map((mark) => (
          <div className="assistant-review-row" key={mark.id}>
            <div className="assistant-review-copy">
              <strong>{mark.label}</strong>
              <span>{mark.reason}</span>
            </div>
            <button
              type="button"
              className="iconbtn sm"
              title="Done reviewing"
              aria-label={`Done reviewing ${mark.label}`}
              onClick={() => resolve(mark.id)}
              disabled={busyId === mark.id}
            >
              <Icon.Check width={13} height={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
