/* ==========================================================================
   Gabrielli Costa — comportamento (revisão mobile)
   1. Preloader com vídeo de tinta e saída em tinta escorrendo
   2. Scroll suave (Lenis no desktop) + título letra por letra
   3. Hero: vídeo controlado pelo scroll (seek por quadro)
   4. Divisórias dos acessos e tema do header
   Fallbacks: sem GSAP, sem vídeo, autoplay bloqueado, economia de dados,
   prefers-reduced-motion.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const hero = $('.hero');
  const video = $('.hero__video');
  const header = $('.site-header');
  const footer = $('.site-footer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Detecção de aparelho */
  const COARSE = matchMedia('(pointer: coarse)').matches;
  const SMALL = matchMedia('(max-width: 768px)').matches;
  const SAVE_DATA = Boolean(navigator.connection && navigator.connection.saveData);
  const LITE = COARSE || SMALL || SAVE_DATA
    || (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4;
  const MOBILE = COARSE || SMALL;

  const METADATA_TIMEOUT = MOBILE ? 15000 : 10000; // redes móveis são mais lentas
  const SCROLL_LERP = 0.06;
  const SCROLL_WHEEL = 0.55;
  const SMOOTHING = MOBILE ? 0.24 : 0.16;          // no toque o vídeo acompanha o dedo mais de perto
  const FRAME = MOBILE ? 1 / 24 : 1 / 30;          // menos seeks por segundo no celular
  const SCROLL_PER_SECOND = MOBILE ? 0.38 : 0.5;   // trecho de scroll mais curto no celular
  const MIN_SCROLL_SCREENS = MOBILE ? 2.5 : 3;
  const MAX_SCROLL_SCREENS = MOBILE ? 5 : 7;
  const SCRUB = MOBILE ? 0.3 : 0.6;

  /* Preloader */
  const PRELOADER_RATE = MOBILE ? 2 : 1.6;
  const PRELOADER_MAX_WAIT = MOBILE ? 8000 : 14000;
  const PRELOADER_START_WAIT = 2500; // sem começar a tocar em 2,5 s (autoplay bloqueado) → segue
  const POUR_LEAD = 1.5;
  const POUR_DURATION = MOBILE ? 1.2 : 1.5;
  const POUR_TITLE_DELAY = 900;

  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Modo estático (fallback) ---------- */
  function enterStaticMode(reason) {
    hero.classList.add('is-static');
    root.classList.remove('is-loading', 'is-locked');
    $('.preloader')?.remove();
    if (reason) console.info('[hero] modo estático:', reason);
  }

  /* ---------- Vídeo: versão leve no celular + economia de dados ---------- */
  function pickVideoSource() {
    if (SAVE_DATA) video.preload = 'metadata';
    const alt = video.dataset.srcMobile;
    if (alt && SMALL) { video.src = alt; video.load(); }
  }

  /* ---------- Vídeo: aguarda metadados ou falha ---------- */
  function waitForVideoMetadata() {
    return new Promise((resolve, reject) => {
      const source = $('source', video);
      let settled = false;
      let timer;

      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', check);
        video.removeEventListener('error', fail);
        if (source) source.removeEventListener('error', fail);
      };
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      function check() {
        if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) {
          finish(resolve);
        }
      }
      function fail() { finish(reject, new Error('o arquivo do vídeo não pôde ser carregado')); }

      video.addEventListener('loadedmetadata', check);
      video.addEventListener('error', fail);
      if (source) source.addEventListener('error', fail);
      if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) { fail(); return; }
      timer = setTimeout(() => finish(reject, new Error('tempo esgotado ao carregar os metadados do vídeo')), METADATA_TIMEOUT);
      check();
    });
  }

  /* ---------- Preloader ---------- */
  async function runPreloader(ready, skip) {
    const pre = $('.preloader');
    if (!pre) return;
    if (skip) { pre.remove(); return; }

    const vid = $('.preloader__video', pre);
    const logoWrap = $('.preloader__logo', pre);

    const H = pre.offsetHeight;
    pre.style.setProperty('--my', (-1.4 * H) + 'px');
    pre.classList.add('is-pouring');

    /* Libera a saída perto do fim do vídeo, ou se ele terminar, falhar, não começar
       (iOS em economia de bateria bloqueia autoplay) ou estourar o limite */
    const videoDone = vid ? new Promise((r) => {
      let started = false;
      vid.addEventListener('playing', () => { started = true; }, { once: true });
      vid.addEventListener('timeupdate', () => {
        if (vid.duration && vid.currentTime >= vid.duration - POUR_LEAD) r();
      });
      vid.addEventListener('ended', r, { once: true });
      vid.addEventListener('error', r, { once: true });
      setTimeout(() => { if (!started) r(); }, PRELOADER_START_WAIT);
      setTimeout(r, PRELOADER_MAX_WAIT);
    }) : Promise.resolve();

    if (vid) {
      vid.playbackRate = PRELOADER_RATE;
      const p = vid.play();
      if (p && p.catch) p.catch(() => {});
    }

    gsap.set(logoWrap, { xPercent: -50, yPercent: -50, left: '50%', top: '50%', x: 0, y: 0 });
    gsap.fromTo(logoWrap, { opacity: 0, scale: 0.92 },
      { opacity: 1, scale: 1, duration: 1.5, delay: 0.25, ease: 'expo.out' });

    await Promise.all([ready, videoDone]);

    gsap.killTweensOf(logoWrap);
    const tl = gsap.timeline({ onComplete: () => pre.remove() });
    tl.to(logoWrap, { opacity: 0, scale: 1.04, duration: 0.5, ease: 'power2.in' }, 0)
      .to(pre, { '--my': (0.6 * H) + 'px', duration: POUR_DURATION, ease: 'power2.in' }, 0.3);

    await new Promise((r) => setTimeout(r, POUR_TITLE_DELAY));
  }

  /* ---------- Scroll suave ---------- */
  function initSmoothScroll() {
    if (!window.Lenis || COARSE) {
      /* Toque: o scroll nativo já é fluido; só suavizamos as âncoras */
      $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const el = id.length > 1 ? $(id) : null;
        if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
      }));
      return;
    }
    const lenis = new Lenis({ lerp: SCROLL_LERP, wheelMultiplier: SCROLL_WHEEL });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length > 1 && $(id)) { e.preventDefault(); lenis.scrollTo(id, { duration: 1.6 }); }
    }));
  }

  function splitChars(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    return [...text].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = c;
      el.appendChild(s);
      return s;
    });
  }

  /* ---------- Hero: scrub por currentTime ---------- */
  function initHeroScrub() {
    const duration = video.duration;
    const maxTime = Math.max(duration - 0.05, 0);

    /* hero.offsetHeight (100svh) não oscila com a barra de endereço do celular */
    const viewH = () => hero.offsetHeight || window.innerHeight;
    const scrollLength = () => Math.round(
      viewH() * gsap.utils.clamp(MIN_SCROLL_SCREENS, MAX_SCROLL_SCREENS, duration * SCROLL_PER_SECOND)
    );
    const end = () => '+=' + scrollLength();

    video.pause();
    video.addEventListener('play', () => video.pause());
    video.currentTime = 0;
    video.addEventListener('seeked', () => hero.classList.add('has-video'), { once: true });
    if (video.readyState >= 2) hero.classList.add('has-video');

    /* iOS/Safari só libera seeks fluidos depois de uma interação com o vídeo */
    const unlock = () => {
      const p = video.play();
      if (p && typeof p.then === 'function') p.then(() => video.pause()).catch(() => {});
    };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });

    let target = 0;
    let shown = 0;
    let visible = true;

    /* Fora da hero (ou aba oculta) não há por que fazer seek */
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

    gsap.ticker.add(() => {
      if (!visible) return;
      const k = 1 - Math.pow(1 - SMOOTHING, gsap.ticker.deltaRatio());
      shown += (target - shown) * k;
      if (video.seeking) return;
      const t = Math.round(shown / FRAME) * FRAME;
      if (Math.abs(video.currentTime - t) < FRAME) return;
      if (video.fastSeek) video.fastSeek(t); else video.currentTime = t;
    });

    const lines = $$('.hero__line');
    const spark = $('.hero__cue-spark');
    const track = $('.hero__cue-track');

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end,
        pin: true,
        anticipatePin: 1,
        scrub: SCRUB,
        invalidateOnRefresh: true,
        onUpdate: (self) => { target = self.progress * maxTime; }
      }
    })
      .to($('.hero__lead'), { autoAlpha: 0, duration: 0.08 }, 0)
      .to($('.hero__cue-text'), { autoAlpha: 0, duration: 0.08 }, 0)
      .to(spark, { y: () => track.clientHeight, duration: 1 }, 0)
      .to(lines[0], { xPercent: -9, autoAlpha: 0, duration: 0.34, ease: 'power1.in' }, 0.06)
      .to(lines[1], { xPercent: 9, autoAlpha: 0, duration: 0.34, ease: 'power1.in' }, 0.06)
      .to($('.hero__tint'), { opacity: 0.2, duration: 0.3 }, 0.12)
      .to($('.hero__vignette'), { opacity: 0.45, duration: 0.3 }, 0.12)
      .fromTo($('.hero__closing'), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.8)
      .to($('.hero__tint'), { opacity: 1, duration: 0.1, ease: 'power1.in' }, 0.9)
      .to($('.hero__cue'), { autoAlpha: 0, duration: 0.06 }, 0.94);

    /* Zoom lento: só em aparelhos potentes */
    if (!LITE) tl.fromTo(video, { scale: 1 }, { scale: 1.07, duration: 1 }, 0);

    video.addEventListener('error', () => {
      hero.classList.add('is-static');
      ScrollTrigger.refresh();
    }, { once: true });
  }

  /* ---------- Entrada do título ---------- */
  function playIntro() {
    const inners = $$('.hero__line-inner');
    const chars = inners.flatMap(splitChars);
    const leadText = $('.hero__lead > span');

    gsap.set(inners, { opacity: 1 });
    gsap.set(chars, { yPercent: 120, rotate: 7, transformOrigin: '0 100%' });
    gsap.set(leadText, { opacity: 0, y: 14 });
    gsap.set(header, { autoAlpha: 0 });
    root.classList.remove('is-loading');

    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .to(chars, { yPercent: 0, rotate: 0, duration: LITE ? 1.2 : 1.6, stagger: LITE ? 0.03 : 0.05 }, 0)
      .to(leadText, { opacity: 1, y: 0, duration: 1.2 }, LITE ? 0.5 : 0.7)
      .to(header, { autoAlpha: 1, duration: 1, ease: 'power1.out' }, LITE ? 0.6 : 0.9);
  }

  /* ---------- Acessos e header ---------- */
  function initPaths() {
    $$('.path').forEach((item) => {
      gsap.fromTo(item, { '--draw': 0 }, {
        '--draw': 1, duration: 1.4, ease: 'expo.out',
        scrollTrigger: { trigger: item, start: 'top 90%', once: true }
      });
      gsap.from([$('.path__title', item), $('.path__note', item)], {
        y: LITE ? 20 : 36, opacity: 0, duration: LITE ? 1 : 1.3, ease: 'expo.out', stagger: 0.08,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: item, start: 'top 92%', once: true }
      });
    });
  }

  function initHeaderTheme() {
    ScrollTrigger.create({
      trigger: footer,
      start: () => 'top ' + header.offsetHeight / 2,
      end: 'bottom top',
      toggleClass: { targets: header, className: 'is-on-light' }
    });
  }

  /* Girar o celular muda a altura da hero: recalcula o pin e a distância do scroll */
  function initOrientation() {
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => ScrollTrigger.refresh(), 350);
    };
    window.addEventListener('orientationchange', refresh);
    if (screen.orientation) screen.orientation.addEventListener('change', refresh);
    /* Fontes e imagens que chegam tarde mudam a altura da página */
    window.addEventListener('load', () => setTimeout(() => ScrollTrigger.refresh(), 200), { once: true });
  }

  /* ---------- Inicialização ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('falha ao carregar ' + src));
      document.head.appendChild(el);
    });
  }
  async function ensureGsap() {
    if (window.gsap && window.ScrollTrigger) return true;
    console.warn('[gsap] assets/vendor não encontrado; tentando o CDN.');
    try {
      if (!window.gsap) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js');
      if (!window.ScrollTrigger) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js');
    } catch (err) { console.warn('[gsap]', err.message); }
    return Boolean(window.gsap && window.ScrollTrigger);
  }

  async function init() {
    if (!(await ensureGsap())) { enterStaticMode('GSAP ou ScrollTrigger não carregaram'); return; }
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    if (MOBILE) ScrollTrigger.normalizeScroll(false);

    pickVideoSource();
    const metaP = waitForVideoMetadata();
    metaP.catch(() => {});

    const pv = $('.preloader__video');
    const pvReady = pv ? new Promise((r) => {
      if (pv.readyState >= 3) return r();
      pv.addEventListener('canplay', r, { once: true });
      pv.addEventListener('error', r, { once: true });
    }) : null;

    const ready = Promise.race([
      Promise.all([document.fonts ? document.fonts.ready : null, metaP.catch(() => {}), pvReady]),
      new Promise((r) => setTimeout(r, MOBILE ? 3500 : 4500))
    ]);

    /* Economia de dados: pula o vídeo do preloader (não baixa nem toca) */
    if (SAVE_DATA && pv) { pv.removeAttribute('autoplay'); pv.preload = 'none'; }
    await runPreloader(ready, reduceMotion.matches || SAVE_DATA);
    root.classList.remove('is-locked');

    if (reduceMotion.matches) {
      enterStaticMode('prefers-reduced-motion');
      gsap.set(header, { clearProps: 'all' });
      try {
        await metaP;
        video.currentTime = Math.min(video.duration * 0.35, Math.max(video.duration - 0.1, 0));
        video.addEventListener('seeked', () => hero.classList.add('has-video'), { once: true });
      } catch (err) { /* sem vídeo: o fundo vinho é o fallback */ }
      initHeaderTheme();
      return;
    }

    initSmoothScroll();
    playIntro();
    initPaths();
    initHeaderTheme();
    initOrientation();

    try { await metaP; initHeroScrub(); } catch (err) { enterStaticMode(err.message); }
    ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();