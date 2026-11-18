/* =========================================================
   SANART — «Поле нот»
   Ноты плывут через весь сайт: разлетаются от курсора и пальца,
   звучат при касании, реагируют на скролл и меняют цвет по главам.
   ========================================================= */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  const mouse = { x: innerWidth / 2, y: innerHeight / 2, px: innerWidth / 2, py: innerHeight / 2, vx: 0, vy: 0, moved: false };
  let scrollVel = 0;

  if (!hasGSAP) document.documentElement.classList.add("no-gsap");
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (!location.hash) scrollTo(0, 0);

  /* =========================================================
     AUDIO — всё синтезируется прямо в браузере
     ========================================================= */
  const Sound = {
    ctx: null, master: null, wet: null, on: true,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.on ? 0.7 : 0;
      // небольшой «зал» — сгенерированный импульс реверберации
      const conv = ctx.createConvolver();
      const len = ctx.sampleRate * 2.2;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      conv.buffer = ir;
      this.wet = ctx.createGain(); this.wet.gain.value = 0.28;
      this.dry = ctx.createGain(); this.dry.gain.value = 1;
      this.dry.connect(comp); this.wet.connect(conv); conv.connect(comp);
      comp.connect(this.master); this.master.connect(ctx.destination);
    },
    out(node) { node.connect(this.dry); node.connect(this.wet); },
    ready() { return this.ctx && this.on; },
    setOn(v) {
      this.on = v;
      if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.05);
    },
    hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

    // фортепиано-подобный тон
    piano(freq, vel = 1) {
      if (!this.ready()) return;
      const { ctx } = this, t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.08 * vel, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
      lp.frequency.setValueAtTime(freq * 8, t); lp.frequency.exponentialRampToValueAtTime(freq * 2, t + 1.2);
      [[1, "triangle", 1], [2, "sine", 0.35], [3, "sine", 0.12]].forEach(([m, type, a]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * m;
        const og = ctx.createGain(); og.gain.value = a;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + 2.3);
      });
      lp.connect(g); this.out(g);
    },

    // гитарная струна — Karplus-Strong
    pluck(freq, vel = 1) {
      if (!this.ready()) return;
      const { ctx } = this, sr = ctx.sampleRate, dur = 2.4;
      const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      const N = Math.max(2, Math.round(sr / freq));
      for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
      for (let i = N; i < d.length; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.38 * vel;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
      src.connect(hp); hp.connect(g); this.out(g); src.start();
    },

    // мягкая «стеклянная» нота для струны-фона
    glass(freq) {
      if (!this.ready()) return;
      const { ctx } = this, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
      const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o.connect(g); o2.connect(g2); g2.connect(g); this.out(g);
      o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
    },

    // голос: пила через форманты гласной «а» + вибрато
    voice() {
      if (!this.ready()) return null;
      const { ctx } = this, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sawtooth";
      const vib = ctx.createOscillator(); vib.frequency.value = 5.4;
      const vibG = ctx.createGain(); vibG.gain.value = 0;
      vibG.gain.linearRampToValueAtTime(5, t + 0.6);
      vib.connect(vibG); vibG.connect(o.frequency);
      const sum = ctx.createGain(); sum.gain.value = 1;
      [[800, 0.9, 7], [1150, 0.55, 9], [2900, 0.18, 12]].forEach(([f, a, q]) => {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = a; o.connect(bp); bp.connect(gg); gg.connect(sum);
      });
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.12);
      sum.connect(g); this.out(g);
      const an = ctx.createAnalyser(); an.fftSize = 64; g.connect(an);
      o.start(t); vib.start(t);
      return {
        osc: o, analyser: an,
        stop() {
          const n = ctx.currentTime;
          g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.25);
          o.stop(n + 0.3); vib.stop(n + 0.3);
        }
      };
    }
  };

  const unlock = () => Sound.init();
  addEventListener("pointerdown", unlock, { passive: true });
  addEventListener("keydown", unlock);

  const soundBtn = $("#soundToggle");
  soundBtn.addEventListener("click", () => {
    Sound.init();
    const v = soundBtn.getAttribute("aria-pressed") !== "true";
    soundBtn.setAttribute("aria-pressed", String(v));
    Sound.setOn(v);
  });

  /* =========================================================
     NOTES — поле нот через весь сайт
     Ноты плывут вверх, реагируют на скролл (параллакс по глубине),
     разлетаются от курсора/пальца и «звучат» при касании.
     API прежний: setColor / impulse / pluckAt / W.
     ========================================================= */
  const String_ = (() => {
    const cv = $("#string"), ctx = cv.getContext("2d");
    const glyphs = ["\u266A", "\u266B", "\u2669", "\u266C", "\u266A", "\u266B"];
    const FONT = '"Apple Symbols", "Segoe UI Symbol", "Noto Music", "DejaVu Sans", serif';
    const penta = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
    const col = { r: 255, g: 210, b: 63 }, target = { r: 255, g: 210, b: 63 };
    let W = 0, H = 0, dpr = 1, t = 0, lastNote = 0, kick = 0;
    let notes = [];

    const rnd = (a, b) => a + Math.random() * (b - a);
    function make(yPos) {
      const z = Math.pow(Math.random(), 1.6) * 0.75 + 0.25; // глубина: больше дальних
      return {
        x: rnd(0, W), y: yPos ?? rnd(0, H), z,
        g: glyphs[(Math.random() * glyphs.length) | 0],
        s: 12 + z * 26, rot: rnd(-0.4, 0.4), vr: 0,
        vx: 0, vy: 0, ph: rnd(0, Math.PI * 2), glow: 0, cd: 0
      };
    }

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = Math.round(clamp((W * H) / 24000, 16, 48));
      while (notes.length < want) notes.push(make());
      notes.length = want;
      notes.forEach((n) => { if (n.x > W) n.x = rnd(0, W); if (n.y > H + 40) n.y = rnd(0, H); });
    }
    resize();
    addEventListener("resize", resize);

    function setColor(hex) {
      const n = parseInt(hex.replace("#", ""), 16);
      target.r = (n >> 16) & 255; target.g = (n >> 8) & 255; target.b = n & 255;
    }

    function play(x) {
      const now = performance.now();
      if (now - lastNote < 110) return;
      lastNote = now;
      const k = clamp(Math.floor((x / W) * penta.length), 0, penta.length - 1);
      Sound.glass(Sound.hz(penta[k]));
    }

    // толчок нот вокруг точки x (бывший «щипок струны»); force < 0 — вверх
    function impulse(xPx, force, spread = 7) {
      const r = (spread / 110) * W * 2.4 + 40;
      for (const n of notes) {
        const d = Math.abs(n.x - xPx);
        if (d > r) continue;
        const f = 1 - d / r;
        n.vy += force * 0.22 * f * (0.5 + n.z);
        n.vx += (n.x - xPx) / r * Math.abs(force) * 0.12 * f;
        n.vr += rnd(-0.06, 0.06) * f * Math.abs(force) * 0.1;
        n.glow = Math.max(n.glow, f);
      }
    }
    function pluckAt(xPx, force) { impulse(xPx, force); play(xPx); }

    function step() {
      t += 0.016;
      const sv = clamp(scrollVel, -80, 80);
      kick = lerp(kick, Math.min(Math.abs(sv), 60) / 60, 0.12);
      const R = isTouch ? 90 : 120;
      const speed = Math.hypot(mouse.vx, mouse.vy);

      for (const n of notes) {
        // дрейф вверх + лёгкое покачивание
        n.y -= 0.12 + n.z * 0.32;
        n.x += Math.sin(t * 0.7 + n.ph) * 0.25 * n.z;
        // скролл: ближние ноты летят быстрее (параллакс) и крутятся
        n.y -= sv * (0.18 + n.z * 0.75);
        n.vr += sv * 0.00035 * n.z;

        // курсор / палец: отталкивание и «звучание» при касании
        if (mouse.moved) {
          const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < R && d > 0.1) {
            const f = (1 - d / R) * (0.6 + n.z);
            n.vx += (dx / d) * f * 0.9; n.vy += (dy / d) * f * 0.9;
            if (d < n.s * 1.2 + 10 && speed > 2.5 && n.cd <= 0) {
              n.glow = 1; n.cd = 40; n.vr += rnd(-0.12, 0.12);
              play(n.x);
            }
          }
        }

        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.93; n.vy *= 0.93;
        n.rot += n.vr; n.vr *= 0.94; n.rot *= 0.995;
        n.glow *= 0.955; if (n.cd > 0) n.cd--;

        // бесконечная лента: ушедшие за край возвращаются с другой стороны
        if (n.y < -50) { Object.assign(n, make(H + 40)); }
        else if (n.y > H + 50) { Object.assign(n, make(-40)); }
        if (n.x < -40) n.x = W + 30; else if (n.x > W + 40) n.x = -30;
      }
      if (!isTouch) { mouse.vx *= 0.9; mouse.vy *= 0.9; }

      col.r = lerp(col.r, target.r, 0.04); col.g = lerp(col.g, target.g, 0.04); col.b = lerp(col.b, target.b, 0.04);
      draw();
      requestAnimationFrame(step);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const c = `${col.r | 0},${col.g | 0},${col.b | 0}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const n of notes) {
        const a = clamp(0.1 + n.z * 0.38 + n.glow * 0.55 + kick * 0.12 * n.z, 0, 1);
        const size = n.s * (1 + n.glow * 0.35 + kick * 0.18 * n.z);
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot + Math.sin(t + n.ph) * 0.08);
        ctx.font = `${size | 0}px ${FONT}`;
        if (n.glow > 0.08) {
          ctx.shadowColor = `rgba(${c},${0.9 * n.glow})`;
          ctx.shadowBlur = 18 * n.glow;
        }
        ctx.fillStyle = `rgba(${c},${a})`;
        ctx.fillText(n.g, 0, 0);
        ctx.restore();
      }
    }

    if (!reduce) requestAnimationFrame(step); else draw();
    return { setColor, impulse, pluckAt, get W() { return W; } };
  })();

  // общий доступ для модулей (тест голоса)
  window.SANART = Object.assign(window.SANART || {}, { Sound, string: String_, reduce, isTouch, get scrollVel() { return scrollVel; } });

  /* =========================================================
     CURSOR
     ========================================================= */
  const cursor = $(".cursor");
  const ring = $(".cursor__ring"), dot = $(".cursor__dot"), label = $(".cursor__label");
  let rx = mouse.x, ry = mouse.y;

  addEventListener("pointermove", (e) => {
    mouse.px = mouse.x; mouse.py = mouse.y;
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.vx = mouse.x - mouse.px; mouse.vy = mouse.y - mouse.py;
    mouse.moved = true;
  }, { passive: true });

  if (!isTouch) {
    document.body.classList.add("has-cursor");
    const loop = () => {
      rx = lerp(rx, mouse.x, 0.18); ry = lerp(ry, mouse.y, 0.18);
      dot.style.transform = `translate3d(${mouse.x}px,${mouse.y}px,0)`;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      mouse.vx *= 0.8; mouse.vy *= 0.8;
      requestAnimationFrame(loop);
    };
    loop();

    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest("[data-cursor], a, button, input, label");
      if (!el) { cursor.classList.remove("is-hover"); label.textContent = ""; return; }
      if (el.matches("input")) { cursor.classList.remove("is-hover"); return; }
      cursor.classList.add("is-hover");
      label.textContent = el.dataset.cursor || "";
    });
    addEventListener("pointerdown", () => cursor.classList.add("is-down"));
    addEventListener("pointerup", () => cursor.classList.remove("is-down"));
    document.addEventListener("mouseleave", () => (cursor.style.opacity = 0));
    document.addEventListener("mouseenter", () => (cursor.style.opacity = 1));
  } else {
    // на тач-экранах «трогаем» струну пальцем
    addEventListener("touchmove", (e) => {
      const tt = e.touches[0];
      mouse.px = mouse.x; mouse.py = mouse.y; mouse.x = tt.clientX; mouse.y = tt.clientY;
      mouse.vx = mouse.x - mouse.px; mouse.vy = mouse.y - mouse.py; mouse.moved = true;
    }, { passive: true });
    addEventListener("touchend", () => { mouse.vx = 0; mouse.vy = 0; mouse.moved = false; }, { passive: true });
  }

  // ноты, вылетающие при клике
  const glyphs = ["♪", "♫", "♩", "♬"];
  addEventListener("click", (e) => {
    if (reduce) return;
    for (let i = 0; i < 3; i++) {
      const n = document.createElement("span");
      n.className = "note-fx";
      n.textContent = glyphs[(Math.random() * glyphs.length) | 0];
      n.style.left = e.clientX + "px"; n.style.top = e.clientY + "px";
      document.body.appendChild(n);
      const dx = (Math.random() - 0.5) * 120, dy = -60 - Math.random() * 90;
      n.animate([
        { transform: "translate(-50%,-50%) scale(.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.2) rotate(${dx / 3}deg)`, opacity: 0 }
      ], { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.22,1,.36,1)" }).onfinish = () => n.remove();
    }
  });

  // магнитные элементы
  if (!isTouch) {
    $$("[data-magnetic]").forEach((el) => {
      const s = el.classList.contains("num") ? 0.12 : 0.32;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.translate = `${dx * s}px ${dy * s}px`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transition = "translate .7s cubic-bezier(.22,1,.36,1)";
        el.style.translate = "0px 0px";
        setTimeout(() => (el.style.transition = ""), 700);
      });
    });
  }

  /* =========================================================
     TEXT SCRAMBLE — для надзаголовков и навигации
     ========================================================= */
  const CH = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ#%&*01/<>";
  function scramble(el, dur = 900) {
    const final = el.dataset.text || (el.dataset.text = el.textContent);
    const start = performance.now();
    const tick = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      let out = "";
      for (let i = 0; i < final.length; i++) {
        if (final[i] === " " || i < p * final.length) out += final[i];
        else out += CH[(Math.random() * CH.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  $$(".header__nav a").forEach((a) => a.addEventListener("pointerenter", () => scramble(a, 500)));

  /* =========================================================
     HERO — буквы толстеют и растут рядом с курсором
     ========================================================= */
  const letters = $$("#heroTitle span");
  const lstate = letters.map(() => ({ w: 200, s: 1 }));
  function heroLoop() {
    const time = performance.now() / 1000;
    letters.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      let k;
      if (isTouch || !mouse.moved) {
        k = (Math.sin(time * 1.6 - i * 0.7) + 1) / 2 * 0.55;
      } else {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(mouse.x - cx, (mouse.y - cy) * 1.4);
        k = clamp(1 - d / 420, 0, 1);
        k = k * k * (3 - 2 * k);
      }
      const st = lstate[i];
      st.w = lerp(st.w, 200 + 700 * k, 0.12);
      st.s = lerp(st.s, 1 + 0.22 * k, 0.12);
      el.style.fontVariationSettings = `"wght" ${st.w.toFixed(0)}`;
      el.style.scale = `1 ${st.s.toFixed(3)}`;
    });
    requestAnimationFrame(heroLoop);
  }
  if (!reduce) heroLoop();

  /* =========================================================
     INSTRUMENTS — играбельные мини-интерфейсы
     ========================================================= */
  // ---- фортепиано
  const keysEl = $("#keys");
  const keyMap = { a: 0, s: 2, d: 4, f: 5, g: 7, h: 9, j: 11, k: 12, w: 1, e: 3, t: 6, y: 8, u: 10 };
  function playKey(n) {
    Sound.init();
    Sound.piano(Sound.hz(60 + n));
    String_.impulse(String_.W * (0.15 + (n / 12) * 0.7), -14);
    const el = keysEl.querySelector(`[data-n="${n}"]`);
    if (el) { el.classList.add("down"); setTimeout(() => el.classList.remove("down"), 180); }
  }
  keysEl.addEventListener("pointerdown", (e) => {
    const k = e.target.closest("[data-n]");
    if (k) { e.preventDefault(); playKey(+k.dataset.n); }
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.repeat) return;
    const n = keyMap[e.key.toLowerCase()];
    if (n !== undefined) playKey(n);
  });

  // ---- гитара: Em-аккорд, струны вибрируют
  const strPaths = $$("#strings path");
  const em = [64, 59, 55, 52, 47, 40]; // e B G E B E
  const strState = strPaths.map((p, i) => ({ y: 15 + i * 24, amp: 0, ph: 0, last: 0 }));
  const stringsBox = $("#strings");
  let lastSY = null;
  function strumAt(clientY, clientX) {
    const r = stringsBox.getBoundingClientRect();
    const yy = ((clientY - r.top) / r.height) * 150;
    if (lastSY !== null) {
      strState.forEach((s, i) => {
        if ((lastSY - s.y) * (yy - s.y) <= 0 && performance.now() - s.last > 60) {
          s.last = performance.now();
          s.amp = 9; s.x = ((clientX - r.left) / r.width) * 400;
          Sound.init(); Sound.pluck(Sound.hz(em[i]), 0.9);
          strPaths[i].classList.add("hit");
          setTimeout(() => strPaths[i].classList.remove("hit"), 260);
        }
      });
    }
    lastSY = yy;
  }
  stringsBox.addEventListener("pointermove", (e) => strumAt(e.clientY, e.clientX));
  stringsBox.addEventListener("pointerleave", () => (lastSY = null));
  stringsBox.addEventListener("pointerdown", (e) => { lastSY = null; strumAt(e.clientY, e.clientX); });
  (function strLoop() {
    strState.forEach((s, i) => {
      if (s.amp > 0.05) {
        s.ph += 1.1; s.amp *= 0.93;
        const off = Math.sin(s.ph) * s.amp;
        strPaths[i].setAttribute("d", `M0 ${s.y} Q${s.x || 200} ${s.y + off * 2} 400 ${s.y}`);
      } else if (s.amp !== 0) { s.amp = 0; strPaths[i].setAttribute("d", `M0 ${s.y} Q200 ${s.y} 400 ${s.y}`); }
    });
    requestAnimationFrame(strLoop);
  })();

  // ---- вокал: зажми — распевка до-ми-соль-ми-до
  const voiceBtn = $("#voiceBtn"), bars = $$("#voiceBars i");
  let voice = null, voiceTimer = null, voiceRaf = 0;
  const scale = [60, 64, 67, 72, 67, 64, 60];
  function voiceStart(e) {
    e.preventDefault();
    Sound.init();
    if (voice) return;
    voice = Sound.voice();
    voiceBtn.classList.add("is-on");
    let k = 0;
    const next = () => {
      if (!voice) return;
      const f = Sound.hz(scale[k % scale.length]);
      voice.osc.frequency.setTargetAtTime(f, Sound.ctx.currentTime, 0.04);
      String_.impulse(String_.W * (0.2 + (k % scale.length) * 0.1), -10);
      k++;
      voiceTimer = setTimeout(next, 420);
    };
    if (voice) next();
    const data = new Uint8Array(32);
    const draw = () => {
      if (voice && voice.analyser) {
        voice.analyser.getByteFrequencyData(data);
        bars.forEach((b, i) => (b.style.transform = `scaleY(${clamp(data[i + 1] / 200, 0.08, 1)})`));
      } else {
        const tt = performance.now() / 120;
        bars.forEach((b, i) => (b.style.transform = `scaleY(${0.2 + Math.abs(Math.sin(tt + i)) * 0.8})`));
      }
      voiceRaf = requestAnimationFrame(draw);
    };
    draw();
  }
  function voiceStop() {
    voiceBtn.classList.remove("is-on");
    clearTimeout(voiceTimer); cancelAnimationFrame(voiceRaf);
    bars.forEach((b) => (b.style.transform = "scaleY(.08)"));
    if (voice) { voice.stop(); voice = null; }
  }
  voiceBtn.addEventListener("pointerdown", voiceStart);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => voiceBtn.addEventListener(ev, voiceStop));
  voiceBtn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !voice) voiceStart(e); });
  voiceBtn.addEventListener("keyup", voiceStop);

  /* =========================================================
     BEFORE / AFTER
     ========================================================= */
  const baFrame = $("#baFrame");
  const wb = $("#waveBefore"), wa = $("#waveAfter");
  let baPos = 50, baDrag = false, baVisible = false;
  const setBA = (p) => { baPos = clamp(p, 3, 97); baFrame.style.setProperty("--pos", baPos + "%"); };
  const baFromEvent = (e) => { const r = baFrame.getBoundingClientRect(); setBA(((e.clientX - r.left) / r.width) * 100); };
  baFrame.addEventListener("pointerdown", (e) => { baDrag = true; baFrame.setPointerCapture(e.pointerId); baFromEvent(e); });
  baFrame.addEventListener("pointermove", (e) => { if (baDrag) baFromEvent(e); });
  baFrame.addEventListener("pointerup", () => (baDrag = false));
  baFrame.addEventListener("pointercancel", () => (baDrag = false));
  baFrame.tabIndex = 0;
  baFrame.setAttribute("role", "slider");
  baFrame.setAttribute("aria-label", "Сравнение до и после");
  baFrame.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") setBA(baPos - 5);
    if (e.key === "ArrowRight") setBA(baPos + 5);
  });
  new IntersectionObserver(([en]) => (baVisible = en.isIntersecting)).observe(baFrame);
  (function waveLoop() {
    if (baVisible) {
      const t = performance.now() / 1000;
      let b = "", a = "";
      for (let k = 0; k <= 120; k++) {
        const x = k * 5, u = k / 120, env = Math.sin(Math.PI * u);
        const jit = Math.sin(k * 1.7 + t * 9) * Math.sin(k * 0.9 - t * 5.3) * 18 + (Math.random() - 0.5) * 8;
        const yb = 60 + (Math.sin(k * 0.35 + t * 3) * 10 + jit) * env * (0.6 + 0.4 * Math.sin(t * 2.3 + k * 0.05));
        const ya = 60 + Math.sin(k * 0.16 - t * 2.4) * 34 * env * (0.88 + 0.12 * Math.sin(t * 1.3));
        b += (k ? "L" : "M") + x + " " + yb.toFixed(1);
        a += (k ? "L" : "M") + x + " " + ya.toFixed(1);
      }
      wb.setAttribute("d", b); wa.setAttribute("d", a);
    }
    requestAnimationFrame(waveLoop);
  })();

  /* =========================================================
     3D RING — «История души»
     ========================================================= */
  const ringEl = $("#ring"), ringInner = $("#ringInner"), cards = $$(".card", ringInner);
  const ringS = { scroll: 0, drag: 0, vel: 0, cur: 0, tilt: 0, dragging: false, moved: 0 };
  let ringR = 300;
  function ringLayout() {
    const w = ringInner.offsetWidth;
    ringR = (w / 2) / Math.tan(Math.PI / cards.length) * 1.25;
  }
  ringLayout(); addEventListener("resize", ringLayout);
  let rdX = 0;
  ringEl.addEventListener("pointerdown", (e) => { ringS.dragging = true; ringS.moved = 0; rdX = e.clientX; });
  addEventListener("pointermove", (e) => {
    if (!ringS.dragging) return;
    const dx = e.clientX - rdX; rdX = e.clientX;
    ringS.moved += Math.abs(dx);
    ringS.drag += dx * 0.3; ringS.vel = dx * 0.3;
  });
  addEventListener("pointerup", () => (ringS.dragging = false));
  cards.forEach((c) => {
    c.addEventListener("click", (e) => { if (ringS.moved > 6) e.preventDefault(); });
    c.addEventListener("dragstart", (e) => e.preventDefault());
  });
  (function ringLoop() {
    if (!ringS.dragging) { ringS.drag += ringS.vel; ringS.vel *= 0.94; }
    const target = ringS.scroll + ringS.drag;
    ringS.cur = lerp(ringS.cur, target, 0.08);
    const tiltT = isTouch ? 0 : ((mouse.y / innerHeight) - 0.5) * -10;
    ringS.tilt = lerp(ringS.tilt, tiltT, 0.05);
    ringInner.style.transform = `translateZ(${-ringR}px) rotateX(${ringS.tilt}deg) rotateY(${ringS.cur}deg)`;
    const step = 360 / cards.length;
    cards.forEach((c, i) => {
      const ang = i * step;
      c.style.transform = `rotateY(${ang}deg) translateZ(${ringR}px)`;
      const facing = Math.cos(((ang + ringS.cur) * Math.PI) / 180);
      c.style.filter = `brightness(${(0.35 + 0.65 * clamp(facing, 0, 1)).toFixed(2)})`;
    });
    requestAnimationFrame(ringLoop);
  })();

  /* =========================================================
     VINYL
     ========================================================= */
  const record = $("#record"), disc = $(".record__disc", record), recImg = $("#recordImg");
  let recRot = 0, recSpeed = 0.15, recTarget = 0.15;
  const trackNotes = [[57, 64, 69], [60, 64, 67], [62, 65, 69], [55, 62, 67]];
  $$(".vinyl__list a").forEach((a, i) => {
    a.addEventListener("pointerenter", () => {
      $$(".vinyl__list a").forEach((x) => x.classList.remove("on"));
      a.classList.add("on");
      record.classList.add("is-playing");
      recTarget = 2.2;
      if (recImg.getAttribute("src") !== a.dataset.img) {
        recImg.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.3) rotate(-90deg)", opacity: 0 }], { duration: 220, easing: "ease-in" }).onfinish = () => {
          recImg.src = a.dataset.img;
          recImg.animate([{ transform: "scale(.3) rotate(90deg)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
        };
      }
      trackNotes[i % trackNotes.length].forEach((n, j) => setTimeout(() => Sound.piano(Sound.hz(n), 0.45), j * 90));
    });
    a.addEventListener("pointerleave", () => { record.classList.remove("is-playing"); recTarget = 0.15; });
  });
  (function recLoop() {
    recSpeed = lerp(recSpeed, recTarget + Math.abs(scrollVel) * 0.1, 0.05);
    recRot += recSpeed;
    disc.style.transform = `rotate(${recRot}deg)`;
    requestAnimationFrame(recLoop);
  })();

  /* =========================================================
     MARQUEE — скорость и наклон от скролла
     ========================================================= */
  const marquees = $$(".marquee").map((m) => ({ row: $(".marquee__row", m), dir: +m.dataset.speed, x: 0 }));
  (function mqLoop() {
    marquees.forEach((m) => {
      const half = m.row.scrollWidth / 2;
      m.x -= (0.6 + Math.abs(scrollVel) * 0.25) * m.dir;
      if (m.x <= -half) m.x += half;
      if (m.x > 0) m.x -= half;
      m.row.style.transform = `translate3d(${m.x}px,0,0) skewX(${clamp(-scrollVel * 0.4, -12, 12)}deg)`;
    });
    requestAnimationFrame(mqLoop);
  })();

  /* =========================================================
     NOTES — перетаскиваемые записки
     ========================================================= */
  let zTop = 10;
  $$(".note").forEach((n) => {
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    n.addEventListener("pointerdown", (e) => {
      on = true; n.setPointerCapture(e.pointerId); n.classList.add("is-drag"); n.style.zIndex = ++zTop;
      sx = e.clientX - dx; sy = e.clientY - dy;
    });
    n.addEventListener("pointermove", (e) => {
      if (!on) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      n.style.setProperty("--dx", dx + "px"); n.style.setProperty("--dy", dy + "px");
    });
    const end = () => { on = false; n.classList.remove("is-drag"); };
    n.addEventListener("pointerup", end); n.addEventListener("pointercancel", end);
  });

  /* =========================================================
     FORM
     ========================================================= */
  const form = $("#form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), phone = form.phone.value.trim();
    form.name.classList.toggle("err", !name);
    form.phone.classList.toggle("err", phone.replace(/\D/g, "").length < 6);
    if (!name || phone.replace(/\D/g, "").length < 6) return;
    const dir = form.dir.value;
    const vt = window.SANART && window.SANART.voiceType;
    const msg = `Здравствуйте! Хочу на пробный урок: ${dir}. Меня зовут ${name}, мой номер ${phone}.` + (vt ? ` Тест голоса на сайте показал: ${vt}.` : "");
    const ok = $("#formOk");
    ok.hidden = false;
    [0, 4, 7, 12].forEach((n, i) => setTimeout(() => Sound.piano(Sound.hz(64 + n), 0.6), i * 110));
    window.open("https://wa.me/77006979166?text=" + encodeURIComponent(msg), "_blank", "noopener");
  });

  /* =========================================================
     PRELOADER → INTRO
     ========================================================= */
  const ticks = $(".loader__ticks");
  for (let i = 0; i <= 20; i++) {
    const a = (-70 + i * 7) * (Math.PI / 180);
    const r1 = 82, r2 = i % 5 ? 76 : 70;
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("x1", 100 + Math.sin(a) * r1); l.setAttribute("y1", 100 - Math.cos(a) * r1);
    l.setAttribute("x2", 100 + Math.sin(a) * r2); l.setAttribute("y2", 100 - Math.cos(a) * r2);
    ticks.appendChild(l);
  }
  const needle = $(".loader__needle"), hzEl = $("#hz");
  document.body.classList.add("is-loading");

  function runLoader() {
    return new Promise((res) => {
      const dur = reduce ? 200 : 1700, start = performance.now();
      setTimeout(res, dur + 900); // страховка, если rAF притормаживает в фоновой вкладке
      const tick = (now) => {
        const p = clamp((now - start) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const hz = Math.round(440 * e + (p < 1 ? Math.sin(now / 40) * 6 * (1 - p) : 0));
        hzEl.textContent = String(clamp(hz, 0, 440)).padStart(3, "0");
        const wob = p < 1 ? Math.sin(p * 18) * 14 * (1 - p) : 0;
        needle.style.transform = `rotate(${-70 + 70 * e + wob}deg)`;
        if (p < 1) requestAnimationFrame(tick); else setTimeout(res, 280);
      };
      requestAnimationFrame(tick);
    });
  }
  const loaded = new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)));
  const timeout = new Promise((r) => setTimeout(r, 2500));

  Promise.all([runLoader(), Promise.race([loaded, timeout])]).then(() => {
    $("#loader").classList.add("is-done");
    document.body.classList.remove("is-loading");
    String_.impulse(innerWidth * 0.5, -40, 14);
    intro();
    setTimeout(() => $("#loader").remove(), 1300);
  });

  /* =========================================================
     GSAP: скролл-сцены и сторителлинг
     ========================================================= */
  let lenis = null;
  function intro() {
    if (!hasGSAP) { $$(".manifest__text .w").forEach((w) => (w.style.opacity = 1)); return; }
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".hero__title span", { yPercent: 120, rotate: 8, opacity: 0, duration: 1.6, stagger: 0.07 })
      .from(".hero__eyebrow", { y: 20, opacity: 0, duration: 1 }, 0.3)
      .from(".hero__hand", { opacity: 0, y: 30, rotate: -14, duration: 1.2 }, 0.7)
      .to(".scribble path", { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" }, 0.9)
      .from(".hero__lead", { opacity: 0, letterSpacing: "1em", duration: 1.6 }, 0.8)
      .from(".hero__stack img", { opacity: 0, scale: 0.6, y: 120, rotate: 0, duration: 1.6, stagger: 0.12 }, 0.5)
      .from(".hero__hint", { opacity: 0, duration: 1 }, 1.4)
      .from(".header", { y: -80, opacity: 0, duration: 1.2 }, 0.6);
  }

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);

    // плавный скролл
    if (window.Lenis && !reduce) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on("scroll", (l) => { ScrollTrigger.update(); scrollVel = l.velocity || 0; });
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length > 1 && $(id)) { e.preventDefault(); lenis.scrollTo($(id), { duration: 1.6 }); }
        else if (id === "#top") { e.preventDefault(); lenis.scrollTo(0, { duration: 1.6 }); }
      }));
    } else {
      let ly = scrollY;
      addEventListener("scroll", () => { scrollVel = scrollY - ly; ly = scrollY; }, { passive: true });
    }
    gsap.ticker.add(() => { if (!lenis) scrollVel *= 0.9; });

    // header: уменьшается / прячется, прогресс-струна
    const header = $("#header"), prog = $(".header__progress span");
    let lastY = 0;
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: (self) => {
        const y = self.scroll();
        header.classList.toggle("is-small", y > 80);
        header.classList.toggle("is-hidden", y > 700 && y > lastY + 2 && self.getVelocity() > 400);
        if (y < lastY) header.classList.remove("is-hidden");
        lastY = y;
        prog.style.transform = `scaleX(${self.progress})`;
      }
    });

    // сферы плавают за скроллом
    gsap.to(".orb--a", { x: "40vw", y: "60vh", ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 1.5 } });
    gsap.to(".orb--b", { x: "-50vw", y: "-50vh", scale: 1.3, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 2 } });

    // hero уходит в глубину
    gsap.to(".hero__title", { scale: 0.7, opacity: 0.1, yPercent: -30, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__stack img:nth-child(1)", { y: -260, rotate: -24, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__stack img:nth-child(2)", { y: -380, rotate: 22, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__stack img:nth-child(3)", { y: -160, rotate: 10, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

    // надзаголовки — scramble
    $$(".eyebrow:not(.hero__eyebrow)").forEach((el) => ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => scramble(el, 1000) }));

    // заголовки h2 — подъём с маской
    $$(".h2").forEach((h) => gsap.from(h, { yPercent: 40, opacity: 0, filter: "blur(10px)", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: h, start: "top 85%" } }));

    // манифест: слова загораются по одному
    const mt = $("#manifest");
    const wrapWords = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((p) => {
            if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
            const s = document.createElement("span"); s.className = "w"; s.textContent = p; frag.appendChild(s);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) {
          c.classList.add("w");
        }
      });
    };
    wrapWords(mt);
    gsap.to("#manifest .w", { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: ".manifest", start: "top 70%", end: "bottom 60%", scrub: true } });
    gsap.from(".manifest__sign", { opacity: 0, x: -40, rotate: -12, scrollTrigger: { trigger: ".manifest__sign", start: "top 85%", end: "top 55%", scrub: true } });

    // цифры
    $$(".num").forEach((n, i) => gsap.from(n, { scale: 0.5, opacity: 0, duration: 1.4, delay: i * 0.1, ease: "expo.out", scrollTrigger: { trigger: ".numbers", start: "top 75%" } }));
    $$("[data-count]").forEach((b) => {
      const end = +b.dataset.count, dec = +(b.dataset.dec || 0), raw = "raw" in b.dataset;
      const o = { v: raw ? end - 40 : 0 };
      const fmt = (v) => dec ? v.toFixed(dec).replace(".", ",") : raw ? String(Math.round(v)) : Math.round(v).toLocaleString("ru-RU");
      b.textContent = fmt(o.v);
      ScrollTrigger.create({ trigger: b, start: "top 85%", once: true, onEnter: () => gsap.to(o, { v: end, duration: 2.2, ease: "power3.out", onUpdate: () => (b.textContent = fmt(o.v)) }) });
    });

    const mm = gsap.matchMedia();

    // направления — закреплённая сцена с тремя инструментами
    const insts = $$(".inst"), words = $$(".play__word"), dots = $$(".play__dots i");
    gsap.set(insts.slice(1), { autoAlpha: 0, yPercent: 30, rotateX: -25, scale: 0.9 });
    gsap.set(words.slice(1), { autoAlpha: 0, yPercent: 60 });
    dots[0].classList.add("on");
    const ptl = gsap.timeline({
      scrollTrigger: {
        trigger: ".play", start: "top top", end: "+=260%", scrub: 0.8, pin: ".play__pin",
        onUpdate: (self) => {
          const idx = Math.min(2, Math.floor(self.progress * 2.999 + 0.15));
          dots.forEach((d, i) => d.classList.toggle("on", i === idx));
          insts.forEach((el, i) => (el.style.pointerEvents = i === idx ? "auto" : "none"));
        }
      }
    });
    for (let i = 1; i < 3; i++) {
      ptl.to(insts[i - 1], { autoAlpha: 0, yPercent: -30, rotateX: 25, scale: 0.9, duration: 1 }, i * 1.5)
        .to(insts[i], { autoAlpha: 1, yPercent: 0, rotateX: 0, scale: 1, duration: 1 }, i * 1.5 + 0.2)
        .to(words[i - 1], { autoAlpha: 0, yPercent: -60, duration: 1 }, i * 1.5)
        .to(words[i], { autoAlpha: 1, yPercent: 0, duration: 1 }, i * 1.5 + 0.2);
    }
    ptl.to({}, { duration: 0.8 });
    insts.forEach((el, i) => (el.style.pointerEvents = i === 0 ? "auto" : "none"));

    // путь ученика — горизонтальный сторителлинг
    mm.add("(min-width: 641px)", () => {
      const track = $("#pathTrack");
      const line = $("#pathLine");
      const prog = line.cloneNode();
      prog.removeAttribute("id");
      prog.style.cssText = "stroke: var(--yellow); stroke-dasharray: none; opacity: 1; stroke-width: 2.5; filter: drop-shadow(0 0 6px rgba(255,210,63,.6))";
      line.after(prog);
      const len = prog.getTotalLength();
      gsap.set(prog, { strokeDasharray: len, strokeDashoffset: len });
      const dist = () => track.scrollWidth - innerWidth;
      const htl = gsap.timeline({
        scrollTrigger: { trigger: ".path", start: "top top", end: () => "+=" + dist(), scrub: 1, pin: ".path__pin", invalidateOnRefresh: true }
      });
      htl.to(track, { x: () => -dist(), ease: "none" }, 0)
        .to(prog, { strokeDashoffset: 0, ease: "none" }, 0);
      $$(".step", track).forEach((st) => {
        gsap.from(st.querySelector(".step__media"), { clipPath: "inset(100% 0 0 0)", ease: "expo.out", duration: 1.2, scrollTrigger: { trigger: st, containerAnimation: htl, start: "left 85%", toggleActions: "play none none reverse" } });
        gsap.to(st.querySelector("img"), { xPercent: -10, ease: "none", scrollTrigger: { trigger: st, containerAnimation: htl, start: "left right", end: "right left", scrub: true } });
        gsap.from(st.querySelector(".step__hand"), { opacity: 0, rotate: -20, scale: 0.6, duration: 1, ease: "back.out(2)", scrollTrigger: { trigger: st, containerAnimation: htl, start: "left 60%", toggleActions: "play none none reverse" } });
      });
      return () => prog.remove();
    });
    mm.add("(max-width: 640px)", () => {
      $$(".step").forEach((st) => gsap.from(st, { y: 80, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: st, start: "top 85%" } }));
    });

    // до/после — разделитель сам «покачивается» при входе
    ScrollTrigger.create({
      trigger: baFrame, start: "top 70%", once: true,
      onEnter: () => { const o = { p: 92 }; gsap.to(o, { p: 50, duration: 2.2, ease: "elastic.out(1, .5)", onUpdate: () => setBA(o.p) }); }
    });
    gsap.from(baFrame, { scale: 0.85, borderRadius: "200px", ease: "none", scrollTrigger: { trigger: baFrame, start: "top bottom", end: "center center", scrub: true } });

    // кольцо историй — вращение скроллом
    ScrollTrigger.create({
      trigger: ".stories", start: "top top", end: "+=140%", pin: ".stories__pin", scrub: true,
      onUpdate: (self) => (ringS.scroll = -self.progress * 315)
    });
    gsap.from(".ring", { scale: 0.6, opacity: 0, scrollTrigger: { trigger: ".stories", start: "top 80%", end: "top top", scrub: true } });

    // пластинка
    gsap.from(".record", { rotate: -180, scale: 0.5, opacity: 0, ease: "none", scrollTrigger: { trigger: ".vinyl", start: "top 90%", end: "center center", scrub: true } });
    gsap.from(".vinyl__list--l li", { x: -120, opacity: 0, stagger: 0.1, scrollTrigger: { trigger: ".vinyl", start: "top 70%", end: "center center", scrub: true } });
    gsap.from(".vinyl__list--r li", { x: 120, opacity: 0, stagger: 0.1, scrollTrigger: { trigger: ".vinyl", start: "top 70%", end: "center center", scrub: true } });

    // карточки событий
    gsap.from(".ev", { y: 140, opacity: 0, rotate: (i) => (i % 2 ? 6 : -6), stagger: 0.12, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".events__cards", start: "top 85%" } });

    // записки падают на стол
    gsap.from(".note", { "--dy": "-420px", opacity: 0, stagger: 0.18, duration: 1.4, ease: "bounce.out", scrollTrigger: { trigger: ".notes", start: "top 75%" } });

    // горы рисуются
    $$(".contact__mount path").forEach((p, i) => {
      const L = p.getTotalLength();
      gsap.set(p, { strokeDasharray: L, strokeDashoffset: L });
      gsap.to(p, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".contact", start: "top 85%", end: "center center", scrub: true } });
    });
    gsap.from(".contact__glass", { y: 120, scale: 0.92, opacity: 0, ease: "none", scrollTrigger: { trigger: ".contact", start: "top 85%", end: "top 25%", scrub: true } });

    // футер
    gsap.from(".footer__big", { yPercent: 60, scaleY: 0.4, opacity: 0, ease: "none", scrollTrigger: { trigger: ".footer", start: "top bottom", end: "bottom bottom", scrub: true } });

    // цвет струны и сферы по главам (создаётся после pin-секций, чтобы позиции были верными)
    $$("[data-tone]").forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec, start: "top 55%", end: "bottom 55%",
        onToggle: (self) => {
          if (!self.isActive) return;
          const c = sec.dataset.tone;
          String_.setColor(c);
          document.documentElement.style.setProperty("--tone", c);
        }
      });
    });

    addEventListener("load", () => ScrollTrigger.refresh());
  } else {
    let ly = scrollY;
    addEventListener("scroll", () => { scrollVel = scrollY - ly; ly = scrollY; }, { passive: true });
  }
})();
