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

const IMG_W = 768, IMG_H = 1376;   // base coordinate space (the original head artwork)
const PAD = 170;                   // extra base px on each side so the arms fit
const BODY_H = 1620;               // base px: crop just above the navel
const OUT_W = 1080;                // output canvas width; height follows the screen aspect
export const CHROMA = '#00B140';   // key colour, same as the CSS background
const K = OUT_W / (IMG_W + 2 * PAD); // base px -> output px
const MAX_SCALE = 1.25;            // internal oversampling
const MAX_CANVAS_H = 2048;         // keep the backing store within one GPU texture tile

const FILES = {
  home_neutral: 'img/home_neutral.jpg',
  home_mouth_open: 'img/home_mouth_open.jpg',
  home_eyes_closed: 'img/home_eyes_closed.jpg',
  home_happy: 'img/home_happy.jpg',
  home_sad: 'img/home_sad.jpg',
  home_angry: 'img/home_angry.jpg',
  home_question: 'img/home_question.jpg',
};
// Shirt artwork per kit (any resolution, aligned to the base head at load)
const BODY_FILES = { home: 'img/home_body.jpg', away: 'img/away_body.jpg', third: 'img/third_body.jpg' };

const MOOD_IMG = { happy: 'home_happy', sad: 'home_sad', angry: 'home_angry', question: 'home_question' };
// Optional: open-mouth versions per mood. If the file exists it is used, otherwise the neutral open mouth.
const MOOD_OPEN = { happy: 'img/home_happy_open.jpg', sad: 'img/home_sad_open.jpg', angry: 'img/home_angry_open.jpg', question: 'img/home_question_open.jpg' };

// Geometry measured from the artwork
// V collar per kit (measured on the aligned shirt): where the collar meets the neck,
// the V point, and the slope of the inner edge (px sideways per px down)
const COLLAR = {
  home:  { top: 818, vy: 928, slope: 1.31 },
  away:  { top: 831, vy: 941, slope: 1.33 },
  third: { top: 828, vy: 933, slope: 1.39 },
};

// Neck + chest skin inside the collar: moves with the head, the shirt is drawn over it
function neckPoly(kit) {
  const k = COLLAR[kit] || COLLAR.home;
  const right = [], left = [];
  for (let y = k.top; y < k.vy; y += 8) {
    const x = Math.min(530, 384 + (k.vy - y) * k.slope);
    right.push([x, y]);
    left.push([768 - x, y]);
  }
  const poly = [[222, 700], [547, 700], [540, 730], [530, 760], ...right, [384, k.vy], ...left.slice().reverse(), [238, 760], [229, 730]];
  // skin fill strictly inside the collar opening (never visible outside the shirt)
  const fill = [[246, k.top - 2], [522, k.top - 2], ...right.slice(1), [384, k.vy], ...left.slice(1).reverse()];
  return { poly, fill };
}
const NECK = { home: neckPoly('home'), away: neckPoly('away'), third: neckPoly('third') };

const G = {
  pivot: { x: 384, y: 826 },          // collar line: the neck stays put where it enters the shirt
  headDy: 0,                          // vertical offset of the head+neck unit
  headTop: [[0, 0], [768, 0], [768, 700], [0, 700]],
  bodyTop: 700,
  mouth: { x: 384, y: 690, rx: 74, ry: 46 },
  eyeL: { x: 298, y: 515, rx: 82, ry: 42, inner: 0.72 },   // hard core covers the whole eye
  eyeR: { x: 468, y: 515, rx: 82, ry: 42, inner: 0.72 },
  earL: { x: 172, y: 520 }, earR: { x: 598, y: 520 },
  sponsor: { x: 384, y: 1257, w: 400, h: 140 },
  crest: {
    home: { x: 570, y: 1065, w: 108, h: 132 },
    away: { x: 570, y: 1079, w: 108, h: 132 },
    third: { x: 567, y: 1072, w: 108, h: 132 },
  },
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

// Key only the exact background colour (sampled at the corner), so green details
// inside a logo survive
function keyBackground(im) {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const br = d[(2 * c.width + 2) * 4], bg = d[(2 * c.width + 2) * 4 + 1], bb = d[(2 * c.width + 2) * 4 + 2];
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb);
    if (dist < 28) { d[i + 3] = 0; continue; }
    if (dist < 48) d[i + 3] = Math.round(255 * (dist - 28) / 20);
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Head silhouette of the base artwork: top of the head and the widest row (ears)
const BASE_HEAD = { top: 241, earsY: 533, earsL: 163, earsR: 605 };

// Scale/shift a keyed image (any resolution) so its head lands exactly on the base head
function alignToBase(keyed) {
  const w = keyed.width, h = keyed.height;
  const d = keyed.getContext('2d').getImageData(0, 0, w, h).data;
  const solid = (x, y) => d[(y * w + x) * 4 + 3] > 128;
  let top = -1;
  const cx = w >> 1;
  for (let y = 0; y < h; y++) if (solid(cx, y)) { top = y; break; }
  if (top < 0) return keyed;
  // widest row of the head = ears; stop once the silhouette narrows into the neck
  let best = { y: top, l: 0, r: 0 };
  for (let y = top; y < h; y += 2) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (solid(x, y)) { if (l < 0) l = x; r = x; }
    if (r - l > best.r - best.l) best = { y, l, r };
    else if (r - l < (best.r - best.l) * 0.85) break;
  }
  const s = (BASE_HEAD.earsR - BASE_HEAD.earsL) / (best.r - best.l);
  const dx = (BASE_HEAD.earsL + BASE_HEAD.earsR) / 2 - ((best.l + best.r) / 2) * s;
  const dy = BASE_HEAD.earsY - best.y * s;
  const out = document.createElement('canvas');
  out.width = IMG_W + 2 * PAD; out.height = BODY_H;
  const ctx = out.getContext('2d');
  ctx.setTransform(s, 0, 0, s, dx + PAD, dy);
  ctx.drawImage(keyed, 0, 0);
  return out;
}

