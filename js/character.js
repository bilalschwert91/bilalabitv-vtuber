// Character: layered SVG, driven by a small parameter object every frame.
// Coordinates: viewBox 1080x1920 (portrait). Head local origin = head center.

const SKIN = '#D2A074';
const SKIN_DARK = '#BE8A60';
const SKIN_NECK = '#C48F65';
const HAIR = '#141414';
const NAVY = '#0B2A5B';
const YELLOW = '#FFDD00';
const SILVER = '#B8C0CC';

const HEAD_CX = 540;
const HEAD_CY = 790;
const NECK_PIVOT_Y = 250; // head-local y of neck base (rotation pivot)

export const MOODS = {
  neutral:  { smile: 0,     browL: 0,   browR: 0,  tiltL: 0,   tiltR: 0,   eyeL: 1,    eyeR: 1,    roll: 0, skew: 0 },
  happy:    { smile: 0.85,  browL: -8,  browR: -8, tiltL: 0,   tiltR: 0,   eyeL: 0.72, eyeR: 0.72, roll: 0, skew: 0 },
  sad:      { smile: -0.6,  browL: 6,   browR: 6,  tiltL: -14, tiltR: 14,  eyeL: 0.8,  eyeR: 0.8,  roll: 0, skew: 0 },
  angry:    { smile: -0.35, browL: 18,  browR: 18, tiltL: 16,  tiltR: -16, eyeL: 0.62, eyeR: 0.62, roll: 0, skew: 0 },
  question: { smile: -0.1,  browL: -24, browR: 8,  tiltL: -6,  tiltR: 6,   eyeL: 1,    eyeR: 0.78, roll: 6, skew: 1 },
};

export const MOOD_LABELS = {
  neutral: 'Neutral', happy: 'Glücklich', sad: 'Enttäuscht', angry: 'Sauer', question: 'Fraglich',
};

const KITS = {
  home: {
    base: YELLOW, stripe: NAVY, stripeW: 80, stripeGap: 160,
    collar: NAVY, shoulder: '#FFFFFF', patch: true, ornament: false,
    crest: { shield: NAVY, border: YELLOW, ring: '#FFFFFF', left: YELLOW, right: NAVY, text: '#FFFFFF' },
  },
  away: {
    base: '#F3EFE4', stripe: '#F6E7A6', stripeW: 80, stripeGap: 160,
    collar: NAVY, shoulder: NAVY, patch: false, ornament: false,
    crest: { shield: NAVY, border: YELLOW, ring: '#FFFFFF', left: YELLOW, right: NAVY, text: '#FFFFFF' },
  },
  third: {
    base: '#0B1F3B', stripe: null, stripeW: 0, stripeGap: 0,
    collar: '#0B1F3B', shoulder: SILVER, patch: false, ornament: true,
    crest: { shield: '#152B4E', border: SILVER, ring: SILVER, left: '#8E9AA8', right: '#5C6B80', text: '#E6EAF0' },
  },
};

