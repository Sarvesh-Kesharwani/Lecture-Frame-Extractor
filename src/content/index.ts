import { getAdapter } from '../core/adapters';
import { extractFrames } from '../core/extractor';
import { DEFAULT_PREFERENCES, normalizePreferences, type ExtractedFrame, type Preferences, type RuntimeMessage } from '../shared/types';

const HOST_ID = 'lecture-frame-extractor-root';
let busy = false;
let statusText = '';
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function ensureUi() {
  if (host?.isConnected) return;
  host = document.createElement('div');
  host.id = HOST_ID;
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial} *{box-sizing:border-box} .launch{position:fixed;right:18px;bottom:72px;z-index:2147483646;border:0;border-radius:999px;background:#111;color:#fff;padding:10px 15px;font:600 13px system-ui;box-shadow:0 4px 18px #0005;cursor:pointer}.launch:hover{background:#292929}.launch:disabled{opacity:.7;cursor:wait}.status{position:fixed;right:18px;bottom:116px;z-index:2147483646;max-width:300px;padding:9px 12px;border-radius:8px;background:#111;color:#fff;font:12px system-ui;box-shadow:0 4px 18px #0005}.viewer{position:fixed;inset:0;z-index:2147483647;background:#080808;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#fff}.viewer img{max-width:100vw;max-height:calc(100vh - 72px);object-fit:contain}.nav{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;pointer-events:none}.nav button,.close{pointer-events:auto;border:0;background:#0008;color:#fff;cursor:pointer;font-size:28px}.nav button{width:58px;height:88px;border-radius:8px}.close{position:absolute;right:16px;top:16px;width:42px;height:42px;border-radius:50%;z-index:2}.footer{position:absolute;bottom:0;left:0;right:0;height:62px;display:flex;align-items:center;justify-content:center;gap:22px;background:linear-gradient(transparent,#000c);font:14px system-ui}.time{border:0;background:transparent;color:#8ec5ff;text-decoration:underline;cursor:pointer;font:inherit}.error{position:fixed;right:18px;bottom:116px;z-index:2147483647;max-width:380px;padding:12px 14px;border-radius:8px;background:#7f1d1d;color:white;font:13px/1.4 system-ui;box-shadow:0 4px 20px #0007}`;
  shadow.append(style);
  document.documentElement.append(host);
  renderButton();
}

function renderButton() {
  if (!shadow || shadow.querySelector('.viewer')) return;
  shadow.querySelectorAll('.launch,.status,.error').forEach((element) => element.remove());
  const button = document.createElement('button');
  button.className = 'launch';
  button.textContent = busy ? 'Extracting…' : 'Extract Frames';
  button.disabled = busy;
  button.addEventListener('click', () => void startExtraction());
  shadow.append(button);
  if (statusText) {
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = statusText;
    shadow.append(status);
  }
}

function showError(message: string) {
  statusText = '';
  renderButton();
  const error = document.createElement('div');
  error.className = 'error';
  error.textContent = message;
  shadow?.append(error);
  setTimeout(() => error.remove(), 9000);
}

function showViewer(frames: ExtractedFrame[]) {
  if (!shadow) return;
  shadow.querySelectorAll('.launch,.status,.error').forEach((element) => element.remove());
  let index = 0;
  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.innerHTML = `<button class="close" aria-label="Close">×</button><img alt="Extracted lecture frame"><div class="nav"><button class="previous" aria-label="Previous frame">‹</button><button class="next" aria-label="Next frame">›</button></div><div class="footer"><span class="count"></span><button class="time" title="Seek original video"></button></div>`;
  const update = () => {
    (viewer.querySelector('img') as HTMLImageElement).src = frames[index].dataUrl;
    viewer.querySelector('.count')!.textContent = `Frame ${index + 1} / ${frames.length}`;
    viewer.querySelector('.time')!.textContent = formatTime(frames[index].timestamp);
    (viewer.querySelector('.previous') as HTMLButtonElement).disabled = index === 0;
    (viewer.querySelector('.next') as HTMLButtonElement).disabled = index === frames.length - 1;
  };
  const move = (delta: number) => { index = Math.max(0, Math.min(frames.length - 1, index + delta)); update(); };
  const close = () => { document.removeEventListener('keydown', keyboard); viewer.remove(); renderButton(); };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'Escape') close();
  };
  viewer.querySelector('.previous')!.addEventListener('click', () => move(-1));
  viewer.querySelector('.next')!.addEventListener('click', () => move(1));
  viewer.querySelector('.close')!.addEventListener('click', close);
  viewer.querySelector('.time')!.addEventListener('click', () => { const video = getAdapter().findVideo(); if (video) video.currentTime = frames[index].timestamp; });
  document.addEventListener('keydown', keyboard);
  shadow.append(viewer);
  update();
}

async function startExtraction(override?: Preferences) {
  if (busy) return;
  const adapter = getAdapter();
  if (!adapter.findVideo()) { showError('No supported, ready HTML5 video was found on this page.'); return; }
  busy = true;
  statusText = `Preparing ${adapter.name} video…`;
  renderButton();
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_PREFERENCES);
    const preferences = normalizePreferences(override ?? stored);
    const frames = await extractFrames(adapter, preferences, (message) => { statusText = message; renderButton(); });
    showViewer(frames);
  } catch (error) {
    busy = false;
    showError(error instanceof Error ? error.message : 'Frame extraction failed.');
    return;
  } finally {
    busy = false;
    statusText = '';
    if (!shadow?.querySelector('.viewer') && !shadow?.querySelector('.error')) renderButton();
  }
}

function refreshPresence() {
  ensureUi();
  if (!busy && !shadow?.querySelector('.viewer')) {
    const button = shadow?.querySelector<HTMLElement>('.launch');
    if (button) button.style.display = getAdapter().findVideo() ? 'block' : 'none';
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === 'LFE_START') { void startExtraction(message.preferences); respond({ ok: true }); }
  if (message.type === 'LFE_STATUS') respond({ found: Boolean(getAdapter().findVideo()), busy });
  return false;
});

ensureUi();
refreshPresence();
const observer = new MutationObserver(refreshPresence);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('yt-navigate-finish', refreshPresence);
