import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setOutputDirectory } from '../storage/file-system';
import type { VideoRecord } from '../shared/types';
import './library.css';

declare global {
  interface Window { showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>; }
}

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
};

function App() {
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [index, setIndex] = useState(0);
  const [storageMessage, setStorageMessage] = useState('');
  const studyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    void chrome.runtime.sendMessage({ type: 'LFE_LIST_RECORDS' }).then(({ records: found }: { records: VideoRecord[] }) => {
      const sorted = found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setRecords(sorted);
      setActiveId(sorted[0]?.id ?? '');
    });
  }, []);
  const active = records.find((record) => record.id === activeId);
  const frames = useMemo(() => active?.frames.filter((frame) => frame.selected) ?? [], [active]);
  useEffect(() => setIndex(0), [activeId]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(frames.length - 1, value + 1));
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [frames.length]);
  const chooseFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await setOutputDirectory(handle);
      setStorageMessage(`Exporting ${records.length} saved videos to ${handle.name}…`);
      await Promise.all(records.map((record) => chrome.runtime.sendMessage({ type: 'LFE_SAVE_RECORD', record })));
      setStorageMessage(`Using ${handle.name}. Saved videos are exported and future updates will save automatically.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStorageMessage('Chrome could not retain access to that folder. Please choose another folder.');
    }
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await studyRef.current?.requestFullscreen();
  };
  return <main>
    <aside>
      <header><img src="/icons/icon-48.png" alt=""/><div><strong>Frame Library</strong><span>{records.length} saved videos</span></div></header>
      <button className="folder" onClick={() => void chooseFolder()}>Choose Storage Folder</button>
      {storageMessage && <p>{storageMessage}</p>}
      <nav>{records.map((record) => <button key={record.id} className={record.id === activeId ? 'active' : ''} onClick={() => setActiveId(record.id)}><strong>{record.title}</strong><span>{record.frames.filter((frame) => frame.selected).length} selected · {record.frames.length} total</span></button>)}</nav>
    </aside>
    <section className="study" ref={studyRef}>
      {!active && <div className="empty"><h1>No saved lectures yet</h1><p>Extract a video once, then it will appear here.</p></div>}
      {active && !frames.length && <div className="empty"><h1>No selected frames</h1><p>Open the video’s analyzed-frame gallery and select frames first.</p></div>}
      {active && frames[index] && <>
        <div className="title"><strong>{active.title}</strong><span>{frames[index].pixelWidth || 'Unknown'}×{frames[index].pixelHeight || 'Unknown'} px</span><a href={active.url} target="_blank" rel="noreferrer">Open video</a><button onClick={() => void toggleFullscreen()}>Full Screen</button></div>
        <img className="frame" src={frames[index].dataUrl} alt={`Frame ${index + 1}`}/>
        <button className="previous" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>‹</button>
        <button className="next" disabled={index === frames.length - 1} onClick={() => setIndex((value) => value + 1)}>›</button>
        <footer><span>Frame {index + 1} / {frames.length}</span><a href={`${active.url}${active.url.includes('?') ? '&' : '?'}t=${Math.floor(frames[index].timestamp)}s`} target="_blank" rel="noreferrer">{formatTime(frames[index].timestamp)}</a></footer>
      </>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
