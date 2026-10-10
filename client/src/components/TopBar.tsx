import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';

interface Props {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
}

export function TopBar({ title, onBack, backLabel = 'Back' }: Props) {
  const { profile, setSettings } = useProfile();
  const { musicOn, sfxOn } = profile.settings;
  const muted = !musicOn && !sfxOn;

  const toggleMute = () => {
    audio.unlock();
    setSettings({ musicOn: muted, sfxOn: muted });
  };

  return (
    <header className="topbar">
      {onBack ? (
        <button className="btn btn-ghost" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {backLabel}
        </button>
      ) : (
        <span className="topbar-spacer" />
      )}
      {title && <h1 className="topbar-title">{title}</h1>}
      <span className="topbar-right">
      <span className="pill coin-pill" title="Coins you can spend in the Garage shop" aria-label={`${profile.coins} coins`}>
        <span className="coin" aria-hidden="true" /> {profile.coins}
      </span>
      <button
        className="btn btn-ghost btn-icon"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute sound' : 'Mute all sound'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? 'Sound: off' : 'Sound: on'}
      </button>
      </span>
    </header>
  );
}
