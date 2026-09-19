import { Character, MOODS, defaultParams } from './character.js';
import { Tracker } from './tracker.js';

const $ = (s) => document.querySelector(s);
const STORE_KEY = 'bilalabitv-settings';

const state = {
  kit: 'home',
  glasses: false,
  mirror: true,
  demo: false,
  manualMood: null,   // null = auto
  autoMood: 'neutral',
  recording: false,
  cal: null,
};

const char = new Character($('#char-host'));
const video = $('#cam');
const tracker = new Tracker(video);
const statusEl = $('#status');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}
tracker.onStatus = setStatus;
tracker.onCalibrated = (cal) => { state.cal = cal; save(); };

// ---------- settings ----------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      kit: state.kit, glasses: state.glasses, mirror: state.mirror, cal: state.cal,
    }));
  } catch (e) { /* private mode */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (s.kit) state.kit = s.kit;
    if (typeof s.glasses === 'boolean') state.glasses = s.glasses;
    if (typeof s.mirror === 'boolean') state.mirror = s.mirror;
    if (s.cal) { state.cal = s.cal; tracker.setCalibration(s.cal); }
  } catch (e) { /* ignore */ }
}
load();

// ---------- UI ----------
function syncUI() {
  document.querySelectorAll('#seg-kit button').forEach((b) => b.classList.toggle('active', b.dataset.kit === state.kit));
  document.querySelectorAll('#seg-mood button').forEach((b) => b.classList.toggle('active', b.dataset.mood === (state.manualMood || 'auto')));
  $('#tg-glasses').checked = state.glasses;
  $('#tg-mirror').checked = state.mirror;
  $('#tg-demo').checked = state.demo;
  char.setKit(state.kit);
  char.setGlasses(state.glasses);
}
$("#stage").classList.add("setup");
char.setFit("meet");
syncUI();

$('#seg-kit').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.kit = b.dataset.kit; save(); syncUI();
});
$('#seg-mood').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.manualMood = b.dataset.mood === 'auto' ? null : b.dataset.mood;
  syncUI();
});
$('#tg-glasses').addEventListener('change', (e) => { state.glasses = e.target.checked; save(); syncUI(); });
$('#tg-mirror').addEventListener('change', (e) => { state.mirror = e.target.checked; save(); });
$('#tg-demo').addEventListener('change', (e) => { state.demo = e.target.checked; });

let camStarted = false;
$('#btn-cam').addEventListener('click', async () => {
  if (camStarted) return;
  const btn = $('#btn-cam');
  btn.disabled = true;
  try {
    setStatus('Kamera wird gestartet …');
    await tracker.startCamera();
    $('#cam-wrap').className = 'preview-cam';
    await tracker.load();
    camStarted = true;
    btn.textContent = 'Kamera läuft';
    if (!state.cal) tracker.calibrate();
    else setStatus('Tracking läuft', 'ok');
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    setStatus(denied ? 'Kamera verweigert. Einstellungen > Safari > Kamera > Erlauben' : 'Fehler: ' + (err && err.message ? err.message : err), 'err');
    btn.disabled = false;
  }
});

$('#btn-cal').addEventListener('click', () => {
  if (!camStarted) { setStatus('Erst Kamera starten', 'warn'); return; }
  tracker.calibrate();
});

// ---------- recording mode ----------
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

function enterRecording() {
  state.recording = true;
  $("#stage").classList.remove("setup");
  char.setFit("slice");
  $('#panel').classList.add('hidden');
  $('#cam-wrap').className = 'hidden-cam';
  $('#zones').hidden = false;
  $('#exit-zone').hidden = false;
  requestWakeLock();
}
function exitRecording() {
  state.recording = false;
  $("#stage").classList.add("setup");
  char.setFit("meet");
  $('#panel').classList.remove('hidden');
  if (camStarted) $('#cam-wrap').className = 'preview-cam';
  $('#zones').hidden = true;
  $('#exit-zone').hidden = true;
  releaseWakeLock();
  syncUI();
}
$('#btn-rec').addEventListener('click', enterRecording);

// Mood zones: tap = set mood; tap the active one again = back to auto
$('#zones').addEventListener('pointerdown', (e) => {
  const z = e.target.closest('.zone'); if (!z) return;
  const m = z.dataset.mood;
  state.manualMood = state.manualMood === m ? null : m;
});

// Exit zone: double tap
let lastTap = 0;
$('#exit-zone').addEventListener('pointerdown', () => {
  const now = performance.now();
  if (now - lastTap < 350) exitRecording();
  lastTap = now;
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.recording) requestWakeLock(); });

// ---------- animation ----------
const cur = defaultParams();          // smoothed output
let moodRoll = 0;
let faceLostAt = null;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Auto mood from tracked face, with debounce
let autoCandidate = 'neutral', autoSince = 0;
function detectMood(r, now) {
  let m = 'neutral';
  if (r.smile > 0.45) m = 'happy';
  else if ((r.browDownL + r.browDownR) / 2 > 0.45 && r.smile < 0.2) m = 'angry';
  else if (r.browInnerUp > 0.5 && r.frown > 0.25) m = 'sad';
  else if (Math.abs(r.browOuterUpL - r.browOuterUpR) > 0.35) m = 'question';
  if (m !== autoCandidate) { autoCandidate = m; autoSince = now; }
  if (now - autoSince > 280) state.autoMood = autoCandidate;
}