const NS = 'http://www.w3.org/2000/svg';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class Character {
  constructor(host) {
    this.host = host;
    this.kit = 'home';
    this.glasses = false;
    this.build();
    this.applyKit();
    this.setGlasses(false);
    this.update(defaultParams());
  }

  build() {
    this.host.innerHTML = `
<svg xmlns="${NS}" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <defs>
    <clipPath id="clip-torso"><path id="torso-clip-path"/></clipPath>
    <clipPath id="clip-eye-l"><ellipse id="eye-clip-l" cx="0" cy="0" rx="48" ry="30"/></clipPath>
    <clipPath id="clip-eye-r"><ellipse id="eye-clip-r" cx="0" cy="0" rx="48" ry="30"/></clipPath>
    <clipPath id="clip-mouth"><path id="mouth-clip"/></clipPath>
    <pattern id="orn" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M32 4 L60 32 L32 60 L4 32 Z" fill="none" stroke="#8E9AA8" stroke-width="2" opacity="0.35"/>
      <circle cx="32" cy="32" r="4" fill="#8E9AA8" opacity="0.25"/>
    </pattern>
  </defs>

  <!-- BODY -->
  <g id="body">
    <rect x="445" y="990" width="190" height="420" fill="${SKIN_NECK}"/>
    <path id="neck-shadow" d="M445 990 Q540 1080 635 990 L635 1040 Q540 1120 445 1040 Z" fill="#000" opacity="0.12"/>

    <g id="jersey">
      <path id="torso" d="M70 1330 C80 1220 300 1170 445 1150 L445 1200 Q540 1260 635 1200 L635 1150 C780 1170 1000 1220 1010 1330 L1040 1920 L40 1920 Z"/>
      <g id="stripes" clip-path="url(#clip-torso)"></g>
      <rect id="ornament" x="0" y="1100" width="1080" height="900" fill="url(#orn)" clip-path="url(#clip-torso)"/>
      <!-- shoulder stripes -->
      <g id="shoulder-stripes" fill="none" stroke-width="9" stroke-linecap="round" clip-path="url(#clip-torso)">
        <path d="M150 1268 C280 1210 380 1180 445 1170"/>
        <path d="M160 1292 C290 1234 390 1204 448 1194"/>
        <path d="M170 1316 C300 1258 400 1228 452 1218"/>
        <path d="M930 1268 C800 1210 700 1180 635 1170"/>
        <path d="M920 1292 C790 1234 690 1204 632 1194"/>
        <path d="M910 1316 C780 1258 680 1228 628 1218"/>
      </g>
      <!-- V collar -->
      <path id="collar" d="M425 1138 L540 1300 L655 1138 L690 1150 L540 1352 L390 1150 Z"/>
      <!-- sponsor patch (home only) -->
      <rect id="patch" x="400" y="1490" width="280" height="100" rx="12" fill="#FFFFFF"/>
      <!-- crest -->
      <g id="crest" transform="translate(720 1430) scale(1.05)">
        <path id="crest-shield" d="M-50 -55 L50 -55 L50 10 Q50 50 0 70 Q-50 50 -50 10 Z" stroke-width="4"/>
        <circle id="crest-ring" cx="0" cy="5" r="36"/>
        <path id="crest-left" d="M0 -23 A28 28 0 0 0 0 33 Z"/>
        <path id="crest-right" d="M0 -23 A28 28 0 0 1 0 33 Z"/>
        <text id="crest-text" x="0" y="15" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" stroke-width="1.5" paint-order="stroke">BA</text>
      </g>
    </g>
  </g>

  <!-- HEAD -->
  <g id="head">
    <g id="ears">
      <g transform="translate(-285 -20)">
        <ellipse rx="36" ry="62" fill="${SKIN}"/>
        <ellipse cx="6" cy="4" rx="18" ry="34" fill="${SKIN_DARK}"/>
      </g>
      <g transform="translate(285 -20)">
        <ellipse rx="36" ry="62" fill="${SKIN}"/>
        <ellipse cx="-6" cy="4" rx="18" ry="34" fill="${SKIN_DARK}"/>
      </g>
    </g>

    <g id="head-shape">
      <path d="M-270 -200 C-270 -330 -150 -360 0 -360 C150 -360 270 -330 270 -200 L270 80 C270 230 150 300 0 300 C-150 300 -270 230 -270 80 Z" fill="${SKIN}"/>
      <!-- bald shine -->
      <ellipse cx="-90" cy="-275" rx="95" ry="34" fill="#FFFFFF" opacity="0.18" transform="rotate(-18 -90 -275)"/>
      <ellipse cx="120" cy="-300" rx="30" ry="12" fill="#FFFFFF" opacity="0.12"/>
      <!-- cheek shading -->
      <path d="M-270 80 C-270 230 -150 300 0 300 C150 300 270 230 270 80 L270 40 C250 200 130 260 0 260 C-130 260 -250 200 -270 40 Z" fill="#000" opacity="0.06"/>
    </g>

    <g id="features">
      <!-- beard -->
      <g id="beard">
        <path d="M-285 -10 C-285 150 -190 300 0 325 C190 300 285 150 285 -10 C265 40 230 70 200 70 C160 80 140 110 100 118 L60 122 Q0 140 -60 122 L-100 118 C-140 110 -160 80 -200 70 C-230 70 -265 40 -285 -10 Z" fill="${HAIR}"/>
        <!-- texture -->
        <g fill="none" stroke="#2a2a2a" stroke-width="5" stroke-linecap="round" opacity="0.9">
          <path d="M-200 150 q10 30 0 60"/>
          <path d="M-120 230 q10 25 -5 50"/>
          <path d="M40 270 q8 20 0 40"/>
          <path d="M150 190 q12 30 2 60"/>
          <path d="M220 90 q8 25 -2 50"/>
        </g>
        <!-- grey hairs -->
        <g fill="none" stroke="#A8A8A8" stroke-width="4" stroke-linecap="round">
          <path d="M-125 205 q6 14 -2 26"/>
          <path d="M65 262 q5 12 -1 22"/>
          <path d="M155 148 q6 12 0 24"/>
        </g>
      </g>

      <!-- nose -->
      <g id="nose" transform="translate(0 20)">
        <path d="M-8 -30 C-20 30 -42 55 -36 82 C-26 102 26 102 36 82 C42 55 20 30 8 -30 Z" fill="${SKIN_DARK}"/>
        <path d="M-8 -30 C-14 20 -30 50 -28 72" fill="none" stroke="#000" opacity="0.15" stroke-width="5" stroke-linecap="round"/>
        <ellipse cx="-20" cy="84" rx="9" ry="5" fill="#000" opacity="0.28"/>
        <ellipse cx="20" cy="84" rx="9" ry="5" fill="#000" opacity="0.28"/>
      </g>

      <!-- mouth -->
      <g id="mouth" transform="translate(0 170)">
        <path id="mouth-fill" fill="#2B0F0F"/>
        <g clip-path="url(#clip-mouth)">
          <rect id="teeth" x="-56" y="-3" width="112" height="22" fill="#F4F0E8"/>
          <ellipse id="tongue" cx="0" cy="40" rx="34" ry="18" fill="#B8434A"/>
        </g>
        <path id="mouth-line" fill="none" stroke="#7A3F35" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </g>

      <!-- mustache -->
      <path id="mustache" d="M-95 130 Q-50 116 0 140 Q50 116 95 130 Q60 162 0 158 Q-60 162 -95 130 Z" fill="${HAIR}"/>

      <!-- eyes -->
      <g id="eye-l" transform="translate(-110 -40)">
        <ellipse rx="48" ry="30" fill="#FFFFFF" clip-path="url(#clip-eye-l)"/>
        <g id="iris-l" clip-path="url(#clip-eye-l)">
          <circle id="iris-l-c" r="21" fill="#4A2C17"/>
          <circle id="pupil-l" r="10" fill="#0E0A08"/>
          <circle id="hl-l" r="5" fill="#FFFFFF"/>
        </g>
        <path id="lid-l" fill="none" stroke="#6E4630" stroke-width="6" stroke-linecap="round"/>
        <path id="lidlow-l" fill="none" stroke="#B07A57" stroke-width="3" stroke-linecap="round"/>
      </g>
      <g id="eye-r" transform="translate(110 -40)">
        <ellipse rx="48" ry="30" fill="#FFFFFF" clip-path="url(#clip-eye-r)"/>
        <g id="iris-r" clip-path="url(#clip-eye-r)">
          <circle id="iris-r-c" r="21" fill="#4A2C17"/>
          <circle id="pupil-r" r="10" fill="#0E0A08"/>
          <circle id="hl-r" r="5" fill="#FFFFFF"/>
        </g>
        <path id="lid-r" fill="none" stroke="#6E4630" stroke-width="6" stroke-linecap="round"/>
        <path id="lidlow-r" fill="none" stroke="#B07A57" stroke-width="3" stroke-linecap="round"/>
      </g>

      <!-- brows -->
      <g id="brow-l">
        <path d="M-195 -118 Q-125 -152 -50 -124" fill="none" stroke="${HAIR}" stroke-width="24" stroke-linecap="round"/>
      </g>
      <g id="brow-r">
        <path d="M195 -118 Q125 -152 50 -124" fill="none" stroke="${HAIR}" stroke-width="24" stroke-linecap="round"/>
      </g>

      <!-- sunglasses (wayfarer, tinted) -->
      <g id="glasses" transform="translate(0 -40)">
        <path d="M-215 -22 L-215 -40 L-30 -40" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/>
        <path d="M-30 -30 L30 -30" fill="none" stroke="#111" stroke-width="12"/>
        <g id="lens-l">
          <path d="M-215 -45 L-28 -45 L-36 40 Q-60 62 -110 62 L-176 62 Q-215 56 -215 10 Z" fill="#050505" opacity="0.66"/>
          <path d="M-215 -45 L-28 -45 L-36 40 Q-60 62 -110 62 L-176 62 Q-215 56 -215 10 Z" fill="none" stroke="#111" stroke-width="11" stroke-linejoin="round"/>
          <path d="M-200 -30 L-60 -30" stroke="#FFFFFF" stroke-width="4" opacity="0.18" stroke-linecap="round"/>
        </g>
        <g id="lens-r" transform="scale(-1 1)">
          <path d="M-215 -45 L-28 -45 L-36 40 Q-60 62 -110 62 L-176 62 Q-215 56 -215 10 Z" fill="#050505" opacity="0.66"/>
          <path d="M-215 -45 L-28 -45 L-36 40 Q-60 62 -110 62 L-176 62 Q-215 56 -215 10 Z" fill="none" stroke="#111" stroke-width="11" stroke-linejoin="round"/>
          <path d="M-200 -30 L-60 -30" stroke="#FFFFFF" stroke-width="4" opacity="0.18" stroke-linecap="round"/>
        </g>
        <path d="M-215 -30 L-290 -18" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/>
        <path d="M215 -30 L290 -18" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</svg>`;

    const q = (id) => this.host.querySelector('#' + id);
    this.el = {
      body: q('body'), head: q('head'), headShape: q('head-shape'), features: q('features'), ears: q('ears'),
      torso: q('torso'), torsoClip: q('torso-clip-path'), stripes: q('stripes'), ornament: q('ornament'),
      shoulder: q('shoulder-stripes'), collar: q('collar'), patch: q('patch'),
      crestShield: q('crest-shield'), crestRing: q('crest-ring'), crestLeft: q('crest-left'), crestRight: q('crest-right'), crestText: q('crest-text'),
      mouthFill: q('mouth-fill'), mouthLine: q('mouth-line'), mouthClip: q('mouth-clip'), teeth: q('teeth'), tongue: q('tongue'),
      eyeClipL: q('eye-clip-l'), eyeClipR: q('eye-clip-r'), irisL: q('iris-l'), irisR: q('iris-r'),
      lidL: q('lid-l'), lidR: q('lid-r'), lidLowL: q('lidlow-l'), lidLowR: q('lidlow-r'),
      browL: q('brow-l'), browR: q('brow-r'), glasses: q('glasses'),
    };
    this.el.torsoClip.setAttribute('d', this.el.torso.getAttribute('d'));
  }

  setKit(kit) { if (KITS[kit]) { this.kit = kit; this.applyKit(); } }

  applyKit() {
    const k = KITS[this.kit];
    const e = this.el;
    e.torso.setAttribute('fill', k.base);
    e.stripes.innerHTML = '';
    if (k.stripe) {
      for (let x = 100; x < 1080; x += k.stripeGap) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', 1100);
        r.setAttribute('width', k.stripeW); r.setAttribute('height', 900);
        r.setAttribute('fill', k.stripe);
        e.stripes.appendChild(r);
      }
    }
    e.ornament.style.display = k.ornament ? '' : 'none';
    e.shoulder.setAttribute('stroke', k.shoulder);
    e.collar.setAttribute('fill', k.collar);
    e.patch.style.display = k.patch ? '' : 'none';
    e.crestShield.setAttribute('fill', k.crest.shield);
    e.crestShield.setAttribute('stroke', k.crest.border);
    e.crestRing.setAttribute('fill', k.crest.ring);
    e.crestLeft.setAttribute('fill', k.crest.left);
    e.crestRight.setAttribute('fill', k.crest.right);
    e.crestText.setAttribute('fill', k.crest.text);
    e.crestText.setAttribute('stroke', k.crest.shield);
  }

  setFit(mode) { this.host.querySelector("svg").setAttribute("preserveAspectRatio", mode === "meet" ? "xMidYMin meet" : "xMidYMid slice"); }

  setGlasses(on) { this.glasses = !!on; this.el.glasses.style.display = this.glasses ? '' : 'none'; }

  // p: see defaultParams()
  update(p) {
    const e = this.el;
    const yaw = clamp(p.yaw, -1, 1);
    const pitch = clamp(p.pitch, -1, 1);
    const roll = clamp(p.roll, -30, 30);

    // Body: slight follow + breathing
    const breathe = 1 + 0.006 * Math.sin(p.time * 0.0022);
    e.body.setAttribute('transform',
      `translate(${(yaw * 18).toFixed(1)} 0) rotate(${(roll * 0.15).toFixed(2)} 540 1400) translate(540 1920) scale(1 ${breathe.toFixed(4)}) translate(-540 -1920)`);

    // Head: position + roll around neck base
    const hx = HEAD_CX + yaw * 40 + p.posX;
    const hy = HEAD_CY + pitch * 28 + p.posY + Math.sin(p.time * 0.0022) * 3;
    e.head.setAttribute('transform', `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${roll.toFixed(2)} 0 ${NECK_PIVOT_Y})`);
    e.headShape.setAttribute('transform', `scale(${(1 - Math.abs(yaw) * 0.06).toFixed(3)} 1)`);
    e.features.setAttribute('transform', `translate(${(yaw * 48).toFixed(1)} ${(pitch * 42).toFixed(1)})`);
    e.ears.setAttribute('transform', `translate(${(-yaw * 16).toFixed(1)} ${(pitch * 10).toFixed(1)})`);

    // Eyes
    this.setEye('L', clamp(p.eyeL, 0, 1), p.gazeX, p.gazeY);
    this.setEye('R', clamp(p.eyeR, 0, 1), p.gazeX, p.gazeY);

    // Brows: translate y (raise negative), tilt around inner end
    e.browL.setAttribute('transform', `translate(0 ${p.browL.toFixed(1)}) rotate(${p.tiltL.toFixed(1)} -50 -124)`);
    e.browR.setAttribute('transform', `translate(0 ${p.browR.toFixed(1)}) rotate(${p.tiltR.toFixed(1)} 50 -124)`);

    // Mouth
    this.setMouth(clamp(p.mouthOpen, 0, 1), clamp(p.smile, -1, 1), clamp(p.mouthWidth, 0.6, 1.4), p.skew);
  }

  setEye(side, open, gx, gy) {
    const e = this.el;
    const clip = side === "L" ? e.eyeClipL : e.eyeClipR;
    const iris = side === "L" ? e.irisL : e.irisR;
    const lid = side === "L" ? e.lidL : e.lidR;
    const lidLow = side === "L" ? e.lidLowL : e.lidLowR;
    // Eye closes from the top: bottom edge stays at y=30, ellipse shrinks upward
    const ry = Math.max(0.6, 30 * open);
    const cy = 30 - ry;
    clip.setAttribute("ry", ry.toFixed(1));
    clip.setAttribute("cy", cy.toFixed(1));
    iris.setAttribute("transform", `translate(${(gx * 18).toFixed(1)} ${(gy * 10).toFixed(1)})`);
    lid.setAttribute("d", `M-48 ${cy.toFixed(1)} A48 ${ry.toFixed(1)} 0 0 1 48 ${cy.toFixed(1)}`);
    lidLow.setAttribute("d", "M-40 27 Q0 37 40 27");
  }

  setMouth(open, smile, width, skew) {
    const e = this.el;
    const W = 70 * width;
    const cyL = -smile * 18 + skew * 9;
    const cyR = -smile * 18 - skew * 9;
    const upper = -6 - open * 6 + smile * 4;
    const lower = 6 + open * 62 - smile * 2;
    const d = `M${(-W).toFixed(1)} ${cyL.toFixed(1)} Q0 ${upper.toFixed(1)} ${W.toFixed(1)} ${cyR.toFixed(1)} Q0 ${lower.toFixed(1)} ${(-W).toFixed(1)} ${cyL.toFixed(1)} Z`;
    e.mouthFill.setAttribute('d', d);
    e.mouthClip.setAttribute('d', d);
    e.mouthLine.setAttribute('d', d);
    e.teeth.style.display = open > 0.08 ? '' : 'none';
    e.teeth.setAttribute('height', Math.min(26, 8 + open * 30).toFixed(1));
    e.tongue.style.display = open > 0.35 ? '' : 'none';
    e.tongue.setAttribute('cy', (20 + open * 40).toFixed(1));
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
