import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_PREFERENCES, type ExtractionMode, type Preferences } from '../shared/types';
import './popup.css';

function App() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState('');
  useEffect(() => { void chrome.storage.sync.get(DEFAULT_PREFERENCES).then((value) => setPreferences(value as unknown as Preferences)); }, []);
  const update = (next: Preferences) => { setPreferences(next); void chrome.storage.sync.set(next); };
  const start = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    try { await chrome.tabs.sendMessage(tab.id, { type: 'LFE_START', preferences }); window.close(); }
    catch { setMessage('Reload this video page once, then try again.'); }
  };
  return <main>
    <h1>Lecture Frame Extractor</h1>
    <div className="modes">
      {(['auto', 'minimum'] as ExtractionMode[]).map((mode) => <button key={mode} className={preferences.mode === mode ? 'selected' : ''} onClick={() => update({ ...preferences, mode })}>
        <strong>{mode === 'auto' ? 'Auto' : 'Minimum'}</strong><span>{mode === 'auto' ? 'Balanced context' : 'Fewest frames'}</span>
      </button>)}
    </div>
    <label>Sensitivity <input type="range" min="0" max="100" step="10" value={preferences.sensitivity} onChange={(event) => update({ ...preferences, sensitivity: Number(event.target.value) })}/></label>
    <button className="extract" onClick={() => void start()}>Extract Frames</button>
    {message && <p>{message}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
