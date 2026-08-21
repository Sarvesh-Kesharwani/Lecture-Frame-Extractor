import { writeRecordToDirectory } from './storage/file-system';
import type { RuntimeMessage, VideoRecord } from './shared/types';

const recordKey = (id: string) => `video-record:${id}`;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === 'LFE_SAVE_RECORD') {
    void (async () => {
      const record = message.record;
      await chrome.storage.local.set({ [recordKey(record.id)]: record, 'video-record:recent': record.id, [`video-url:${record.url}`]: record.id });
      let folderSaved = false;
      try { folderSaved = await writeRecordToDirectory(record); } catch { folderSaved = false; }
      respond({ ok: true, folderSaved });
    })();
    return true;
  }
  if (message.type === 'LFE_GET_RECORD') {
    void (async () => {
      let id = message.id;
      if (!id && message.url) id = (await chrome.storage.local.get(`video-url:${message.url}`))[`video-url:${message.url}`] as string | undefined;
      if (!id) id = (await chrome.storage.local.get('video-record:recent'))['video-record:recent'] as string | undefined;
      const record = id ? (await chrome.storage.local.get(recordKey(id)))[recordKey(id)] as VideoRecord | undefined : undefined;
      respond({ record });
    })();
    return true;
  }
  if (message.type === 'LFE_LIST_RECORDS') {
    void chrome.storage.local.get(null).then((all) => respond({ records: Object.entries(all).filter(([key]) => key.startsWith('video-record:') && key !== 'video-record:recent').map(([, value]) => value as VideoRecord) }));
    return true;
  }
  return false;
});
