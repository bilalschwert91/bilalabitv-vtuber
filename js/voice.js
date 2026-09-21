// Voice level from the microphone, used as a second lip-sync signal: speaking
// always makes sound, even when the lips barely part. Returns 0..1 with an
// adaptive noise floor, so room noise does not open the mouth.

export class VoiceLevel {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.floor = 0.02;
    this.peak = 0.15;
    this.level = 0;
  }

  get active() { return !!this.analyser; }

  // Create the AudioContext synchronously inside a user gesture (iOS requirement)
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  async attach(stream) {
    if (!stream || !stream.getAudioTracks().length) return;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) { /* needs a gesture */ } }
    if (this.src) { try { this.src.disconnect(); } catch (e) { /* ignore */ } }
    this.src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0;
    this.src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
  }

  // Call once per frame. RMS of the last ~11 ms of audio, mapped between the
  // tracked noise floor and a slowly decaying speech peak.
  update() {
    if (!this.analyser) return 0;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    // floor follows quiet moments quickly, rises only slowly
    this.floor = rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.999 + rms * 0.001;
    // peak follows loud moments, decays slowly, never below a sane minimum
    this.peak = Math.max(rms > this.peak ? rms : this.peak * 0.995, this.floor * 4, 0.04);
    const lo = this.floor * 2.2 + 0.004;
    const v = (rms - lo) / Math.max(1e-3, this.peak * 0.7 - lo);
    this.level = v < 0 ? 0 : v > 1 ? 1 : v;
    return this.level;
  }
}
