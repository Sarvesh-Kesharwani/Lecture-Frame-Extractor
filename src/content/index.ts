import { getAdapter } from '../core/adapters';
import { captureSelectedFrames, extractFrames } from '../core/extractor';
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
    :host{all:initial} *{box-sizing:border-box}.launch{position:fixed;right:18px;bottom:72px;z-index:2147483646;border:0;border-radius:999px;background:#111;color:#fff;padding:10px 15px;font:600 13px system-ui;box-shadow:0 4px 18px #0005;cursor:pointer}.launch:hover{background:#292929}.launch:disabled{opacity:.7;cursor:wait}.status{position:fixed;right:18px;bottom:116px;z-index:2147483646;max-width:340px;padding:9px 12px;border-radius:8px;background:#111;color:#fff;font:12px system-ui;box-shadow:0 4px 18px #0005}.viewer{position:fixed;inset:0;z-index:2147483647;background:#080808;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#fff}.viewer>img{max-width:100vw;max-height:calc(100vh - 72px);object-fit:contain}.nav{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;pointer-events:none}.nav button,.close{pointer-events:auto;border:0;background:#0008;color:#fff;cursor:pointer;font-size:28px}.nav button{width:58px;height:88px;border-radius:8px}.close{position:absolute;right:16px;top:16px;width:42px;height:42px;border-radius:50%;z-index:2}.footer{position:absolute;bottom:0;left:0;right:0;height:62px;display:flex;align-items:center;justify-content:center;gap:22px;background:linear-gradient(transparent,#000c);font:14px system-ui}.time{border:0;background:transparent;color:#8ec5ff;text-decoration:underline;cursor:pointer;font:inherit}.error{position:fixed;right:18px;bottom:116px;z-index:2147483647;max-width:380px;padding:12px 14px;border-radius:8px;background:#7f1d1d;color:white;font:13px/1.4 system-ui;box-shadow:0 4px 20px #0007}.gallery{position:fixed;inset:0;z-index:2147483647;background:#0a0a0d;color:#fff;font-family:system-ui;overflow:auto;padding:82px 22px 28px}.gallery-head{position:fixed;z-index:2;left:0;right:0;top:0;height:66px;padding:0 76px 0 22px;background:#111118eF;backdrop-filter:blur(12px);display:flex;align-items:center;gap:12px;border-bottom:1px solid #ffffff18}.gallery-head strong{font-size:16px}.gallery-head span{font-size:12px;color:#aaa}.filter,.finish{border:1px solid #555;border-radius:8px;background:#23232d;color:#fff;padding:8px 12px;font:600 12px system-ui;cursor:pointer}.filter{margin-left:auto}.finish{border-color:#1da765;background:#137a48}.filter:disabled,.finish:disabled{opacity:.5;cursor:wait}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}.card{position:relative;background:#181820;border:2px solid transparent;border-radius:10px;overflow:hidden}.card.selected{border-color:#39dc88;box-shadow:0 0 0 2px #39dc8840}.card img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#000}.badge{position:absolute;right:7px;top:7px;border-radius:999px;background:#137a48;color:#fff;padding:4px 7px;font:700 10px system-ui}.meta{display:flex;align-items:center;justify-content:space-between;padding:8px 9px;font:11px system-ui;color:#aaa}.meta .time{color:#8ec5ff}.toggle{border:1px solid #555;border-radius:6px;background:#262631;color:#ddd;padding:4px 7px;font:600 10px system-ui;cursor:pointer}.card.selected .toggle{background:#137a48;border-color:#39dc88;color:#fff}.empty{text-align:center;color:#aaa;padding:60px}`;
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

function showViewer(frames: ExtractedFrame[], onClose?: () => void) {
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
  const close = () => { document.removeEventListener('keydown', keyboard); viewer.remove(); if (onClose) onClose(); else renderButton(); };
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

function showGallery(frames: ExtractedFrame[]) {
  if (!shadow) return;
  shadow.querySelectorAll('.launch,.status,.error').forEach((element) => element.remove());
  let selectedOnly = false;
  const gallery = document.createElement('div');
  gallery.className = 'gallery';
  gallery.innerHTML = `<button class="close" aria-label="Close">×</button><div class="gallery-head"><strong>Analyzed frames</strong><span></span><button class="filter"></button><button class="finish">Finish & Study</button></div><div class="grid"></div>`;
  const render = () => {
    const visible = selectedOnly ? frames.filter((frame) => frame.selected) : frames;
    gallery.querySelector('.gallery-head span')!.textContent = `${frames.filter((frame) => frame.selected).length} selected of ${frames.length}`;
    gallery.querySelector('.filter')!.textContent = selectedOnly ? 'Show all frames' : 'Show selected only';
    const grid = gallery.querySelector('.grid')!;
    grid.replaceChildren();
    if (!visible.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No selected frames.'; grid.append(empty); return; }
    for (const frame of visible) {
      const card = document.createElement('article');
      card.className = `card${frame.selected ? ' selected' : ''}`;
      card.innerHTML = `<img alt="Analyzed lecture frame">${frame.selected ? '<span class="badge">SELECTED</span>' : ''}<div class="meta"><button class="time"></button><span>Change ${frame.changeScore.toFixed(3)}</span><button class="toggle">${frame.selected ? 'Deselect' : 'Select'}</button></div>`;
      const image = card.querySelector('img') as HTMLImageElement;
      image.src = frame.dataUrl;
      image.addEventListener('click', () => { frame.selected = !frame.selected; render(); });
      card.querySelector('.time')!.textContent = formatTime(frame.timestamp);
      card.querySelector('.time')!.addEventListener('click', () => { const video = getAdapter().findVideo(); if (video) video.currentTime = frame.timestamp; });
      card.querySelector('.toggle')!.addEventListener('click', () => { frame.selected = !frame.selected; render(); });
      grid.append(card);
    }
  };
  const close = () => { document.removeEventListener('keydown', keyboard); gallery.remove(); renderButton(); };
  const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape' && !shadow?.querySelector('.viewer')) close(); };
  gallery.querySelector('.close')!.addEventListener('click', close);
  gallery.querySelector('.filter')!.addEventListener('click', () => { selectedOnly = !selectedOnly; render(); });
  gallery.querySelector('.finish')!.addEventListener('click', async () => {
    const selected = frames.filter((frame) => frame.selected);
    if (!selected.length) { gallery.querySelector('.gallery-head span')!.textContent = 'Select at least one frame first.'; return; }
    const finish = gallery.querySelector<HTMLButtonElement>('.finish')!;
    const filter = gallery.querySelector<HTMLButtonElement>('.filter')!;
    finish.disabled = true;
    filter.disabled = true;
    try {
      const finalFrames = await captureSelectedFrames(getAdapter(), selected, (message) => { gallery.querySelector('.gallery-head span')!.textContent = message; });
      document.removeEventListener('keydown', keyboard);
      gallery.remove();
      showViewer(finalFrames);
    } catch (error) {
      gallery.querySelector('.gallery-head span')!.textContent = error instanceof Error ? error.message : 'Final capture failed.';
      finish.disabled = false;
      filter.disabled = false;
    }
  });
  document.addEventListener('keydown', keyboard);
  shadow.append(gallery);
  render();
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
    showGallery(frames);
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
  if (!busy && !shadow?.querySelector('.viewer') && !shadow?.querySelector('.gallery')) {
    const button = shadow?.querySelector<HTMLElement>('.launch');
    if (button) button.style.display = getAdapter().findVideo() ? 'block' : 'none';
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === 'LFE_START') { void startExtraction(message.preferences); respond({ ok: true }); }
  if (message.type === 'LFE_STATUS') {
    const video = getAdapter().findVideo();
    respond({ found: Boolean(video), busy, videoWidth: video?.videoWidth ?? 1920, videoHeight: video?.videoHeight ?? 1080 });
  }
  return false;
});

ensureUi();
refreshPresence();
const observer = new MutationObserver(refreshPresence);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('yt-navigate-finish', refreshPresence);
