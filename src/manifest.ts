import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Lecture Frame Extractor',
  version: '1.0.0',
  description: 'Extracts the smallest useful set of major visual frames from lecture videos.',
  permissions: ['storage', 'activeTab'],
  action: { default_popup: 'src/popup/index.html', default_title: 'Lecture Frame Extractor' },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['src/content/index.ts'],
    run_at: 'document_idle',
    all_frames: false,
  }],
});
