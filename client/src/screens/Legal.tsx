import { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { CONTACT_TEXT, FEEDBACK_URL } from '../lib/support';
import type { Go } from '../routes';

const UPDATED = '11 October 2026';

function Privacy() {
  return (
    <section className="panel legal" role="tabpanel">
      <p className="muted">Last updated {UPDATED}. This page says in plain words what TypeRush stores. It is not legal advice.</p>

      <h2 className="section-title">What TypeRush stores</h2>
      <ul>
        <li>
          <strong>On your device (in this browser):</strong> your nickname, chosen car, skin and trail, progress, coins, badges, records and settings, and a
          random device token that identifies this browser to the server. Clearing your browser data removes it.
        </li>
        <li>
          <strong>On the server, when you play online:</strong> your nickname, car and race results while a room or a match is open. Public match results can appear
          on the online leaderboard with your nickname.
        </li>
        <li>
          <strong>If you create an account (optional):</strong> your nickname, a copy of your progress (cloud save), your Daily Challenge, Weekly Cup and class results,
          your friend code and friend list, and the classes you created or joined. Your recovery code is stored only as a one-way hash; nobody can read it back.
        </li>
      </ul>

      <h2 className="section-title">What TypeRush does not ask for</h2>
      <p>No email address, phone number, password, real name, location or contact list. Please do not use your real full name as a nickname, and do not share personal details in nicknames or class names.</p>

      <h2 className="section-title">Who else handles data</h2>
      <p>
        The game page is served by Cloudflare, the game server runs on Render, and accounts, results and classes are stored in a Supabase database. These providers
        may keep technical logs (for example IP addresses) under their own policies. The server uses your IP address only to limit abuse, and keeps those counters in
        memory. If the person running this site turns on ads or analytics, those services may use cookies; this page should then be updated.
      </p>

      <h2 className="section-title">Children and classes</h2>
      <p>
        Teachers can run classes. Students join with a class code and a nickname. If you are under 18, ask a parent, guardian or teacher before creating an account.
        Teachers and schools are responsible for getting any consent they need before asking students to join.
      </p>

      <h2 className="section-title">Your choices</h2>
      <ul>
        <li>Delete your cloud account any time in Menu, Account &amp; backup. This removes your cloud save, results, friends and classes you created.</li>
        <li>Reset the data on this device in Settings.</li>
        <li>Leave a class or remove a friend at any time.</li>
      </ul>

      <h2 className="section-title">Contact</h2>
      <p>
        {CONTACT_TEXT ? (
          <>
            For privacy questions or deletion requests, contact: <strong>{CONTACT_TEXT}</strong>.
          </>
        ) : (
          'The person running this site has not published a contact address yet. Ask them directly or use the feedback link below.'
        )}
        {FEEDBACK_URL && (
          <>
            {' '}
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
              Send feedback
            </a>
            .
          </>
        )}
      </p>
    </section>
  );
}

function Terms() {
  return (
    <section className="panel legal" role="tabpanel">
      <p className="muted">Last updated {UPDATED}. These are simple rules for playing TypeRush. They are not legal advice.</p>

      <h2 className="section-title">Using TypeRush</h2>
      <ul>
        <li>TypeRush is free to play. Features may change or stop, and free hosting can be slow or offline.</li>
        <li>It is provided as is, without promises about availability, accuracy of scores or saving of progress. Keep your recovery code safe: a lost code cannot be recovered.</li>
        <li>Coins, skins and levels are virtual items for fun. They have no cash value and cannot be bought or sold for money.</li>
      </ul>

      <h2 className="section-title">Fair play</h2>
      <ul>
        <li>Type the text yourself. Scripts, bots, macros and edited requests are not allowed, and results that look impossible may be removed.</li>
        <li>No offensive, hateful or personal nicknames, class names or texts.</li>
        <li>Do not try to break, overload or probe the service.</li>
      </ul>

      <h2 className="section-title">Scores are not exam results</h2>
      <p>
        A TypeRush score, ranking or certificate comes from a game. It is practice and fun. It is not an official typing test and does not replace the rules or
        software of any exam, employer or institute. Always read the official notice of your exam.
      </p>

      <h2 className="section-title">Classes and contests</h2>
      <p>
        Classes are run by teachers, who choose the text and the rounds. Contests on TypeRush are free to enter and do not give out money prizes. Any certificates or
        other prizes are arranged by the organiser.
      </p>

      <h2 className="section-title">Accounts and removal</h2>
      <p>You can delete your account at any time. Accounts or results that break these rules may be removed.</p>

      <h2 className="section-title">Changes</h2>
      <p>These rules may change. The date at the top shows when they were last updated.</p>
    </section>
  );
}

export function Legal({ go, initialTab }: { go: Go; initialTab?: 'privacy' | 'terms' }) {
  const [tab, setTab] = useState<'privacy' | 'terms'>(initialTab ?? 'privacy');
  return (
    <div className="page">
      <TopBar title="Privacy and Terms" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <div className="tabs" role="tablist" aria-label="Legal">
        <button role="tab" aria-selected={tab === 'privacy'} className={tab === 'privacy' ? 'tab tab-on' : 'tab'} onClick={() => setTab('privacy')}>
          Privacy
        </button>
        <button role="tab" aria-selected={tab === 'terms'} className={tab === 'terms' ? 'tab tab-on' : 'tab'} onClick={() => setTab('terms')}>
          Terms
        </button>
      </div>
      {tab === 'privacy' ? <Privacy /> : <Terms />}
    </div>
  );
}
