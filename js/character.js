// Character: layered raster (Gemini artwork) rendered on a canvas.
// Head, mouth, eyes and moods are regions cut from the source images and
// blended per frame. All coordinates are in source-image pixels (768x1376).

export const MOODS = {
  neutral:  { roll: 0 },
  happy:    { roll: 0 },
  sad:      { roll: 0 },
  angry:    { roll: 0 },
  question: { roll: 5 },
};

export const MOOD_LABELS = {
  neutral: 'Neutral', happy: 'Glücklich', sad: 'Enttäuscht', angry: 'Sauer', question: 'Fraglich',
};

const IMG_W = 768, IMG_H = 1376;
const SCALE = 1.5; // internal render scale for sharper upscaling on 1080p screens

const FILES = {
  home_neutral: 'img/home_neutral.jpg',
  home_mouth_open: 'img/home_mouth_open.jpg',
  home_eyes_closed: 'img/home_eyes_closed.jpg',
  home_happy: 'img/home_happy.jpg',
  home_sad: 'img/home_sad.jpg',
  home_angry: 'img/home_angry.jpg',
  home_question: 'img/home_question.jpg',
  away_neutral: 'img/away_neutral.jpg',
  third_neutral: 'img/third_neutral.jpg',
};

const MOOD_IMG = { happy: 'home_happy', sad: 'home_sad', angry: 'home_angry', question: 'home_question' };
// Optional: open-mouth versions per mood. If the file exists it is used, otherwise the neutral open mouth.
const MOOD_OPEN = { happy: 'img/home_happy_open.jpg', sad: 'img/home_sad_open.jpg', angry: 'img/home_angry_open.jpg', question: 'img/home_question_open.jpg' };

// Geometry measured from the artwork
// Inner edge of the V collar (measured), top to the V point, right side; left is mirrored
const COLLAR_R = [[522, 860], [516, 870], [509, 880], [502, 890], [494, 900], [485, 910], [476, 920], [466, 930], [455, 940], [444, 950], [432, 960], [419, 970], [405, 980], [390, 990], [384, 998]];
const COLLAR_L = COLLAR_R.slice(0, -1).reverse().map(([x, y]) => [768 - x, y]);

// Neck + chest skin inside the collar: moves with the head, the shirt is drawn over it
const NECK_POLY = [[222, 700], [547, 700], [540, 730], [530, 760], [530, 848], ...COLLAR_R, ...COLLAR_L, [238, 848], [238, 760], [229, 730]];

const G = {
  pivot: { x: 384, y: 985 },          // base of the neck (V point), rotation pivot
  headDy: 22,                         // push the whole head+neck unit down (shorter visible neck)
  headTop: [[0, 0], [768, 0], [768, 700], [0, 700]],
  neck: NECK_POLY,
  bodyTop: 700,
  mouth: { x: 384, y: 690, rx: 74, ry: 46 },
  eyeL: { x: 298, y: 515, rx: 74, ry: 46 },
  eyeR: { x: 468, y: 515, rx: 74, ry: 46 },
  earL: { x: 172, y: 520 }, earR: { x: 598, y: 520 },
  sponsor: { x: 384, y: 1242, w: 346, h: 108 },
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Bild fehlt: ' + src));
    im.src = src;
  });
}

// Chroma key: green background -> transparent, soft edge
function keyGreen(im) {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dom = g - Math.max(r, b);
    if (dom > 42 && g > 90) { d[i + 3] = 0; continue; }
    if (dom > 20 && g > 90) {
      const t = (dom - 20) / 22;
      d[i + 3] = Math.round(255 * (1 - t));
      // kill green spill on the edge
      d[i + 1] = Math.max(r, b);
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Copy an elliptic region of img into its own canvas with a feathered alpha edge
function makePatch(img, e) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(1, e.ry / e.rx);
  const grad = ctx.createRadialGradient(0, 0, e.rx * 0.5, 0, 0, e.rx);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-e.rx, -e.rx, e.rx * 2, e.rx * 2);
  ctx.restore();
  return c;
}

