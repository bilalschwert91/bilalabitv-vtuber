// Face tracking via MediaPipe Face Landmarker (browser, front camera).
// Produces normalized head pose + blendshape values. No smoothing here.

const MP_VERSION = '0.10';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

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
    this.cal = { pitchRatio: 0.42, yawOff: 0 };
    this.calSamples = [];
    this.calibrated = false;
    this.onStatus = () => {};
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

  setCalibration(cal) { if (cal) { this.cal = { ...this.cal, ...cal }; this.calibrated = true; } }

  // Start capturing samples; after ~1.2 s the neutral pose is stored.
  calibrate() { this.calSamples = []; this.calibrated = false; this.onStatus('Kalibriere: gerade in Kamera schauen …'); }

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

    if (!this.calibrated) {
      this.calSamples.push({ yawRaw, pitchRatio });
      if (this.calSamples.length >= 36) {
        const n = this.calSamples.length;
        this.cal.yawOff = this.calSamples.reduce((a, s) => a + s.yawRaw, 0) / n;
        this.cal.pitchRatio = this.calSamples.reduce((a, s) => a + s.pitchRatio, 0) / n;
        this.calibrated = true;
        this.onStatus('Kalibriert', 'ok');
        if (this.onCalibrated) this.onCalibrated({ ...this.cal });
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
      browInnerUp: bs.browInnerUp || 0,
      browDownL: bs.browDownLeft || 0,
      browDownR: bs.browDownRight || 0,
      browOuterUpL: bs.browOuterUpLeft || 0,
      browOuterUpR: bs.browOuterUpRight || 0,
      jawOpen: bs.jawOpen || 0,
      smile: ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2,
      frown: ((bs.mouthFrownLeft || 0) + (bs.mouthFrownRight || 0)) / 2,
      pucker: Math.max(bs.mouthPucker || 0, bs.mouthFunnel || 0),
    };
    return this.raw;
  }
}
