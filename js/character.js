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

// Geometry measured from the artwork
const G = {
  pivot: { x: 384, y: 850 },          // neck base, rotation pivot
  // head region: full width down to y=700, then along the lower beard contour (+6px)
  headPoly: [[0, 0], [768, 0], [768, 700], [548, 700], [530, 742], [512, 764], [497, 778], [482, 795], [467, 809], [452, 819], [437, 827], [422, 829], [392, 836], [372, 836], [345, 829], [330, 826], [315, 817], [300, 805], [285, 790], [270, 775], [255, 760], [238, 742], [222, 700], [0, 700]],
  // same contour, widened at the jaw: cut out of the body so the static beard never peeks out
  bodyCut: [[566, 700], [544, 742], [522, 764], [503, 778], [486, 795], [469, 809], [452, 819], [437, 827], [422, 829], [392, 836], [372, 836], [345, 829], [330, 826], [315, 817], [300, 805], [285, 790], [268, 775], [248, 760], [224, 742], [202, 700]],
  // skin fill behind the beard (inset from the jaw so nothing shows outside the head)
  neckPatch: [[541, 706], [528, 744], [504, 772], [490, 788], [476, 805], [462, 819], [448, 829], [434, 837], [420, 839], [392, 846], [374, 846], [346, 839], [332, 836], [318, 827], [304, 815], [290, 800], [276, 785], [262, 770], [242, 744], [228, 706]],
  bodyTop: 700,
  mouth: { x: 384, y: 688, rx: 80, ry: 50 },
  eyeL: { x: 298, y: 515, rx: 64, ry: 38 },
  eyeR: { x: 468, y: 515, rx: 64, ry: 38 },
  earL: { x: 172, y: 520 }, earR: { x: 598, y: 520 },
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

export class Character {
  constructor(host) {
    this.host = host;
    this.kit = 'home';
    this.glasses = false;
    this.ready = false;
    this.img = {};
    this.neckColor = {};
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
    // neck colour per kit, sampled from the artwork
    for (const k of ['home', 'away', 'third']) {
      const px = this.img[k + '_neutral'].getContext('2d').getImageData(384, 900, 1, 1).data;
      this.neckColor[k] = `rgb(${px[0]},${px[1]},${px[2]})`;
    }
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
    const yaw = clamp(p.yaw, -1, 1), pitch = clamp(p.pitch, -1, 1), roll = clamp(p.roll, -12, 12);
    const body = this.img[this.kit + '_neutral'];

    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, IMG_W, IMG_H);

    // ---- body (kit image, below the head) with light sway + breathing
    const breathe = 1 + 0.004 * Math.sin(p.time * 0.0022);
    ctx.save();
    ctx.translate(IMG_W / 2, IMG_H);
    ctx.scale(1, breathe);
    ctx.rotate(roll * 0.12 * Math.PI / 180);
    ctx.translate(-IMG_W / 2 + yaw * 6, -IMG_H);
    // neck patch behind the beard so head motion never reveals green
    ctx.fillStyle = this.neckColor[this.kit] || '#c9956a';
    this.poly(ctx, G.neckPatch);
    ctx.fill();
    // body without its own beard (the beard belongs to the moving head)
    ctx.beginPath();
    ctx.rect(0, G.bodyTop, IMG_W, IMG_H - G.bodyTop);
    this.poly(ctx, G.bodyCut, false);
    ctx.clip('evenodd');
    ctx.drawImage(body, 0, 0);
    ctx.restore();

    // ---- head transform
    ctx.save();
    const hx = G.pivot.x + yaw * 14 + p.posX * 0.4;
    const hy = G.pivot.y + pitch * 9 + p.posY * 0.3 + Math.sin(p.time * 0.0022) * 1.5;
    ctx.translate(hx, hy);
    ctx.rotate(roll * Math.PI / 180);
    ctx.scale(1 - Math.abs(yaw) * 0.045, 1 + pitch * 0.015);
    ctx.translate(-G.pivot.x, -G.pivot.y);

    // head clip: face + beard, the neck belongs to the body layer
    this.poly(ctx, G.headPoly);
    ctx.clip();

    // neutral head + mood heads (crossfade)
    ctx.drawImage(this.img.home_neutral, 0, 0);
    for (const m in MOOD_IMG) {
      const w = this.moodW[m];
      if (w > 0.01) { ctx.globalAlpha = clamp(w, 0, 1); ctx.drawImage(this.img[MOOD_IMG[m]], 0, 0); }
    }
    ctx.globalAlpha = 1;

    // eyes closed patches
    this.patch(this.img.home_eyes_closed, G.eyeL, 1 - clamp(p.eyeL, 0, 1), 1);
    this.patch(this.img.home_eyes_closed, G.eyeR, 1 - clamp(p.eyeR, 0, 1), 1);

    // mouth open patch, slightly stretched with openness
    const open = clamp(p.mouthOpen, 0, 1);
    const a = open < 0.08 ? 0 : clamp((open - 0.08) / 0.35, 0, 1);
    this.patch(this.img.home_mouth_open, G.mouth, a, 1 + open * 0.3);

    if (this.glasses) this.drawGlasses(ctx);
    ctx.restore();
  }

  // Draw an elliptic region of `img` at alpha, stretched vertically by sy around the region center
  patch(img, e, alpha, sy) {
    if (alpha <= 0.01) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x, e.y);
    ctx.scale(1, sy);
    ctx.translate(-e.x, -e.y);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0);
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