// Aligned canvases are padded sideways; head-space patches need the plain 768x1376 frame
function unpad(aligned) {
  const c = document.createElement('canvas');
  c.width = IMG_W; c.height = IMG_H;
  c.getContext('2d').drawImage(aligned, -PAD, 0);
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
  const grad = ctx.createRadialGradient(0, 0, e.rx * (e.inner || 0.5), 0, 0, e.rx);
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
    this.ctx = this.canvas.getContext('2d');
    host.innerHTML = '';
    host.appendChild(this.canvas);
    this.fitToScreen();
    window.addEventListener('resize', () => this.fitToScreen());
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
    const px = this.img.home_neutral.getContext('2d').getImageData(384, 905, 1, 1).data;
    this.neckColor = `rgb(${px[0]},${px[1]},${px[2]})`;
    // optional custom logo
    for (const src of ['img/logo.png', 'img/logo.jpg', 'img/logo.webp']) {
      try { const im = await loadImage(src); this.logo = keyBackground(im); break; } catch (e) { /* optional */ }
    }
    this.body = {};
    await Promise.all(Object.keys(BODY_FILES).map(async (k) => {
      const im = await loadImage(BODY_FILES[k]);
      this.body[k] = alignToBase(keyGreen(im));
    }));
    // soft-edged patches so blended regions never show a hard seam
    this.mouthPatch = { neutral: makePatch(this.img.home_mouth_open, G.mouth) };
    await Promise.all(Object.keys(MOOD_OPEN).map(async (m) => {
      try {
        const im = await loadImage(MOOD_OPEN[m]);
        this.mouthPatch[m] = makePatch(unpad(alignToBase(keyGreen(im))), G.mouth);
      } catch (e) { /* optional */ }
    }));
    this.eyePatchL = makePatch(this.img.home_eyes_closed, G.eyeL);
    this.eyePatchR = makePatch(this.img.home_eyes_closed, G.eyeR);
    this.ready = true;
  }

  // Output canvas = 1080 x (screen aspect), so "cover" on the phone never crops the sides.
  // The character is anchored at the bottom edge.
  fitToScreen() {
    const w = window.innerWidth || 1080, h = window.innerHeight || 1920;
    const outH = Math.max(1920, Math.min(2600, Math.round(OUT_W * h / w)));
    this.S = Math.min(MAX_SCALE, MAX_CANVAS_H / outH);
    const cw = Math.round(OUT_W * this.S), ch = Math.round(outH * this.S);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.outH = outH;
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
    const body = this.body[this.kit];
    const neck = NECK[this.kit].poly;
    const breathe = 1 + 0.004 * Math.sin(p.time * 0.0022);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // chroma green painted into the canvas: the recording captures the canvas only,
    // a CSS background would come out black
    ctx.fillStyle = CHROMA;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // base coordinates -> output: scaled by K, padded sideways, anchored at the bottom
    ctx.setTransform(K * this.S, 0, 0, K * this.S, PAD * K * this.S, (this.outH - BODY_H * K) * this.S);

    // head motion; the shirt follows it partially so the collar opening never gaps much
    const dx = yaw * 9 + p.posX * 0.4;
    const dy = pitch * 7 + p.posY * 0.3 + Math.sin(p.time * 0.0022) * 1.5;
    const bodyTransform = () => {
      // pivot at the collar line so the neck and the collar never slide against each other
      ctx.translate(G.pivot.x, G.pivot.y);
      ctx.scale(1, breathe);
      ctx.rotate(roll * 0.5 * Math.PI / 180);
      ctx.translate(-G.pivot.x + dx, -G.pivot.y + dy * 0.4);
    };

    // 0. chest skin inside the collar opening, so head motion shows skin there, not green
    ctx.save();
    bodyTransform();
    ctx.fillStyle = this.neckColor;
    this.poly(ctx, NECK[this.kit].fill);
    ctx.fill();
    ctx.restore();

    // 1. head + neck unit
    ctx.save();
    const hx = G.pivot.x + dx;
    const hy = G.pivot.y + G.headDy + dy;
    ctx.translate(hx, hy);
    ctx.rotate(roll * Math.PI / 180);
    ctx.scale(1 - Math.abs(yaw) * 0.045, 1 + pitch * 0.015);
    ctx.translate(-G.pivot.x, -G.pivot.y);
    this.poly(ctx, G.headTop);
    this.poly(ctx, neck, false);
    ctx.clip();

    ctx.drawImage(this.img.home_neutral, 0, 0);
    for (const m in MOOD_IMG) {
      const w = this.moodW[m];
      if (w > 0.01) { ctx.globalAlpha = clamp(w, 0, 1); ctx.drawImage(this.img[MOOD_IMG[m]], 0, 0); }
    }
    ctx.globalAlpha = clamp(1 - p.eyeL, 0, 1); if (ctx.globalAlpha > 0.01) ctx.drawImage(this.eyePatchL, 0, 0);
    ctx.globalAlpha = clamp(1 - p.eyeR, 0, 1); if (ctx.globalAlpha > 0.01) ctx.drawImage(this.eyePatchR, 0, 0);
    const open = clamp(p.mouthOpen, 0, 1);
    // short crossfade (about one or two frames) instead of a long half-transparent blend
    const oa = open < 0.08 ? 0 : clamp((open - 0.08) / 0.14, 0, 1);
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
    ctx.rect(-PAD, G.bodyTop, IMG_W + 2 * PAD, BODY_H - G.bodyTop);
    this.poly(ctx, neck, false);
    ctx.clip('evenodd');
    ctx.drawImage(body, -PAD, 0);
    this.drawDecals(ctx, this.kit);
    ctx.restore();
  }

  // Round club-style emblem drawn over the generated crest: navy edge, white ring with
  // text, red upper field, yellow/navy lower halves, white oak leaf. Third kit: silver.
  // Crest and sponsor text are rendered once per kit into an offscreen canvas and then
  // blitted every frame (text rasterization per frame is slow and glitchy on some GPUs).
  drawDecals(ctx, kit) {
    this.decals = this.decals || {};
    if (!this.decals[kit]) {
      const cv = document.createElement('canvas');
      const S = 3;
      cv.width = IMG_W * S; cv.height = 300 * S;
      const dc = cv.getContext('2d');
      dc.setTransform(S, 0, 0, S, 0, -1000 * S);
      if (this.logo) this.drawLogoImage(dc, kit); else this.drawCrest(dc, kit);
      if (kit === 'home') this.drawSponsor(dc);
      this.decals[kit] = { cv, S };
    }
    const { cv, S } = this.decals[kit];
    ctx.drawImage(cv, 0, 1000, IMG_W, 300);
  }

  // Optional img/logo.* (green or transparent background): drawn instead of the vector crest,
  // fitted into the crest box, monochrome silver on the third kit
  drawLogoImage(ctx, kit) {
    const { x, y, w, h } = G.crest[kit] || G.crest.home;
    const im = this.logo;
    // Cover the crest printed into the artwork: continue the vertical stripes by
    // copying one pixel row from just above the box down over it
    const body = this.body[kit];
    if (body) {
      const left = Math.round(x - w * 0.8), right = Math.round(x + w * 0.8);
      const top = Math.round(y - h * 0.8), bottom = Math.round(y + h * 0.8);
      const row = body.getContext('2d').getImageData(left + PAD, top - 6, right - left, 1).data;
      if (kit === 'third') {
        // patterned fabric: a soft disc in the mean colour instead of copied columns
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < right - left; i++) { if (row[i * 4 + 3] < 200) continue; r += row[i * 4]; g += row[i * 4 + 1]; b += row[i * 4 + 2]; n++; }
        if (n) {
          const col = Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n);
          const grad = ctx.createRadialGradient(x, y, w * 0.35, x, y, w * 0.75);
          grad.addColorStop(0, 'rgb(' + col + ')');
          grad.addColorStop(1, 'rgba(' + col + ',0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x - w, y - w, 2 * w, 2 * w);
        }
      } else {
        for (let i = 0; i < right - left; i++) {
          if (row[i * 4 + 3] < 200) continue;
          ctx.fillStyle = 'rgb(' + row[i * 4] + ',' + row[i * 4 + 1] + ',' + row[i * 4 + 2] + ')';
          ctx.fillRect(left + i, top, 1, bottom - top);
        }
      }
    }
    // real crest size: fits inside the crest box (about 12 % of the shirt width)
    const s = Math.min((w * 0.9) / im.width, (h * 0.9) / im.height);
    const dw = im.width * s, dh = im.height * s;
    ctx.save();
    // soft contact shadow so it reads as printed on fabric, not pasted on
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    if (kit === 'third') ctx.filter = 'grayscale(1) brightness(1.15)';
    ctx.drawImage(im, x - dw / 2, y - dh / 2, dw, dh);
    ctx.restore();
  }

  drawCrest(ctx, kit) {
    const { x, y, w } = G.crest[kit] || G.crest.home;
    const r = w * 0.56;
    const mono = kit === 'third';
    const NAVY = mono ? '#1C2B45' : '#0B2A5B';
    const YELLOW = mono ? '#B9C2CE' : '#F6D200';
    const RED = mono ? '#6E7A8C' : '#D3202E';
    const WHITE = mono ? '#E7EBF0' : '#FFFFFF';
    const circle = (rad) => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.closePath(); };
    ctx.save();
    ctx.translate(x, y);
    // edge + ring
    circle(r); ctx.fillStyle = NAVY; ctx.fill();
    circle(r - 3); ctx.fillStyle = WHITE; ctx.fill();
    // inner field
    const ri = r - 15;
    circle(ri); ctx.save(); ctx.clip();
    ctx.fillStyle = YELLOW; ctx.fillRect(-ri, -ri, ri, 2 * ri);
    ctx.fillStyle = NAVY; ctx.fillRect(0, -ri, ri, 2 * ri);
    const split = -ri * 0.22;
    ctx.fillStyle = RED; ctx.fillRect(-ri, -ri, 2 * ri, split + ri);
    ctx.fillStyle = WHITE; ctx.fillRect(-ri, split - 1.5, 2 * ri, 3);
    ctx.restore();
    circle(ri); ctx.strokeStyle = NAVY; ctx.lineWidth = 2; ctx.stroke();
    // oak leaf
    ctx.save();
    ctx.translate(0, ri * 0.18);
    const L = ri * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, -L);
    for (let i = 1; i <= 4; i++) {
      const t = i / 4, yy = -L + t * 2 * L * 0.92;
      const wv = L * 0.42 * Math.sin(Math.PI * t) * (i % 2 ? 1.25 : 0.85);
      ctx.quadraticCurveTo(wv * 1.4, yy - L * 0.12, wv * 0.6, yy);
    }
    ctx.lineTo(0, L);
    for (let i = 4; i >= 1; i--) {
      const t = i / 4, yy = -L + t * 2 * L * 0.92;
      const wv = L * 0.42 * Math.sin(Math.PI * t) * (i % 2 ? 1.25 : 0.85);
      ctx.quadraticCurveTo(-wv * 1.4, yy - L * 0.12, i === 1 ? 0 : -wv * 0.6, i === 1 ? -L : yy);
    }
    ctx.closePath();
    ctx.fillStyle = WHITE; ctx.fill();
    ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -L * 0.8); ctx.lineTo(0, L); ctx.stroke();
    ctx.restore();
    // ring text
    ctx.fillStyle = NAVY;
    ctx.font = `900 ${Math.round(r * 0.19)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.arcText(ctx, 'BILALABI', r - 9, -Math.PI / 2, 1);
    this.arcText(ctx, 'TV', r - 9, Math.PI / 2, -1);
    ctx.restore();
  }

  // Text along a circle: centerAngle in radians, dir 1 = reads clockwise over the top
  arcText(ctx, text, radius, centerAngle, dir) {
    const chars = text.split('');
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + (chars.length - 1) * 2.4;
    let a = centerAngle - dir * (total / 2) / radius;
    ctx.save();
    for (let i = 0; i < chars.length; i++) {
      const ca = a + dir * (widths[i] / 2) / radius;
      ctx.save();
      ctx.rotate(ca + Math.PI / 2);
      ctx.translate(0, -radius * dir);
      if (dir < 0) ctx.rotate(Math.PI);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      a += dir * (widths[i] + 2.4) / radius;
    }
    ctx.restore();
  }

  drawSponsor(ctx) {
    const s = G.sponsor;
    ctx.save();
    ctx.font = 'italic 900 78px "Arial Black", "Segoe UI Black", Arial, sans-serif';
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