export class Character {
  constructor(host) {
    this.host = host;
    this.kit = 'home';
    this.glasses = false;
    this.ready = false;
    this.img = {};
    this.moodW = { neutral: 1, happy: 0, sad: 0, angry: 0, question: 0 };
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(IMG_W * SCALE);
    this.canvas.height = Math.round(IMG_H * SCALE);
    this.ctx = this.canvas.getContext('2d');
    host.innerHTML = '';
    host.appendChild(this.canvas);
    this.setFit('slice');
  }

  async load(onProgress) {
    const names = Object.keys(FILES);
    let n = 0;
    await Promise.all(names.map(async (k) => {
      const im = await loadImage(FILES[k]);
      this.img[k] = keyGreen(im);
      n++;
      if (onProgress) onProgress(n, names.length);
    }));
    // soft-edged patches so blended regions never show a hard seam
    this.mouthPatch = { neutral: makePatch(this.img.home_mouth_open, G.mouth) };
    await Promise.all(Object.keys(MOOD_OPEN).map(async (m) => {
      try {
        const im = await loadImage(MOOD_OPEN[m]);
        this.mouthPatch[m] = makePatch(keyGreen(im), G.mouth);
      } catch (e) { /* optional */ }
    }));
    this.eyePatchL = makePatch(this.img.home_eyes_closed, G.eyeL);
    this.eyePatchR = makePatch(this.img.home_eyes_closed, G.eyeR);
    this.ready = true;
  }

  setKit(kit) { if (kit === 'home' || kit === 'away' || kit === 'third') this.kit = kit; }
  setGlasses(on) { this.glasses = !!on; }
  setFit(mode) {
    this.canvas.style.objectFit = mode === 'meet' ? 'contain' : 'cover';
    this.canvas.style.objectPosition = mode === 'meet' ? 'center top' : 'center center';
  }

  // Mood weights are smoothed here so the caller only names the target mood
  setMoodTarget(name) {
    for (const k in this.moodW) {
      const t = k === name ? 1 : 0;
      this.moodW[k] += (t - this.moodW[k]) * 0.14;
    }
  }

  poly(ctx, pts, begin = true) {
    if (begin) ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  update(p) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const yaw = clamp(p.yaw, -1, 1), pitch = clamp(p.pitch, -1, 1), roll = clamp(p.roll, -7, 7);
    const body = this.img[this.kit + '_neutral'];
    const breathe = 1 + 0.004 * Math.sin(p.time * 0.0022);

    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, IMG_W, IMG_H);

    // head motion; the shirt follows it partially so the collar opening never gaps much
    const dx = yaw * 9 + p.posX * 0.4;
    const dy = pitch * 7 + p.posY * 0.3 + Math.sin(p.time * 0.0022) * 1.5;
    const bodyTransform = () => {
      ctx.translate(IMG_W / 2, IMG_H);
      ctx.scale(1, breathe);
      ctx.rotate(roll * 0.4 * Math.PI / 180);
      ctx.translate(-IMG_W / 2 + dx * 0.55, -IMG_H + dy * 0.4);
    };

    // 1. head + neck unit
    ctx.save();
    const hx = G.pivot.x + dx;
    const hy = G.pivot.y + G.headDy + dy;
    ctx.translate(hx, hy);
    ctx.rotate(roll * Math.PI / 180);
    ctx.scale(1 - Math.abs(yaw) * 0.045, 1 + pitch * 0.015);
    ctx.translate(-G.pivot.x, -G.pivot.y);
    this.poly(ctx, G.headTop);
    this.poly(ctx, G.neck, false);
    ctx.clip();

