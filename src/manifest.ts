import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Lecture Frame Extractor',
  version: '1.0.0',
  description: 'Extracts the smallest useful set of major visual frames from lecture videos.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  permissions: ['storage', 'activeTab'],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Lecture Frame Extractor',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['src/content/index.ts'],
    run_at: 'document_idle',
    all_frames: false,
  }],
});
