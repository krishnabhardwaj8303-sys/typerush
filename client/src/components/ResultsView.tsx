import { useEffect } from 'react';
import { DIFFICULTY_LABEL, formatTime, type ResultRow } from '@typerush/shared';
import { audio } from '../lib/audio';
import { CarArt } from './CarArt';
import { Confetti } from './Confetti';

interface Props {
  rows: ResultRow[];
  youId: string;
  difficulty: keyof typeof DIFFICULTY_LABEL;
  title?: string;
  /** Extra message, e.g. level cleared / not cleared. */
  banner?: { tone: 'good' | 'warn' | 'info'; text: string } | null;
  stars?: number | null;
  actions: React.ReactNode;
  reduceMotion: boolean;
}

const ORDINAL = ['1st', '2nd', '3rd'];

export function ResultsView({ rows, youId, difficulty, title, banner, stars, actions, reduceMotion }: Props) {
  const you = rows.find((r) => r.playerId === youId);
  const youWon = !!you && you.position === 1 && you.finished && rows.length > 1;

  useEffect(() => {
    if (!you) return;
    if (youWon) audio.win();
    else if (you.finished) audio.finish();
    else audio.lose();
  }, [you, youWon]);

  const podium = rows.slice(0, 3);
  // Visual order: 2nd, 1st, 3rd
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <section className="results" aria-labelledby="results-title">
      {youWon && !reduceMotion && <Confetti />}
      <h2 id="results-title" className="results-title">
        {title ?? (youWon ? 'You won the race!' : you?.finished ? 'Race complete' : 'Race over')}
      </h2>
      <p className="muted center">{DIFFICULTY_LABEL[difficulty]} race</p>

      {banner && <p className={`banner banner-${banner.tone}`}>{banner.text}</p>}
      {typeof stars === 'number' && stars > 0 && (
        <p className="stars" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= stars ? 'star star-on' : 'star'} aria-hidden="true">
              &#9733;
            </span>
          ))}
        </p>
      )}

      {rows.length > 1 && (
        <div className={`podium ${reduceMotion ? '' : 'podium-animate'}`}>
          {podiumOrder.map((row) => (
            <div key={row.playerId} className={`podium-slot podium-${row.position}`}>
              <CarArt car={row.car} size={110} animate={row.position === 1 && !reduceMotion} />
              <span className="podium-name">{row.name}</span>
              <div className="podium-block">
                <span>{ORDINAL[row.position - 1]}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="results-table">
          <caption className="sr-only">Final race results</caption>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Racer</th>
              <th scope="col">WPM</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Time</th>
              <th scope="col">Progress</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId} className={row.playerId === youId ? 'row-you' : ''}>
                <th scope="row">{row.disqualified ? 'DQ' : row.position}</th>
                <td>
                  {row.name}
                  {row.playerId === youId ? ' (you)' : ''}
                  {row.isBot ? <span className="tag">AI</span> : null}
                  {row.left ? <span className="tag">left</span> : null}
                  {row.disqualified ? <span className="tag tag-bad">disqualified</span> : null}
                </td>
                <td>{row.wpm.toFixed(0)}</td>
                <td>{row.accuracy.toFixed(1)}%</td>
                <td>{row.finished && row.finishMs ? formatTime(row.finishMs) : 'DNF'}</td>
                <td>{row.progressPct.toFixed(0)}%</td>
                <td>{row.score.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {you && (
        <details className="breakdown" open={rows.length <= 2}>
          <summary>How your {you.score.total} points were calculated</summary>
          <ul>
            {you.finished ? (
              <>
                <li>Finished the race: +{you.score.completion}</li>
                <li>Placement bonus: +{you.score.placement}</li>
                <li>Speed ({you.wpm.toFixed(0)} WPM x 2): +{you.score.speed}</li>
                <li>Accuracy ({you.accuracy.toFixed(1)}%): +{you.score.accuracy}</li>
                <li>
                  Difficulty multiplier ({DIFFICULTY_LABEL[difficulty]}): x{you.score.multiplier}
                </li>
              </>
            ) : (
              <li>Did not finish: {you.score.participation} participation points (max 20)</li>
            )}
            <li>
              <strong>Total: {you.score.total}</strong>
            </li>
          </ul>
        </details>
      )}

      <div className="results-actions">{actions}</div>
    </section>
  );
}
