/* =========================================================
   SANART — тест «Какой у тебя голос?»
   Микрофон → автокорреляция → нота. Три шага: нижняя нота,
   верхняя нота, речь. Классификация по диапазону и высоте речи.
   Весь звук обрабатывается локально в браузере.
   ========================================================= */
(() => {
  "use strict";
  const S = window.SANART || {};
  const Sound = S.Sound;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const root = $("#vt");
  if (!root) return;

  /* ---------- справочник типов голоса ----------
     Диапазоны — типичные «академические» границы (научная нотация, MIDI):
     бас E2–E4, баритон A2–A4, тенор C3–C5, контральто F3–F5,
     меццо-сопрано A3–A5, сопрано C4–C6.
     Источники: New Grove Dictionary of Opera / Wikipedia (RU, EN).
     sp — ориентир средней высоты речи, Гц (обзор Pullon, 2014; слабый признак). */
  const TYPES = [
    { id: "bass", name: "Бас", lo: 40, hi: 64, sp: 95, sex: "m", color: "#5b7cff",
      desc: "Самый низкий мужской голос: глубокий, полный и «весомый», с плотными низами.",
      ex: "Евгений Нестеренко · Фёдор Шаляпин" },
    { id: "baritone", name: "Баритон", lo: 45, hi: 69, sp: 112, sex: "m", color: "#7aa2ff",
      desc: "Самый распространённый мужской голос: тёплый и насыщенный — темнее тенора, светлее баса.",
      ex: "Муслим Магомаев · Ермек Серкебаев" },
    { id: "tenor", name: "Тенор", lo: 48, hi: 72, sp: 125, sex: "m", color: "#b98cff",
      desc: "Высокий мужской голос: светлый, звонкий, «серебристый», с яркими верхами.",
      ex: "Сергей Лемешев · Лучано Паваротти" },
    { id: "contralto", name: "Контральто", lo: 53, hi: 77, sp: 175, sex: "f", color: "#ff5fa2",
      desc: "Самый низкий и редкий женский голос: густой, тёмный, с бархатными грудными низами.",
      ex: "Кэтлин Ферриер · Елизавета Антонова" },
    { id: "mezzo", name: "Меццо-сопрано", lo: 57, hi: 81, sp: 190, sex: "f", color: "#ff8a5f",
      desc: "Средний женский голос: плотнее и темнее сопрано, с сочной серединой и мягкими низами.",
      ex: "Елена Образцова · Ирина Архипова" },
    { id: "soprano", name: "Сопрано", lo: 60, hi: 84, sp: 210, sex: "f", color: "#ffd23f",
      desc: "Самый высокий женский голос: светлый, лёгкий и блестящий, с полётными верхами.",
      ex: "Галина Вишневская · Куляш Байсеитова" }
  ];

  const EN = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const RU = ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"];
  const noteName = (m) => { const r = Math.round(m); return EN[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); };
  const noteRu = (m) => RU[((Math.round(m) % 12) + 12) % 12];
  const hz2midi = (f) => 69 + 12 * Math.log2(f / 440);
  const midi2hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- клавиатура C2–C6 ---------- */
  const KB_LO = 36, KB_HI = 84;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  let WHITE = 0;
  for (let m = KB_LO; m <= KB_HI; m++) if (!isBlack(m)) WHITE++;
  // позиция центра клавиши в долях ширины
  function pos(m) {
    m = clamp(m, KB_LO, KB_HI);
    const r = Math.floor(m), frac = m - r;
    let w = 0;
    for (let k = KB_LO; k < r; k++) if (!isBlack(k)) w++;
    const p0 = isBlack(r) ? w : w + 0.5;
    if (frac === 0 || r >= KB_HI) return p0 / WHITE;
    const p1 = isBlack(r + 1) ? w + 1 : w + (isBlack(r) ? 0.5 : 1.5);
    return (p0 + (p1 - p0) * frac) / WHITE;
  }

  const kb = $("#vtKb");
  const half = 0.5 / WHITE;
  (function buildKb() {
    let html = "";
    for (let m = KB_LO; m <= KB_HI; m++) {
      const lbl = m % 12 === 0 ? `<em>${noteName(m)}</em>` : "";
      if (isBlack(m)) html += `<button type="button" class="k k--b" data-m="${m}" style="left:${(pos(m) * 100).toFixed(3)}%" aria-label="${noteName(m)}"></button>`;
      else html += `<button type="button" class="k k--w" data-m="${m}" style="left:${((pos(m) - half) * 100).toFixed(3)}%;width:${(100 / WHITE).toFixed(3)}%" aria-label="${noteName(m)}">${lbl}</button>`;
    }
    html += `<div class="vt__you" id="vtYou"></div><div class="vt__live" id="vtLive"></div>`;
    kb.innerHTML = html;
  })();

  const bandsEl = $("#vtBands");
  bandsEl.innerHTML = TYPES.map((t) => {
    const l = (pos(t.lo) - half) * 100, r = (pos(t.hi) + half) * 100;
    return `<div class="band" data-id="${t.id}" style="--c:${t.color};left:${l.toFixed(2)}%;width:${(r - l).toFixed(2)}%"><span>${t.name}</span></div>`;
  }).join("");

  const youEl = $("#vtYou"), liveEl = $("#vtLive");
  function showYou(L, H) {
    if (L == null) { youEl.style.opacity = 0; return; }
    const hi = H == null ? L : H;
    const l = (pos(Math.min(L, hi)) - half) * 100, r = (pos(Math.max(L, hi)) + half) * 100;
    youEl.style.left = l + "%"; youEl.style.width = (r - l) + "%"; youEl.style.opacity = 1;
  }

  // на мобильном — прокрутить к середине клавиатуры
  const kbWrap = $(".vt__kbwrap");
  requestAnimationFrame(() => { kbWrap.scrollLeft = (kbWrap.scrollWidth - kbWrap.clientWidth) * 0.4; });

  /* ---------- экраны и шаги ---------- */
  const screens = $$(".vt__screen", root);
  const stepsLi = $$("#vtSteps li");
  function show(name, step) {
    screens.forEach((s) => (s.hidden = s.dataset.screen !== name));
    stepsLi.forEach((li, i) => { li.classList.toggle("on", i === step); li.classList.toggle("done", i < step); });
    const sc = screens.find((s) => s.dataset.screen === name);
    if (window.gsap && !S.reduce) gsap.fromTo(sc, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: "expo.out" });
  }

  const STEPS = {
    low: { idx: 1, task: "Тяни самую низкую ноту", hint: "на «а-а-а», спокойно — без хрипа и шёпота", dur: 4000, btn: "Записать · 4 сек" },
    high: { idx: 2, task: "Теперь самую высокую — но удобную", hint: "не кричи и не уходи в фальцет — только то, что звучит свободно", dur: 4000, btn: "Записать · 4 сек" },
    speak: { idx: 3, task: "Скажи обычным голосом", hint: "«Привет! Меня зовут… и я хочу петь в SANART»", dur: 5000, btn: "Записать · 5 сек" }
  };

  /* ---------- детектор высоты тона (автокорреляция) ---------- */
  function detect(buf, sr) {
    let n = buf.length, rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.01) return -1;
    const maxLag = Math.min(n - 1, Math.floor(sr / 65));
    const minLag = Math.floor(sr / 1100);
    const c = new Float32Array(maxLag + 2);
    for (let lag = 0; lag <= maxLag + 1; lag++) {
      let s = 0;
      for (let j = 0, L = n - lag; j < L; j++) s += buf[j] * buf[j + lag];
      c[lag] = s;
    }
    let d = minLag;
    while (d < maxLag && c[d] > c[d + 1]) d++;
    let mv = -Infinity, mp = -1;
    for (let i = d; i <= maxLag; i++) if (c[i] > mv) { mv = c[i]; mp = i; }
    if (mp <= minLag || mp >= maxLag) return -1;
    if (mv / c[0] < 0.55) return -1; // не похоже на тон
    const x1 = c[mp - 1], x2 = c[mp], x3 = c[mp + 1];
    const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
    const T = a ? mp - b / (2 * a) : mp;
    return sr / T;
  }

  /* ---------- микрофон и живой цикл ---------- */
  const st = { stream: null, an: null, buf: null, raf: 0, hist: [], trace: [], rec: null, step: null, res: { L: null, H: null, S: null }, frame: 0 };
  const el = {
    task: $("#vtTask"), hint: $("#vtHint"), note: $("#vtNote"), noteRu: $("#vtNoteRu"), hz: $("#vtHz"),
    prog: $("#vtProg"), rec: $("#vtRec"), skip: $("#vtSkip"), msg: $("#vtMsg"), trace: $("#vtTrace")
  };
  const RING = 2 * Math.PI * 54;
  el.prog.style.strokeDasharray = RING;
  el.prog.style.strokeDashoffset = RING;

  async function startMic() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toManual("Микрофон доступен только на сайте с https. Пройди тест по клавишам 👇");
      return;
    }
    Sound && Sound.init();
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      toManual("Без доступа к микрофону — не страшно, пройди тест по клавишам 👇");
      return;
    }
    const ctx = Sound.ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(st.stream);
    st.an = ctx.createAnalyser();
    st.an.fftSize = 2048;
    src.connect(st.an);
    st.buf = new Float32Array(st.an.fftSize);
    st.res = { L: null, H: null, S: null };
    showYou(null);
    goStep("low");
    loop();
  }

  function stopMic() {
    cancelAnimationFrame(st.raf);
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null; st.an = null;
    liveEl.style.opacity = 0;
  }

  function goStep(name) {
    const s = STEPS[name];
    st.step = name; st.rec = null;
    el.task.textContent = s.task; el.hint.textContent = s.hint;
    el.rec.querySelector("span").textContent = s.btn;
    el.rec.disabled = false;
    el.skip.hidden = name !== "speak";
    el.msg.textContent = "";
    el.prog.style.strokeDashoffset = RING;
    show("sing", s.idx);
  }

  const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[clamp(Math.floor(b.length * p), 0, b.length - 1)]; };

  function loop() {
    st.raf = requestAnimationFrame(loop);
    if (!st.an) return;
    st.frame++;
    st.an.getFloatTimeDomainData(st.buf);
    const f = detect(st.buf, Sound.ctx.sampleRate);
    let m = NaN;
    if (f > 0) {
      st.hist.push(hz2midi(f));
      if (st.hist.length > 5) st.hist.shift();
      m = median(st.hist);
    } else {
      st.hist.length = 0;
    }

    if (!isNaN(m)) {
      el.note.textContent = noteName(m);
      el.noteRu.textContent = noteRu(m);
      el.hz.textContent = Math.round(midi2hz(m)) + " Hz";
      liveEl.style.left = pos(m) * 100 + "%";
      liveEl.style.opacity = 1;
      if (st.frame % 5 === 0 && S.string) S.string.impulse(innerWidth * clamp(pos(m), 0.05, 0.95), -5, 6);
    } else {
      liveEl.style.opacity = 0.25;
    }
    st.trace.push(m);
    if (st.trace.length > 240) st.trace.shift();
    drawTrace();

    if (st.rec) {
      const p = clamp((performance.now() - st.rec.t0) / st.rec.dur, 0, 1);
      el.prog.style.strokeDashoffset = RING * (1 - p);
      if (!isNaN(m)) st.rec.vals.push(m);
      if (p >= 1) finishRec();
    }
  }

  function drawTrace() {
    const cv = el.trace, ctx = cv.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const y = (m) => h - ((m - KB_LO) / (KB_HI - KB_LO)) * h;
    ctx.font = "10px JetBrains Mono, monospace";
    for (let m = KB_LO; m <= KB_HI; m += 12) {
      ctx.strokeStyle = "rgba(243,239,230,.08)";
      ctx.beginPath(); ctx.moveTo(28, y(m)); ctx.lineTo(w, y(m)); ctx.stroke();
      ctx.fillStyle = "rgba(243,239,230,.35)"; ctx.fillText(noteName(m), 0, y(m) + 3);
    }
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#b98cff";
    ctx.shadowColor = "rgba(185,140,255,.6)"; ctx.shadowBlur = 8;
    ctx.beginPath();
    let pen = false;
    st.trace.forEach((m, i) => {
      const x = 28 + (i / 239) * (w - 28);
      if (isNaN(m)) { pen = false; return; }
      if (!pen) { ctx.moveTo(x, y(m)); pen = true; } else ctx.lineTo(x, y(m));
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function startRec() {
    Sound && Sound.init();
    st.rec = { t0: performance.now(), dur: STEPS[st.step].dur, vals: [] };
    el.rec.disabled = true;
    el.rec.querySelector("span").textContent = "Слушаю…";
    el.msg.textContent = "";
  }

  function finishRec() {
    const vals = st.rec.vals;
    st.rec = null;
    el.rec.disabled = false;
    el.rec.querySelector("span").textContent = "Ещё раз";
    el.prog.style.strokeDashoffset = RING;
    if (vals.length < 12) {
      el.msg.textContent = "Почти не расслышали. Подойди ближе к микрофону и тяни звук ровнее.";
      return;
    }
    if (st.step === "low") {
      st.res.L = pct(vals, 0.2);
      showYou(st.res.L);
      goStep("high");
      el.msg.textContent = `Нижняя нота: ${noteName(st.res.L)} — отлично!`;
    } else if (st.step === "high") {
      const H = pct(vals, 0.85);
      if (H < st.res.L + 3) {
        el.msg.textContent = `Получилось ${noteName(H)} — это почти как нижняя нота. Попробуй выше, смелее!`;
        return;
      }
      st.res.H = H;
      showYou(st.res.L, st.res.H);
      goStep("speak");
      el.msg.textContent = `Верхняя нота: ${noteName(H)}. Последний шаг!`;
    } else if (st.step === "speak") {
      st.res.S = midi2hz(median(vals));
      finish();
    }
  }

  /* ---------- классификация ---------- */
  function classify(L, H, Shz, sex) {
    const raw = TYPES.map((t) => {
      let cost = Math.abs(L - t.lo);
      cost += (H > t.hi ? H - t.hi : (t.hi - H) * 0.4) * 0.6;
      if (Shz) {
        // речь — слабый признак внутри пола, но хорошо отличает мужской голос от женского
        cost += Math.abs(12 * Math.log2(Shz / t.sp)) * 0.45;
        if ((t.sex === "m" && Shz > 175) || (t.sex === "f" && Shz < 140)) cost += 5;
      }
      if (sex && t.sex !== sex) cost += 8;
      return { t, s: Math.exp(-cost / 3) };
    });
    const sum = raw.reduce((a, b) => a + b.s, 0) || 1;
    return raw.map((r) => ({ ...r, p: r.s / sum })).sort((a, b) => b.p - a.p);
  }

  function semis(n) {
    const o = Math.floor(n / 12), r = n % 12;
    const ow = o === 1 ? "октава" : o >= 2 && o <= 4 ? "октавы" : "октав";
    return o ? `${o} ${ow}${r ? ` и ${r} полут.` : ""}` : `${r} полутонов`;
  }

  function finish(sex) {
    stopMic();
    const { L, H, S: Shz } = st.res;
    const res = classify(L, H, Shz, sex);
    const top = res[0].t;
    $("#vtType").textContent = top.name;
    $("#vtType").style.setProperty("--c", top.color);
    $("#vtDesc").textContent = top.desc;
    $("#vtStars").innerHTML = `<span class="mono">похожий голос у</span> <span class="hand">${top.ex}</span>`;
    $("#vtBars").innerHTML = res.map((r) => `
      <div class="vt__bar${r.t === top ? " top" : ""}" style="--c:${r.t.color}">
        <span>${r.t.name}</span><i><b style="width:0%" data-w="${(r.p * 100).toFixed(1)}"></b></i><em>${Math.round(r.p * 100)}%</em>
      </div>`).join("");
    const span = Math.round(H - L);
    $("#vtRange").textContent = `диапазон: ${noteName(L)} – ${noteName(H)} (≈ ${semis(span)})` + (Shz ? ` · речь ≈ ${Math.round(Shz)} Hz` : "");
    $$(".band", bandsEl).forEach((b) => b.classList.toggle("hit", b.dataset.id === top.id));
    showYou(L, H);
    show("result", 4);
    requestAnimationFrame(() => $$("#vtBars b").forEach((b, i) => setTimeout(() => (b.style.width = b.dataset.w + "%"), 80 * i)));
    window.SANART.voiceType = `${top.name.toLowerCase()} (${noteName(L)}–${noteName(H)})`;
    // музыкальная «фанфара» по найденному диапазону
    if (Sound && Sound.ready && Sound.ready()) [L, (L + H) / 2, H].forEach((m, i) => setTimeout(() => Sound.piano(midi2hz(Math.round(m)), 0.5), i * 160));
    if (S.string) S.string.impulse(innerWidth / 2, -30, 14);
  }

  /* ---------- ручной режим по клавишам ---------- */
  const man = { L: null, H: null };
  const picked = $("#vtPicked"), manDone = $("#vtManualDone");
  function toManual(msg) {
    stopMic();
    man.L = man.H = null; updatePicked();
    show("manual", 1);
    if (msg) picked.textContent = msg;
  }
  function updatePicked() {
    picked.textContent = `низ: ${man.L != null ? noteName(man.L) : "—"} · верх: ${man.H != null ? noteName(man.H) : "—"}`;
    manDone.disabled = !(man.L != null && man.H != null);
    showYou(man.L, man.H);
    $$(".k", kb).forEach((k) => k.classList.toggle("pick", +k.dataset.m === man.L || +k.dataset.m === man.H));
  }

  kb.addEventListener("pointerdown", (e) => {
    const k = e.target.closest(".k");
    if (!k) return;
    e.preventDefault();
    const m = +k.dataset.m;
    Sound && Sound.init();
    Sound && Sound.piano(midi2hz(m), 0.8);
    k.classList.add("down"); setTimeout(() => k.classList.remove("down"), 200);
    if (!$('[data-screen="manual"]').hidden) {
      if (man.L == null) man.L = m;
      else if (man.H == null) { if (m < man.L) { man.H = man.L; man.L = m; } else man.H = m; }
      else { // третий клик — двигаем ближайшую границу
        if (Math.abs(m - man.L) < Math.abs(m - man.H)) man.L = m; else man.H = m;
        if (man.L > man.H) [man.L, man.H] = [man.H, man.L];
      }
      updatePicked();
    }
  });

  /* ---------- кнопки ---------- */
  $("#vtStart").addEventListener("click", startMic);
  $("#vtManual").addEventListener("click", () => toManual());
  el.rec.addEventListener("click", startRec);
  el.skip.addEventListener("click", () => { st.res.S = null; finish(); });
  $("#vtManualReset").addEventListener("click", () => { man.L = man.H = null; updatePicked(); });
  manDone.addEventListener("click", () => {
    if (man.L == null || man.H == null) return;
    const sexIn = $('input[name="vtSex"]:checked');
    st.res = { L: man.L, H: man.H, S: null };
    finish(sexIn ? sexIn.value : null);
  });
  $("#vtAgain").addEventListener("click", () => {
    $$(".band", bandsEl).forEach((b) => b.classList.remove("hit"));
    showYou(null);
    show("start", 0);
  });
  $("#vtCta").addEventListener("click", () => {
    const r = document.querySelector('#form input[name="dir"][value="Вокал"]');
    if (r) r.checked = true;
  });

  /* ---------- появление при скролле ---------- */
  if (window.gsap && window.ScrollTrigger && !S.reduce) {
    gsap.from(".vt__card", { y: 120, scale: 0.94, opacity: 0, ease: "none", scrollTrigger: { trigger: ".vt", start: "top 85%", end: "top 25%", scrub: true } });
    gsap.from(".band", { scaleX: 0, transformOrigin: "left center", stagger: 0.08, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".vt__map", start: "top 90%" } });
    ScrollTrigger.refresh();
  }

  // для отладки и тестов
  window.SANART.voiceTest = { classify, detect, TYPES, noteName };
})();
