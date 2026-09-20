import { Character, MOODS, defaultParams } from './character.js';
import { Tracker } from './tracker.js';
import { Recorder, saveFile } from './recorder.js';

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
  prText: '',
  prSpeed: 40,   // px/s
  prSize: 26,    // px
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
tracker.onCalibrated = (cal) => {
  state.cal = cal; save();
  $('#cal-msg').textContent = 'Fertig';
  $('#cal-bar').style.width = '100%';
  setTimeout(hideCalibration, 700);
};
tracker.onCalProgress = (p, face) => {
  const bar = $('#cal-bar');
  bar.style.width = Math.round(p * 100) + '%';
  bar.classList.toggle('lost', !face);
  $('#cal-msg').textContent = !face ? 'Kein Gesicht erkannt. Gesicht in den Rahmen.'
    : p < 0.05 ? 'Gesicht erkannt. Stillhalten …'
    : 'Stillhalten … ' + Math.round(p * 100) + ' %';
};
function showCalibration() {
  $('#cal-overlay').hidden = false;
  $('#cam-wrap').className = 'cal-cam';
  $('#cal-bar').style.width = '0%';
  $('#cal-msg').textContent = 'Suche Gesicht …';
  tracker.calibrate();
}
function hideCalibration() {
  $('#cal-overlay').hidden = true;
  if (camStarted) $('#cam-wrap').className = state.recording ? 'hidden-cam' : 'preview-cam';
}
$('#cal-cancel').addEventListener('click', () => { tracker.cancelCalibration(); hideCalibration(); setStatus('Kalibrierung abgebrochen', 'warn'); });

// ---------- settings ----------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      kit: state.kit, glasses: state.glasses, mirror: state.mirror, cal: state.cal,
      prText: state.prText, prSpeed: state.prSpeed, prSize: state.prSize,
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
    if (typeof s.prText === 'string') state.prText = s.prText;
    if (s.prSpeed) state.prSpeed = s.prSpeed;
    if (s.prSize) state.prSize = s.prSize;
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

// ---------- teleprompter ----------
const prInput = $('#pr-input'), prSpeedIn = $('#pr-speed-in'), prSizeIn = $('#pr-size-in');
const prScroll = $('#prompter-scroll'), prTextEl = $('#prompter-text');
let prRunning = false, prLast = 0, prAcc = 0;
function syncPrompter() {
  prInput.value = state.prText;
  prSpeedIn.value = state.prSpeed; $('#pr-speed-lbl').textContent = state.prSpeed;
  prSizeIn.value = state.prSize; $('#pr-size-lbl').textContent = state.prSize;
  prTextEl.textContent = state.prText;
  prTextEl.style.fontSize = state.prSize + 'px';
  $('#pr-speed').textContent = (state.prSpeed / 40).toFixed(1) + '×';
  $('#pr-play').classList.toggle('on', prRunning);
  $('#pr-play').textContent = prRunning ? '❙❙' : '▶';
}
prInput.addEventListener('input', () => { state.prText = prInput.value; save(); syncPrompter(); });
prSpeedIn.addEventListener('input', () => { state.prSpeed = +prSpeedIn.value; save(); syncPrompter(); });
prSizeIn.addEventListener('input', () => { state.prSize = +prSizeIn.value; save(); syncPrompter(); });
function prSetRunning(on) { prRunning = on; prLast = 0; syncPrompter(); }
$('#pr-play').addEventListener('click', () => prSetRunning(!prRunning));
$('#pr-top').addEventListener('click', () => { prScroll.scrollTop = 0; });
$('#pr-slower').addEventListener('click', () => { state.prSpeed = Math.max(10, state.prSpeed - 5); save(); syncPrompter(); });
$('#pr-faster').addEventListener('click', () => { state.prSpeed = Math.min(120, state.prSpeed + 5); save(); syncPrompter(); });
// finger on the text pauses auto-scroll so manual scrolling wins
prScroll.addEventListener('pointerdown', () => { if (prRunning) prSetRunning(false); });
function prTick(now) {
  if (!prRunning) return;
  if (prLast) {
    prAcc += (now - prLast) / 1000 * state.prSpeed;
    const step = Math.floor(prAcc);
    if (step) { prScroll.scrollTop += step; prAcc -= step; }
    if (prScroll.scrollTop + prScroll.clientHeight >= prScroll.scrollHeight - 1) prSetRunning(false);
  }
  prLast = now;
}
syncPrompter();

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
    if (!state.cal || !state.cal.rest) showCalibration();
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
  showCalibration();
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
  $('#rec-ui').hidden = !Recorder.supported();
  $('#prompter').hidden = !state.prText.trim();
  prScroll.scrollTop = 0; prSetRunning(false);
  syncZones();
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
  $('#rec-ui').hidden = true;
  $('#prompter').hidden = true;
  prSetRunning(false);
  releaseWakeLock();
  syncUI();
}
$('#btn-rec').addEventListener('click', enterRecording);

