import { useOnline } from '../net/OnlineContext';

/** Honest connection status: never pretends multiplayer works when the server is unreachable. */
export function ConnectionNotice({ onPractice }: { onPractice?: () => void }) {
  const online = useOnline();

  if (online.status === 'online') {
    return (
      <p className="status status-ok" role="status">
        <span className="dot dot-ok" aria-hidden="true" /> Connected to the multiplayer server
      </p>
    );
  }
  if (online.status === 'offline') {
    return (
      <div className="banner banner-warn" role="alert">
        <p>
          <strong>Multiplayer server unavailable.</strong>{' '}
          {online.connectError ?? 'We could not connect.'}
        </p>
        <div className="row">
          <button className="btn" onClick={online.connect}>
            Try again
          </button>
          {onPractice && (
            <button className="btn btn-primary" onClick={onPractice}>
              Practice vs AI instead
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <p className="status" role="status">
      <span className="dot dot-wait" aria-hidden="true" /> Connecting to the multiplayer server...
      {online.url ? <small className="muted"> ({online.url})</small> : null}
    </p>
  );
}
