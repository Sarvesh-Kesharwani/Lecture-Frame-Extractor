export interface VideoAdapter {
  readonly name: string;
  findVideo(): HTMLVideoElement | null;
  seek(time: number): Promise<void>;
}

const waitForSeek = (video: HTMLVideoElement, time: number): Promise<void> => new Promise((resolve, reject) => {
  const safeTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.05));
  if (Math.abs(video.currentTime - safeTime) < 0.08 && video.readyState >= 2) {
    requestAnimationFrame(() => resolve());
    return;
  }
  const timeout = window.setTimeout(() => { cleanup(); reject(new Error('The player did not finish seeking.')); }, 12000);
  const done = () => { cleanup(); requestAnimationFrame(() => resolve()); };
  const failed = () => { cleanup(); reject(new Error('The player could not seek to this timestamp.')); };
  const cleanup = () => {
    clearTimeout(timeout);
    video.removeEventListener('seeked', done);
    video.removeEventListener('error', failed);
  };
  video.addEventListener('seeked', done, { once: true });
  video.addEventListener('error', failed, { once: true });
  video.currentTime = safeTime;
});

class GenericAdapter implements VideoAdapter {
  readonly name: string = 'HTML5 video';
  findVideo(): HTMLVideoElement | null {
    const videos = [...document.querySelectorAll<HTMLVideoElement>('video')]
      .filter((video) => video.duration > 0 && video.videoWidth > 0);
    return videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ?? null;
  }
  seek(time: number): Promise<void> {
    const video = this.findVideo();
    if (!video) return Promise.reject(new Error('No playable video was found.'));
    return waitForSeek(video, time);
  }
}

class YouTubeAdapter extends GenericAdapter {
  readonly name = 'YouTube';
  override findVideo() { return document.querySelector<HTMLVideoElement>('video.html5-main-video') ?? super.findVideo(); }
}

class UdemyAdapter extends GenericAdapter {
  readonly name = 'Udemy';
  override findVideo() {
    return document.querySelector<HTMLVideoElement>('[data-purpose="video-display"] video, video[data-purpose="video-display"]') ?? super.findVideo();
  }
}

export function getAdapter(): VideoAdapter {
  if (location.hostname.includes('youtube.com')) return new YouTubeAdapter();
  if (location.hostname.includes('udemy.com')) return new UdemyAdapter();
  return new GenericAdapter();
}