// Mood zones: tap = set mood; tap the active one again = back to auto
$('#zones').addEventListener('pointerdown', (e) => {
  const z = e.target.closest('.zone'); if (!z) return;
  const m = z.dataset.mood;
  state.manualMood = state.manualMood === m ? null : m;
  syncZones();
});
function syncZones() {
  document.querySelectorAll('#zones .zone').forEach((z) => z.classList.toggle('active', z.dataset.mood === state.manualMood));
  syncAutoMood();
}

// ---------- in-app video recording (canvas + mic) ----------
const recorder = new Recorder(char.canvas);
const recBtn = $('#rec-toggle'), recTime = $('#rec-time');
const recPause = $('#rec-pause'), recRestart = $('#rec-restart'), recHint = $('#rec-hint');
recorder.onState = (st) => {
  const on = st === 'recording', paused = st === 'paused', running = on || paused;
  recBtn.classList.toggle('on', running);
  recBtn.classList.toggle('paused', paused);
  recTime.classList.toggle('on', on);
  recTime.classList.toggle('paused', paused);
  recPause.hidden = !running; recRestart.hidden = !running;
  recPause.textContent = paused ? '▶' : '❙❙';
  recHint.textContent = paused ? 'Pause' : '';
  if (!running) recTime.textContent = '00:00';
  // the prompter follows the take
  if (on) prSetRunning(!!state.prText.trim());
  else prSetRunning(false);
};
recPause.addEventListener('click', () => { if (recorder.paused) recorder.resume(); else recorder.pause(); });
// restart = discard: needs a second tap within 2.5 s
let restartArmed = 0;
recRestart.addEventListener('click', async () => {
  const now = performance.now();
  if (now - restartArmed > 2500) {
    restartArmed = now;
    recRestart.classList.add('armed');
    recHint.textContent = 'Nochmal tippen: verwerfen + neu';
    setTimeout(() => { recRestart.classList.remove('armed'); if (recHint.textContent.startsWith('Nochmal')) recHint.textContent = ''; }, 2500);
    return;
  }
  restartArmed = 0;
  recRestart.classList.remove('armed');
  recRestart.disabled = true;
  try {
    await recorder.restart();
    prScroll.scrollTop = 0;
    recHint.textContent = 'Neu gestartet';
    setTimeout(() => { if (recHint.textContent === 'Neu gestartet') recHint.textContent = ''; }, 1500);
  } catch (err) { console.error(err); setStatus('Aufnahme-Fehler: ' + (err && err.message ? err.message : err), 'err'); }
  recRestart.disabled = false;
});
recBtn.addEventListener('click', async () => {
  recBtn.disabled = true;
  try {
    if (!recorder.running) {
      await recorder.start();
    } else {
      const file = await recorder.stop();
      if (file) {
        const how = await saveFile(file);
        const mb = Math.max(1, Math.round(file.size / 1048576));
        const msg = how === 'cancelled' ? 'Verworfen' : 'Gespeichert · ' + mb + ' MB';
        setStatus(how === 'cancelled' ? 'Video verworfen' : 'Video gespeichert (' + mb + ' MB)', how === 'cancelled' ? 'warn' : 'ok');
        recTime.textContent = msg;
        setTimeout(() => { if (!recorder.active) recTime.textContent = '00:00'; }, 4000);
      }
    }
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    setStatus(denied ? 'Mikrofon verweigert. Einstellungen > Safari > Mikrofon > Erlauben' : 'Aufnahme-Fehler: ' + (err && err.message ? err.message : err), 'err');
    exitRecording();
  }
  recBtn.disabled = false;
});
// Backgrounded mid-take: pause instead of stop, nothing is lost and the user resumes
document.addEventListener('visibilitychange', () => {
  if (document.hidden && recorder.active) recorder.pause();
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
function smoothstep(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Auto mood from tracked face, with debounce
// Values are relative to the calibrated resting face. Entering a mood needs the
// full threshold, staying in it only 60 % of it (hysteresis), so a mood does
// not flicker while talking.
let autoCandidate = 'neutral', autoSince = 0;
function moodScores(r) {
  const browDown = (r.browDownL + r.browDownR) / 2;
  return {
    happy: r.smile,
    angry: browDown * 0.8 + r.noseSneer * 0.4 - r.smile * 0.5,
    sad: Math.max(r.browInnerUp * 0.6 + r.frown * 0.8 + r.mouthDown * 0.5, r.frown * 1.4) - r.smile * 0.5,
    question: Math.abs(r.browOuterUpL - r.browOuterUpR) * 1.2 + Math.abs(r.browDownL - r.browDownR) * 0.8,
  };
}
const MOOD_ON = { happy: 0.28, angry: 0.22, sad: 0.22, question: 0.22 };
function detectMood(r, now) {
  const sc = moodScores(r);
  let m = 'neutral', best = 0;
  for (const k in sc) {
    const th = MOOD_ON[k] * (state.autoMood === k ? 0.6 : 1);
    if (sc[k] > th && sc[k] > best) { m = k; best = sc[k]; }
  }
  if (m !== autoCandidate) { autoCandidate = m; autoSince = now; }
  const hold = m === 'neutral' ? 450 : 200;   // fall back to neutral slower than entering a mood
  if (now - autoSince > hold && state.autoMood !== autoCandidate) { state.autoMood = autoCandidate; syncAutoMood(); }
}
const MOOD_LABEL = { neutral: 'Neutral', happy: 'Glücklich', sad: 'Enttäuscht', angry: 'Sauer', question: 'Fraglich' };
function syncAutoMood() {
  $('#seg-mood button[data-mood="auto"]').textContent = 'Auto: ' + MOOD_LABEL[state.autoMood];
  document.querySelectorAll('#zones .zone').forEach((z) => z.classList.toggle('auto', !state.manualMood && z.dataset.mood === state.autoMood));
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
    smile: 0, frown: 0, mouthDown: 0, noseSneer: 0, pucker: 0,
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
    // Wink: the open eye usually reports a partial blink too, so pull it down by the
    // difference. A real blink has both values close together and is unaffected.
    const bL = clamp(raw.blinkL - Math.max(0, raw.blinkR - raw.blinkL) * 0.7, 0, 1);
    const bR = clamp(raw.blinkR - Math.max(0, raw.blinkL - raw.blinkR) * 0.7, 0, 1);
    // Snap: below 0.3 fully open, above 0.6 fully closed, no half-transparent eyes
    const closeL = smoothstep(0.3, 0.6, bL) + raw.squintL * 0.15;
    const closeR = smoothstep(0.3, 0.6, bR) + raw.squintR * 0.15;
    // MediaPipe "Left" = the user's left eye. Mirrored, that is screen-left = image eyeL.
    target.eyeL = 1 - (state.mirror ? closeL : closeR);
    target.eyeR = 1 - (state.mirror ? closeR : closeL);
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
  prTick(now);
  if (recorder.running) {
    const t = Math.floor(recorder.elapsed());
    recTime.textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
}
window.vt = { char, state, cur };
requestAnimationFrame(frame);

setStatus('Lade Bilder …');
char.load((n, total) => setStatus(`Lade Bilder ${n}/${total}`)).then(() => {
  setStatus(camStarted ? 'Tracking läuft' : 'Bereit. Kamera starten.', camStarted ? 'ok' : '');
}).catch((err) => setStatus(err.message, 'err'));
