import type { VideoRecord } from '../shared/types';

const DB_NAME = 'lecture-frame-extractor-files';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'output-directory';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setOutputDirectory(handle: FileSystemDirectoryHandle) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getOutputDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  const database = await openDatabase();
  const result = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

const safeName = (value: string) => value.replace(/[<>:"/\\|?*]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 120) || 'Untitled Video';

async function writeFile(directory: FileSystemDirectoryHandle, name: string, contents: Blob | string) {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function writeRecordToDirectory(record: VideoRecord): Promise<boolean> {
  const selectedRoot = await getOutputDirectory();
  const permissionHandle = selectedRoot as FileSystemDirectoryHandle & { queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState> };
  if (!selectedRoot || (await permissionHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
  const root = await selectedRoot.getDirectoryHandle('video-notes', { create: true });
  const name = safeName(record.title);
  const videoDirectory = await root.getDirectoryHandle(name, { create: true });
  const framesDirectory = await videoDirectory.getDirectoryHandle('all-frames', { create: true });
  const metadata = {
    id: record.id,
    title: record.title,
    url: record.url,
    duration: record.duration,
    createdAt: record.createdAt,
    preferences: record.preferences,
    frames: record.frames.map((frame, index) => ({
      timestamp: frame.timestamp,
      selected: frame.selected,
      changeScore: frame.changeScore,
      density: frame.density,
      pixelWidth: frame.pixelWidth,
      pixelHeight: frame.pixelHeight,
      file: `all-frames/frame-${String(index + 1).padStart(4, '0')}-${Math.round(frame.timestamp)}s.jpg`,
    })),
  };
  await writeFile(videoDirectory, `${name}.json`, JSON.stringify(metadata, null, 2));
  for (let index = 0; index < record.frames.length; index += 1) {
    const frame = record.frames[index];
    const blob = await (await fetch(frame.dataUrl)).blob();
    await writeFile(framesDirectory, `frame-${String(index + 1).padStart(4, '0')}-${Math.round(frame.timestamp)}s.jpg`, blob);
  }
  return true;
}
