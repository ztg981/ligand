import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

export default function FindBar({ onClose }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState({ activeMatchOrdinal: 0, matches: 0 });
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();

    if (window.electron?.find) {
      const unsubscribe = window.electron.find.onResult((res) => {
        setResult({
          activeMatchOrdinal: res.activeMatchOrdinal,
          matches: res.matches,
        });
      });
      return () => {
        unsubscribe();
      };
    }
  }, []);

  useEffect(() => {
    if (text) {
      window.electron?.find?.inPage(text, { findNext: false });
    } else {
      window.electron?.find?.stop("clearSelection");
      setResult({ activeMatchOrdinal: 0, matches: 0 });
    }
  }, [text]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNext(!e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const handleNext = (forward = true) => {
    if (text) {
      window.electron?.find?.inPage(text, { forward, findNext: true });
    }
  };

  const handleClose = () => {
    window.electron?.find?.stop("clearSelection");
    onClose();
  };

  return (
    <div className="find-bar" role="search">
      <div className="find-bar-input-wrap">
        <Icon.Search className="find-bar-search-icon" width={14} height={14} />
        <input
          ref={inputRef}
          type="text"
          className="find-bar-input"
          placeholder="Find in page..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {text && (
          <span className="find-bar-results mono">
            {result.matches > 0
              ? `${result.activeMatchOrdinal} of ${result.matches}`
              : "0 of 0"}
          </span>
        )}
      </div>
      <div className="find-bar-divider" />
      <div className="find-bar-actions">
        <button
          className="find-bar-btn"
          onClick={() => handleNext(false)}
          disabled={!text}
          title="Previous (Shift+Enter)"
          aria-label="Previous match"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
        <button
          className="find-bar-btn"
          onClick={() => handleNext(true)}
          disabled={!text}
          title="Next (Enter)"
          aria-label="Next match"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <button
          className="find-bar-btn close"
          onClick={handleClose}
          title="Close (Esc)"
          aria-label="Close search"
        >
          <Icon.Close width={12} height={12} />
        </button>
      </div>
    </div>
  );
}
