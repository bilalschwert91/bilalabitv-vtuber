// In-app recording: the character canvas plus the microphone go into a MediaRecorder.
// Only the canvas is captured, so on-screen buttons never end up in the video.
// Safari produces MP4 (H.264/AAC), Chrome WebM.

function pickMime() {
  const list = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.mic = null;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
    this.onState = () => {};
  }

  get active() { return !!this.rec && this.rec.state === 'recording'; }

  static supported() {
    return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && pickMime());
  }

  async start() {
    if (this.active) return;
    if (!this.mic || !this.mic.active) {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    }
    const video = this.canvas.captureStream(30);
    const stream = new MediaStream([...video.getVideoTracks(), ...this.mic.getAudioTracks()]);
    const mimeType = pickMime();
    this.chunks = [];
    this.rec = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 128_000,
    });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start();   // one blob at stop: Safari's MP4 chunks are not concatenable
    this.startedAt = performance.now();
    this.onState('recording');
  }

  // Resolves with the finished file
  stop() {
    return new Promise((resolve) => {
      if (!this.rec) { resolve(null); return; }
      const rec = this.rec;
      rec.onstop = () => {
        const type = rec.mimeType || 'video/mp4';
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(this.chunks, { type });
        this.rec = null;
        this.chunks = [];
        this.onState('idle');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        resolve(new File([blob], `bilalabitv-${stamp}.${ext}`, { type }));
      };
      rec.stop();
    });
  }

  elapsed() { return this.active ? (performance.now() - this.startedAt) / 1000 : 0; }

  release() {
    if (this.mic) { this.mic.getTracks().forEach((t) => t.stop()); this.mic = null; }
  }
}

// iOS: share sheet with "Video sichern" (saves to Photos). Elsewhere: download.
export async function saveFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'BilalAbiTV' });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  return 'downloaded';
}
