import { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import type { Go } from '../routes';

function when(at: number | null): string {
  if (!at) return 'not yet';
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Account({ go }: { go: Go }) {
  const { profile, cloud, signUp, signIn, syncNow, signOut, removeCloudAccount } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [fresh, setFresh] = useState<{ code: string; persistent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const linked = profile.account.linked;

  const run = async (job: () => Promise<void>) => {
    audio.unlock();
    audio.click();
    setBusy(true);
    setError(null);
    try {
      await job();
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const res = await signUp();
      if (res.ok) setFresh({ code: res.recoveryCode, persistent: res.persistent });
      else setError(res.error);
    });

  const restore = () =>
    run(async () => {
      const res = await signIn(code);
      if (res.ok) {
        setCode('');
        setFresh(null);
      } else setError(res.error);
    });

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.code);
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Please write the code down.');
    }
  };

  return (
    <div className="page">
      <TopBar title="Account & backup" onBack={() => go({ name: 'home' })} backLabel="Menu" />

      <section className="panel">
        <p className="muted">
          An account saves your coins, badges, levels and cars in the cloud, lets you play on another phone or computer,
          and puts your Daily Challenge results on the leaderboards. There is <strong>no email and no password</strong>:
          you get one secret recovery code instead.
        </p>
      </section>

      {fresh && (
        <section className="panel recovery-box" role="alert">
          <h2 className="section-title">Your recovery code</h2>
          <p className="recovery-code" aria-label="Recovery code">
            {fresh.code}
          </p>
          <p>
            <strong>Save this code now.</strong> It is shown only once. Anyone who has it can open your account, and if
            you lose it nobody can recover it.
          </p>
          <div className="row row-center">
            <button className="btn btn-primary" onClick={copy}>
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <button className="btn" onClick={() => setFresh(null)}>
              I saved it
            </button>
          </div>
          {!fresh.persistent && (
            <p className="banner banner-warn">
              The server has no permanent database connected yet, so the account may be lost when the server restarts.
              Tell the person running the game to set DATABASE_URL.
            </p>
          )}
        </section>
      )}

      {linked ? (
        <section className="panel">
          <h2 className="section-title">Signed in</h2>
          <p>
            This device is linked to your account. Your progress is saved to the cloud automatically a few seconds after
            something changes. Last saved: <strong>{when(profile.account.lastSyncAt)}</strong>.
          </p>
          <p className={cloud.status === 'error' ? 'error' : 'muted'} role="status">
            {cloud.status === 'syncing'
              ? 'Syncing...'
              : cloud.status === 'error'
                ? cloud.message
                : cloud.status === 'ok'
                  ? 'Everything is saved.'
                  : ''}
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => run(syncNow)} disabled={busy}>
              Sync now
            </button>
            <button className="btn" onClick={() => run(signOut)} disabled={busy}>
              Sign out of this device
            </button>
          </div>
          <p className="muted">
            Tip: use one device at a time. When two devices were used, anything you earned (badges, cars, stars, records)
            is combined, and the most recent save wins for coins and settings.
          </p>

          <h3 className="section-title">Delete my cloud account</h3>
          {!confirmDelete ? (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete cloud account...
            </button>
          ) : (
            <div className="row">
              <span>This removes your cloud save and your leaderboard results. Your progress on this device stays.</span>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const res = await removeCloudAccount();
                    if (!res.ok) setError(res.error);
                    setConfirmDelete(false);
                  })
                }
              >
                Yes, delete it
              </button>
              <button className="btn" onClick={() => setConfirmDelete(false)} autoFocus>
                Cancel
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <h2 className="section-title">Create an account</h2>
            <p className="muted">
              Uses your current nickname (<strong>{profile.name}</strong>) and uploads your progress. You can change the
              nickname in the Garage.
            </p>
            <button className="btn btn-primary" onClick={create} disabled={busy}>
              {busy ? 'Please wait...' : 'Create account'}
            </button>
          </section>

          <section className="panel">
            <h2 className="section-title">I already have an account</h2>
            <label className="field">
              <span>Recovery code</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="TR-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
              />
            </label>
            <button className="btn" onClick={restore} disabled={busy || code.trim().length < 10}>
              Sign in and load my progress
            </button>
            <p className="muted">What you earned on this device is kept and combined with your cloud save.</p>
          </section>
        </>
      )}

      {error && (
        <p className="banner banner-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