    ctx.drawImage(this.img.home_neutral, 0, 0);
    for (const m in MOOD_IMG) {
      const w = this.moodW[m];
      if (w > 0.01) { ctx.globalAlpha = clamp(w, 0, 1); ctx.drawImage(this.img[MOOD_IMG[m]], 0, 0); }
    }
    ctx.globalAlpha = clamp(1 - p.eyeL, 0, 1); if (ctx.globalAlpha > 0.01) ctx.drawImage(this.eyePatchL, 0, 0);
    ctx.globalAlpha = clamp(1 - p.eyeR, 0, 1); if (ctx.globalAlpha > 0.01) ctx.drawImage(this.eyePatchR, 0, 0);
    const open = clamp(p.mouthOpen, 0, 1);
    const oa = open < 0.06 ? 0 : clamp((open - 0.06) / 0.3, 0, 1);
    if (oa > 0.01) {
      // per-mood open mouth where available, weighted like the mood heads
      let rest = 1;
      for (const m in MOOD_IMG) {
        const w = clamp(this.moodW[m], 0, 1);
        if (this.mouthPatch[m] && w > 0.01) { ctx.globalAlpha = oa * w; ctx.drawImage(this.mouthPatch[m], 0, 0); rest -= w; }
      }
      ctx.globalAlpha = oa * clamp(rest, 0, 1);
      if (ctx.globalAlpha > 0.01) ctx.drawImage(this.mouthPatch.neutral, 0, 0);
    }
    ctx.globalAlpha = 1;
    if (this.glasses) this.drawGlasses(ctx);
    ctx.restore();

    // 2. shirt on top, with the collar opening cut out
    ctx.save();
    bodyTransform();
    ctx.beginPath();
    ctx.rect(0, G.bodyTop, IMG_W, IMG_H - G.bodyTop);
    this.poly(ctx, G.neck, false);
    ctx.clip('evenodd');
    ctx.drawImage(body, 0, 0);
    if (this.kit === 'home') this.drawSponsor(ctx);
    ctx.restore();
  }

  drawSponsor(ctx) {
    const s = G.sponsor;
    ctx.save();
    ctx.font = 'italic 900 64px "Arial Black", "Segoe UI Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'BilalAbi';
    const w = ctx.measureText(text).width;
    const k = Math.min(1, (s.w - 40) / w);
    ctx.translate(s.x, s.y + 4);
    ctx.scale(k, k);
    ctx.fillStyle = '#0f2148';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawGlasses(ctx) {
    // Wayfarer lens outline; dx > 0 points toward the nose (dir = 1 left lens, -1 right lens)
    const lens = (cx, cy, dir) => {
      const o = (dx) => cx + dx * dir;
      ctx.beginPath();
      ctx.moveTo(o(-92), cy - 44);
      ctx.quadraticCurveTo(cx, cy - 52, o(74), cy - 46);
      ctx.lineTo(o(66), cy + 26);
      ctx.quadraticCurveTo(o(50), cy + 58, o(10), cy + 58);
      ctx.lineTo(o(-40), cy + 58);
      ctx.quadraticCurveTo(o(-92), cy + 56, o(-94), cy + 16);
      ctx.closePath();
    };
    const cyL = G.eyeL.y - 10, cyR = G.eyeR.y - 10;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // temples to the ears
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(G.eyeL.x - 92, cyL - 30); ctx.lineTo(G.earL.x + 10, G.earL.y - 14);
    ctx.moveTo(G.eyeR.x + 92, cyR - 30); ctx.lineTo(G.earR.x - 10, G.earR.y - 14);
    ctx.stroke();
    for (const [e, cy, dir] of [[G.eyeL, cyL, 1], [G.eyeR, cyR, -1]]) {
      lens(e.x, cy, dir);
      ctx.fillStyle = 'rgba(10,10,14,0.66)';
      ctx.fill();
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 12;
      ctx.stroke();
      // glossy highlight
      ctx.beginPath();
      ctx.moveTo(e.x - 60 * dir, cy - 30); ctx.lineTo(e.x + 30 * dir, cy - 32);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    // bridge
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(G.eyeL.x + 72, cyL - 34); ctx.quadraticCurveTo(384, cyL - 44, G.eyeR.x - 72, cyR - 34);
    ctx.stroke();
    ctx.restore();
  }
}

export function defaultParams() {
  return {
    time: 0,
    yaw: 0, pitch: 0, roll: 0, posX: 0, posY: 0,
    eyeL: 1, eyeR: 1, gazeX: 0, gazeY: 0,
    browL: 0, browR: 0, tiltL: 0, tiltR: 0,
    mouthOpen: 0, smile: 0, mouthWidth: 1, skew: 0,
  };
}
