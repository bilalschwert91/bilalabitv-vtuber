// Face tracking via MediaPipe Face Landmarker (browser, front camera).
// Produces normalized head pose + blendshape values. No smoothing here.

const MP_VERSION = '0.10';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Blendshapes that describe an expression; averaged during calibration
export const EXPR_KEYS = ['browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'noseSneerLeft', 'noseSneerRight', 'mouthPressLeft', 'mouthPressRight', 'eyeSquintLeft', 'eyeSquintRight'];

// Expression values relative to the resting face (never negative)
export function exprFromBs(bs, rest) {
  rest = rest || {};
  const rel = (k) => Math.max(0, (bs[k] || 0) - (rest[k] || 0));
  return {
    browInnerUp: rel('browInnerUp'),
    browDownL: rel('browDownLeft'),
    browDownR: rel('browDownRight'),
    browOuterUpL: rel('browOuterUpLeft'),
    browOuterUpR: rel('browOuterUpRight'),
    smile: (rel('mouthSmileLeft') + rel('mouthSmileRight')) / 2,
    frown: (rel('mouthFrownLeft') + rel('mouthFrownRight')) / 2,
    mouthDown: (rel('mouthLowerDownLeft') + rel('mouthLowerDownRight')) / 2,
    mouthPress: (rel('mouthPressLeft') + rel('mouthPressRight')) / 2,
    noseSneer: (rel('noseSneerLeft') + rel('noseSneerRight')) / 2,
    squint: (rel('eyeSquintLeft') + rel('eyeSquintRight')) / 2,
  };
}

// Landmark indices (MediaPipe 478-point mesh)
const LM = { nose: 1, eyeLOuter: 33, eyeROuter: 263, faceL: 234, faceR: 454, chin: 152, forehead: 10 };

export class Tracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.lastDetect = 0;
    this.face = false;
    this.raw = null;
    // pose offsets, the resting face and one blendshape average per calibrated mood
    this.cal = { pitchRatio: 0.42, yawOff: 0, rest: null, moods: null };
    this.capture = null;             // active sample window, see startCapture()
    this.onStatus = () => {};
    this.onCalProgress = () => {};   // (0..1, faceVisible)
  }

  async load() {
    this.onStatus('Lade Tracking-Modell …');
    const mod = await import(`${MP_BASE}/vision_bundle.mjs`);
    const vision = await mod.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    try {
      this.landmarker = await mod.FaceLandmarker.createFromOptions(vision, opts('GPU'));
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err);
      this.landmarker = await mod.FaceLandmarker.createFromOptions(vision, opts('CPU'));
    }
    this.onStatus('Tracking bereit');
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  setCalibration(cal) { if (cal) this.cal = { ...this.cal, ...cal }; }

  // Collect `need` consecutive still-head samples. Resolves with the averages
  // { yawRaw, pitchRatio, bs } or null when cancelled. A head jump or a lost face
  // restarts the window; onCalProgress reports the fill level.
  startCapture(need = 45) {
    this.cancelCapture();
    return new Promise((resolve) => {
      this.capture = { need, samples: [], resolve };
      this.onCalProgress(0, this.face);
    });
  }
  cancelCapture() {
    if (this.capture) { const c = this.capture; this.capture = null; c.resolve(null); }
  }

  // Call every animation frame. Returns raw values or null (no face).
  tick(now) {
    if (!this.landmarker || this.video.readyState < 2) return null;
    if (this.video.currentTime === this.lastVideoTime) return this.raw;
    if (now - this.lastDetect < 30) return this.raw;
    this.lastVideoTime = this.video.currentTime;
    this.lastDetect = now;

    let res;
    try { res = this.landmarker.detectForVideo(this.video, now); } catch (e) { return this.raw; }
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) {
      this.face = false;
      this.raw = null;
      if (this.capture) { this.capture.samples = []; this.onCalProgress(0, false); }
      return null;
    }
    this.face = true;
    const lm = res.faceLandmarks[0];
    const bs = {};
    if (res.faceBlendshapes && res.faceBlendshapes[0]) {
      for (const c of res.faceBlendshapes[0].categories) bs[c.categoryName] = c.score;
    }

    const nose = lm[LM.nose], fl = lm[LM.faceL], fr = lm[LM.faceR];
    const el = lm[LM.eyeLOuter], er = lm[LM.eyeROuter], chin = lm[LM.chin];
    const midX = (fl.x + fr.x) / 2;
    const halfW = Math.max(1e-4, Math.abs(fr.x - fl.x) / 2);
    const eyeMidY = (el.y + er.y) / 2;
    const faceH = Math.max(1e-4, chin.y - eyeMidY);

    const yawRaw = (nose.x - midX) / halfW;          // image space, +x = image right
    const pitchRatio = (nose.y - eyeMidY) / faceH;   // ~0.42 neutral, larger = head down
    const rollRaw = Math.atan2(er.y - el.y, er.x - el.x) * 180 / Math.PI;

    if (this.capture) {
      const c = this.capture;
      // Head must hold still: a jump resets the sample window
      const last = c.samples[c.samples.length - 1];
      if (last && (Math.abs(last.yawRaw - yawRaw) > 0.1 || Math.abs(last.pitchRatio - pitchRatio) > 0.04)) c.samples = [];
      c.samples.push({ yawRaw, pitchRatio, bs: EXPR_KEYS.map((k) => bs[k] || 0) });
      this.onCalProgress(Math.min(1, c.samples.length / c.need), true);
      if (c.samples.length >= c.need) {
        const n = c.samples.length;
        const avg = {};
        EXPR_KEYS.forEach((k, i) => { avg[k] = c.samples.reduce((a, s) => a + s.bs[i], 0) / n; });
        this.capture = null;
        c.resolve({
          yawRaw: c.samples.reduce((a, s) => a + s.yawRaw, 0) / n,
          pitchRatio: c.samples.reduce((a, s) => a + s.pitchRatio, 0) / n,
          bs: avg,
        });
      }
    }

    this.raw = {
      yaw: (yawRaw - this.cal.yawOff) * 1.8,
      pitch: (pitchRatio - this.cal.pitchRatio) * 6,
      roll: rollRaw,
      posX: (nose.x - 0.5) * 2,
      posY: (nose.y - 0.5) * 2,
      blinkL: bs.eyeBlinkLeft || 0,
      blinkR: bs.eyeBlinkRight || 0,
      squintL: bs.eyeSquintLeft || 0,
      squintR: bs.eyeSquintRight || 0,
      lookIn: ((bs.eyeLookInLeft || 0) + (bs.eyeLookOutRight || 0)) / 2,
      lookOut: ((bs.eyeLookOutLeft || 0) + (bs.eyeLookInRight || 0)) / 2,
      lookUp: ((bs.eyeLookUpLeft || 0) + (bs.eyeLookUpRight || 0)) / 2,
      lookDown: ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2,
      jawOpen: bs.jawOpen || 0,
      pucker: Math.max(bs.mouthPucker || 0, bs.mouthFunnel || 0),
      // expression values relative to the calibrated resting face
      ...exprFromBs(bs, this.cal.rest),
    };
    return this.raw;
  }
}
