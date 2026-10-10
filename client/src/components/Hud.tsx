import { formatTime } from '@typerush/shared';

export interface HudStats {
  wpm: number;
  accuracy: number;
  elapsedMs: number;
  progressPct: number;
}

export function Hud({ stats }: { stats: HudStats }) {
  return (
    <div className="hud" role="group" aria-label="Your live stats">
      <div className="hud-tile">
        <span className="hud-label">WPM</span>
        <span className="hud-value">{Math.round(stats.wpm)}</span>
      </div>
      <div className="hud-tile">
        <span className="hud-label">Accuracy</span>
        <span className="hud-value">{stats.accuracy.toFixed(0)}%</span>
      </div>
      <div className="hud-tile">
        <span className="hud-label">Time</span>
        <span className="hud-value">{formatTime(stats.elapsedMs)}</span>
      </div>
      <div className="hud-tile hud-wide">
        <span className="hud-label">Progress {Math.round(stats.progressPct)}%</span>
        <div
          className="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(stats.progressPct)}
          aria-label="Race progress"
        >
          <div className="bar-fill" style={{ width: `${Math.min(100, stats.progressPct)}%` }} />
        </div>
      </div>
    </div>
  );
}

export interface StandingRow {
  id: string;
  name: string;
  progressPct: number;
  you: boolean;
  finished: boolean;
  position: number | null;
  status?: string;
}

export function Standings({ rows }: { rows: StandingRow[] }) {
  return (
    <ol className="standings" aria-label="Live standings">
      {rows.map((row, index) => (
        <li key={row.id} className={row.you ? 'standing standing-you' : 'standing'}>
          <span className="standing-rank">{row.finished && row.position ? row.position : index + 1}</span>
          <span className="standing-name">
            {row.name}
            {row.you ? ' (you)' : ''}
          </span>
          <div className="bar bar-thin" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${Math.min(100, row.progressPct)}%` }} />
          </div>
          <span className="standing-pct">{row.status ?? (row.finished ? 'Finished' : `${Math.round(row.progressPct)}%`)}</span>
        </li>
      ))}
    </ol>
  );
}
