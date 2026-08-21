import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_PREFERENCES, normalizePreferences, scaledAnalysisSize, type ExtractionMode, type FrameDetail, type Preferences } from '../shared/types';
import './popup.css';

function App() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState('');
  const [videoSize, setVideoSize] = useState({ width: 1920, height: 1080 });
  useEffect(() => {
    void chrome.storage.sync.get(DEFAULT_PREFERENCES).then((value) => setPreferences(normalizePreferences(value)));
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab.id) return;
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'LFE_STATUS' });
        if (status.videoWidth && status.videoHeight) setVideoSize({ width: status.videoWidth, height: status.videoHeight });
      } catch { /* The page may need one reload after installation. */ }
    });
  }, []);
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
    <section className="resolution"><div><span>Analysis Resolution</span><strong>{(() => { const size = scaledAnalysisSize(videoSize.width, videoSize.height, preferences.analysisScale); return `${size.width}×${size.height}`; })()}</strong></div>
      <div className="presets">{([[0, '32×18'], [35, 'Balanced'], [100, 'Original']] as [number, string][]).map(([value, label]) => <button key={value} className={preferences.analysisScale === value ? 'selected' : ''} onClick={() => update({ ...preferences, analysisScale: value })}>{label}</button>)}</div>
      <input aria-label="Analysis resolution" type="range" min="0" max="100" value={preferences.analysisScale} onChange={(event) => update({ ...preferences, analysisScale: Number(event.target.value) })}/>
      <small>Higher resolution detects finer writing but processes more slowly.</small>
    </section>
    <button className="extract" onClick={() => void start()}>Extract Frames</button>
    {message && <p>{message}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
