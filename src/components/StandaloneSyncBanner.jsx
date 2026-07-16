import { Icon } from "./Icons.jsx";

export default function StandaloneSyncBanner({ onSignIn }) {
  return (
    <div className="standalone-sync-banner" role="status">
      <span className="standalone-sync-icon" aria-hidden="true">
        <Icon.Cloud />
      </span>
      <span className="standalone-sync-copy">
        <strong>This Home Screen copy is not syncing.</strong>
        <span>Its local goals may be out of date. Sign in once to reconnect it.</span>
      </span>
      <button type="button" className="btn primary sm" onClick={onSignIn}>
        Sign in
      </button>
    </div>
  );
}
