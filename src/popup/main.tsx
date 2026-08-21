import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_PREFERENCES, normalizePreferences, type ExtractionMode, type FrameDetail, type Preferences } from '../shared/types';
import './popup.css';

function App() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState('');
  useEffect(() => { void chrome.storage.sync.get(DEFAULT_PREFERENCES).then((value) => setPreferences(normalizePreferences(value))); }, []);
  const update = (next: Preferences) => { setPreferences(next); void chrome.storage.sync.set(next); };
  const start = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    try { await chrome.tabs.sendMessage(tab.id, { type: 'LFE_START', preferences }); window.close(); }
    catch { setMessage('Reload this video page once, then try again.'); }
  };
  return <main>
    <header><img src="/icons/icon-48.png" alt=""/><h1>Lecture Frame Extractor</h1></header>
    <div className="modes">
      {(['auto', 'minimum'] as ExtractionMode[]).map((mode) => <button key={mode} className={preferences.mode === mode ? 'selected' : ''} onClick={() => update({ ...preferences, mode })}>
        <strong>{mode === 'auto' ? 'Auto' : 'Minimum'}</strong><span>{mode === 'auto' ? 'Balanced context' : 'Fewest frames'}</span>
      </button>)}
    </div>
    <section className="detail"><span>Frame Detail</span><div className="details">
      {([
        ['compact', 'Compact', 'Major changes only'],
        ['balanced', 'Balanced', 'Important visual states'],
        ['detailed', 'Detailed', 'More writing stages'],
      ] as [FrameDetail, string, string][]).map(([detail, title, description]) => <button key={detail} className={preferences.detail === detail ? 'selected' : ''} onClick={() => update({ ...preferences, detail })}>
        <strong>{title}</strong><small>{description}</small>
      </button>)}
    </div></section>
    <button className="extract" onClick={() => void start()}>Extract Frames</button>
    {message && <p>{message}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