function demoRaw(t) {
  const s = t / 1000;
  return {
    yaw: Math.sin(s * 0.9) * 0.5, pitch: Math.sin(s * 0.6) * 0.3, roll: Math.sin(s * 0.5) * 8,
    posX: 0, posY: 0,
    blinkL: (s % 3.1) < 0.15 ? 1 : 0, blinkR: (s % 3.1) < 0.15 ? 1 : 0, squintL: 0, squintR: 0,
    lookIn: 0, lookOut: Math.max(0, Math.sin(s * 0.7)) * 0.5, lookUp: 0, lookDown: 0,
    browInnerUp: 0, browDownL: 0, browDownR: 0, browOuterUpL: 0, browOuterUpR: 0,
    jawOpen: Math.max(0, Math.sin(s * 9)) * 0.55 * (Math.sin(s * 1.3) > -0.3 ? 1 : 0),
    smile: 0, frown: 0, pucker: 0,
  };
}

function frame(now) {
  requestAnimationFrame(frame);
  cur.time = now;

  let raw = null;
  if (state.demo) raw = demoRaw(now);
  else if (camStarted) raw = tracker.tick(now);

  const target = defaultParams();
  const sign = state.mirror ? 1 : -1;

  if (raw) {
    faceLostAt = null;
    target.yaw = clamp(raw.yaw * sign * -1, -1, 1);     // image-right = user's left; mirror flips
    target.pitch = clamp(raw.pitch, -1, 1);
    target.roll = clamp(raw.roll * sign * -1, -25, 25);
    target.posX = clamp(raw.posX * sign * -1, -1, 1) * 30;
    target.posY = clamp(raw.posY, -1, 1) * 20;
    target.eyeL = 1 - clamp(raw.blinkL * 1.15, 0, 1) - raw.squintL * 0.25;
    target.eyeR = 1 - clamp(raw.blinkR * 1.15, 0, 1) - raw.squintR * 0.25;
    target.gazeX = (raw.lookOut - raw.lookIn) * sign * -1;
    target.gazeY = raw.lookDown - raw.lookUp;
    target.browL = -(raw.browInnerUp * 0.6 + raw.browOuterUpL) * 22 + raw.browDownL * 14;
    target.browR = -(raw.browInnerUp * 0.6 + raw.browOuterUpR) * 22 + raw.browDownR * 14;
    target.mouthOpen = clamp(raw.jawOpen * 1.35, 0, 1);
    target.smile = clamp(raw.smile * 0.9 - raw.frown * 0.8, -1, 1);
    target.mouthWidth = 1 + raw.smile * 0.25 - raw.pucker * 0.35;
    if (!state.manualMood && !state.demo) detectMood(raw, now);
  } else {
    if (faceLostAt === null) faceLostAt = now;
    // no face: drift to neutral pose (targets already default)
  }

  // Mood blend
  const moodName = state.manualMood || (state.demo ? 'neutral' : state.autoMood);
  const mood = MOODS[moodName] || MOODS.neutral;
  char.setMoodTarget(moodName);
  moodRoll = lerp(moodRoll, mood.roll, 0.12);

  // Smoothing: head slower, mouth/eyes fast
  const aHead = raw ? 0.32 : 0.06, aFast = raw ? 0.6 : 0.1;
  cur.yaw = lerp(cur.yaw, target.yaw, aHead);
  cur.pitch = lerp(cur.pitch, target.pitch, aHead);
  cur.roll = lerp(cur.roll, target.roll + moodRoll, aHead);
  cur.posX = lerp(cur.posX, target.posX, aHead);
  cur.posY = lerp(cur.posY, target.posY, aHead);
  cur.eyeL = lerp(cur.eyeL, clamp(target.eyeL, 0, 1), aFast);
  cur.eyeR = lerp(cur.eyeR, clamp(target.eyeR, 0, 1), aFast);
  cur.gazeX = lerp(cur.gazeX, target.gazeX, aFast);
  cur.gazeY = lerp(cur.gazeY, target.gazeY, aFast);
    cur.mouthOpen = lerp(cur.mouthOpen, target.mouthOpen, aFast);
  cur.smile = lerp(cur.smile, clamp(target.smile, -1, 1), 0.35);
  cur.mouthWidth = lerp(cur.mouthWidth, target.mouthWidth, 0.35);
  
  // Idle blink when no tracking
  if (!raw) {
    const b = (now % 3400) < 130 ? 0 : 1;
    cur.eyeL = lerp(cur.eyeL, b, 0.5);
    cur.eyeR = lerp(cur.eyeR, b, 0.5);
  }

  char.update(cur);
}
window.vt = { char, state, cur };
requestAnimationFrame(frame);

setStatus('Lade Bilder …');
char.load((n, total) => setStatus(`Lade Bilder ${n}/${total}`)).then(() => {
  setStatus(camStarted ? 'Tracking läuft' : 'Bereit. Kamera starten.', camStarted ? 'ok' : '');
}).catch((err) => setStatus(err.message, 'err'));
