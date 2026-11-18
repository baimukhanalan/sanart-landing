/* =========================================================
   SANART — колода кейсов и круг команды
   ========================================================= */
(() => {
  "use strict";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const S = window.SANART || {};
  const reduce = !!S.reduce;

  /* ---------- КОЛОДА КЕЙСОВ ---------- */
  const deck = $("#deck");
  if (deck) {
    const cards = $$(".case", deck);
    const N = cards.length;
    let order = cards.map((_, i) => i);
    const countEl = $("#deckCount"), srcEl = $("#deckSrc");
    const pad = (n) => String(n).padStart(2, "0");

    function layout(dragX = 0) {
      order.forEach((ci, pos) => {
        const c = cards[ci];
        c.style.zIndex = N - pos;
        c.classList.toggle("top", pos === 0);
        if (pos === 0) {
          c.style.transform = `translate(calc(-50% + ${dragX}px), -50%) rotate(${dragX * 0.05}deg)`;
          c.style.opacity = 1;
        } else {
          const k = Math.min(pos, 4);
          const side = pos % 2 ? 1 : -1;
          c.style.transform = `translate(calc(-50% + ${side * k * 14}px), calc(-50% + ${k * 10}px)) rotate(${side * k * 2.4}deg) scale(${1 - k * 0.045})`;
          c.style.opacity = pos > 4 ? 0 : 1 - k * 0.12;
        }
      });
      const cur = order[0];
      countEl.textContent = `${pad(cur + 1)} / ${pad(N)}`;
      srcEl.href = cards[cur].dataset.src;
      srcEl.textContent = cards[cur].dataset.src.includes("2gis") ? "отзыв в 2ГИС ↗" : "пост в Instagram ↗";
    }

    function next(dir = 1) {
      const top = cards[order[0]];
      const tick = S.Sound && S.Sound.ready && S.Sound.ready();
      if (dir > 0) {
        top.classList.add("fly");
        top.style.transform = `translate(calc(-50% + ${innerWidth * 0.7}px), -50%) rotate(28deg)`;
        top.style.opacity = 0;
        setTimeout(() => { top.classList.remove("fly"); order.push(order.shift()); layout(); }, reduce ? 0 : 380);
      } else {
        order.unshift(order.pop());
        layout();
      }
      if (tick) S.Sound.pluck(S.Sound.hz(dir > 0 ? 64 : 59), 0.5);
      if (S.string) S.string.impulse(innerWidth * (dir > 0 ? 0.65 : 0.35), -12, 8);
    }

    // перетаскивание верхней карточки
    let sx = 0, dx = 0, drag = false;
    deck.addEventListener("pointerdown", (e) => {
      const top = cards[order[0]];
      if (!top.contains(e.target)) return;
      drag = true; sx = e.clientX; dx = 0;
      top.classList.add("drag");
      deck.setPointerCapture(e.pointerId);
    });
    deck.addEventListener("pointermove", (e) => { if (!drag) return; dx = e.clientX - sx; layout(dx); });
    const end = () => {
      if (!drag) return;
      drag = false;
      cards[order[0]].classList.remove("drag");
      if (Math.abs(dx) > 90) {
        if (dx > 0) next(1);
        else { // влево — тоже «выбросить», но в другую сторону
          const top = cards[order[0]];
          top.classList.add("fly");
          top.style.transform = `translate(calc(-50% - ${innerWidth * 0.7}px), -50%) rotate(-28deg)`;
          top.style.opacity = 0;
          setTimeout(() => { top.classList.remove("fly"); order.push(order.shift()); layout(); }, reduce ? 0 : 380);
        }
      } else layout();
    };
    deck.addEventListener("pointerup", end);
    deck.addEventListener("pointercancel", end);

    $("#deckNext").addEventListener("click", () => next(1));
    $("#deckPrev").addEventListener("click", () => next(-1));
    deck.tabIndex = 0;
    deck.setAttribute("aria-label", "Колода кейсов, стрелки влево и вправо — листать");
    deck.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); next(-1); }
    });
    $$("img", deck).forEach((im) => im.addEventListener("dragstart", (e) => e.preventDefault()));
    layout();

    if (window.gsap && window.ScrollTrigger && !reduce) {
      gsap.from(deck, { y: 100, rotate: -4, opacity: 0, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: deck, start: "top 92%" } });
    }
  }

  /* ---------- КРУГ КОМАНДЫ ---------- */
  const dial = $("#dial");
  if (dial) {
    const people = $$(".person", dial);
    const nameEl = $("#dialName"), roleEl = $("#dialRole"), aboutEl = $("#dialAbout"), center = $("#dialCenter");
    people.forEach((p, i) => p.style.setProperty("--a", (i * 360) / people.length + "deg"));
    let active = people[0];
    active.classList.add("on");

    function pick(p) {
      if (p === active) return;
      active.classList.remove("on");
      active = p; p.classList.add("on");
      const swap = () => {
        nameEl.textContent = p.dataset.name;
        roleEl.textContent = p.dataset.role;
        aboutEl.textContent = p.dataset.about;
        center.style.setProperty("--photo", p.dataset.img ? `url("${new URL(p.dataset.img, location.href).href}")` : "none");
        center.classList.toggle("has-img", !!p.dataset.img);
      };
      if (reduce) { swap(); return; }
      center.animate([{ opacity: 1, transform: "translate(-50%,-50%) scale(1)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(.94)" }], { duration: 160, easing: "ease-in" }).onfinish = () => {
        swap();
        center.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(1.04)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
      };
      if (S.Sound && S.Sound.ready && S.Sound.ready()) S.Sound.glass(S.Sound.hz([60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86][people.indexOf(p)] || 72));
    }
    people.forEach((p) => {
      p.addEventListener("pointerenter", () => pick(p));
      p.addEventListener("focus", () => pick(p));
      p.addEventListener("click", () => pick(p));
    });

    if (window.gsap && window.ScrollTrigger && !reduce) {
      gsap.fromTo(dial, { "--rot": "-60deg" }, { "--rot": "60deg", ease: "none", scrollTrigger: { trigger: ".team", start: "top bottom", end: "bottom top", scrub: 1 } });
      gsap.from(people, { "--s": 0, opacity: 0, stagger: 0.04, duration: 0.8, ease: "back.out(2)", scrollTrigger: { trigger: dial, start: "top 88%" } });
      ScrollTrigger.refresh();
    }
  }
})();
