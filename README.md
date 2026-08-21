# Lecture Frame Extractor

A local-first Chrome Manifest V3 extension that finds a compact set of major, useful visual states in long lecture videos. It targets YouTube and Udemy and also supports accessible HTML5 video on other sites.

## Why this stack

TypeScript + React + Vite (via CRXJS) gives a small, typed MV3 build and reliable multi-entry extension packaging. Flow.js is a static type checker rather than an extension framework; TypeScript provides the same safety with much stronger tooling here. React is used only for the tiny popup. The in-page UI uses dependency-free DOM and Shadow DOM.

## Extraction algorithm

1. Adaptively sample 50–360 timestamps instead of decoding every frame.
2. Seek the existing player and analyze a 32×18 grayscale image.
3. Divide the image into blocks, exclude the bottom controls strip, and trim the noisiest blocks so cursors, webcam motion, and small annotations do not trigger captures.
4. Segment major visual transitions using robust pixel-change and changed-area scores.
5. Prefer the final (most complete) state before each transition. Auto mode may retain an additional evolved state for a long, information-changing canvas; Minimum mode retains only segment endpoints.
6. Remove perceptually near-duplicate selections.
7. Perform a second pass that captures only selected timestamps as high-quality JPEGs (up to 1600px wide).

Everything is processed locally. No video or image is uploaded.

## Development

Requires Node.js 20+.

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

For rebuild-on-change development:

```powershell
npm.cmd run dev
```

## Install locally

1. Run `npm.cmd install` and `npm.cmd run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `D:\VideoNotes\dist`.
5. Reload any already-open video tab once after first installation.

## Architecture

- `src/core/adapters.ts`: generic HTML5, YouTube, and Udemy player adapters.
- `src/core/extractor.ts`: bounded two-pass temporal analysis and capture.
- `src/core/similarity.ts`: low-resolution robust visual comparison.
- `src/core/selection.ts`: state segmentation and near-duplicate removal.
- `src/content/index.ts`: SPA-safe in-page button, progress, and full-viewport viewer.
- `src/popup`: persisted Auto/Minimum mode and sensitivity.

## Current support and limitations

- **YouTube:** standard on-page HTML5 videos, SPA navigation, seeking, extraction, viewer navigation, and timestamp seeking.
- **Udemy:** standard directly accessible HTML5 lesson videos. Udemy can vary its player markup; the adapter falls back to the largest playable video.
- Extraction temporarily seeks through the lecture, pauses playback, and restores the original time/play state afterward.
- A long lecture requires roughly 50–360 player seeks, so extraction speed depends on media buffering and network conditions.
- Browser security prevents canvas access to some cross-origin videos. DRM/EME content, protected media, inaccessible cross-origin video, and video inside cross-origin iframes cannot be extracted. The extension detects canvas blocking and explains it; it does not bypass protection.
- Live streams or videos without a finite seekable duration are unsupported.
- Frames exist only in the current page session and are released when the page closes or navigates.
