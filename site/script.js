/* ==========================================================================
   Gabrielli Costa — comportamento
   1. Preloader com vídeo de tinta (toca inteiro) e saída em tinta escorrendo
   2. Scroll suave (Lenis + ScrollTrigger) e título letra por letra
   3. Hero: vídeo controlado pelo scroll (seek por quadro)
   4. Divisórias dos acessos e tema do header
   Fallbacks: sem GSAP, sem vídeo, vídeo com erro ou prefers-reduced-motion
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

  /* Dispositivos mais fracos (celular, poucos núcleos, pouca memória, economia de dados)
     recebem uma versão mais leve dos efeitos; o visual continua o mesmo */
  const COARSE = matchMedia('(pointer: coarse)').matches;
  const LITE = COARSE
    || (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4
    || Boolean(navigator.connection && navigator.connection.saveData);

  const METADATA_TIMEOUT = 10000; // ms sem metadados do vídeo → modo estático
  const SCROLL_LERP = 0.06;       // suavidade do scroll: menor = mais pesado e lento
  const SCROLL_WHEEL = 0.55;      // velocidade da roda do mouse: menor = mais lento
  const SMOOTHING = 0.16;         // quanto o tempo exibido persegue o alvo por frame (60 fps)
  const FRAME = 1 / 30;           // o vídeo só recebe seek quando muda de quadro (30 fps)
  const SCROLL_PER_SECOND = 0.5;  // alturas de tela de scroll por segundo de vídeo
  const MIN_SCROLL_SCREENS = 3;
  const MAX_SCROLL_SCREENS = 7;

  /* Preloader */
  const PRELOADER_RATE = 1.6;       // velocidade do vídeo: 1 = original (7,9 s); 1.6 ≈ 5 s
  const PRELOADER_MAX_WAIT = 14000; // segurança: nunca ficar preso se o vídeo não terminar
  const POUR_LEAD = 1.5;            // s (do vídeo) antes do fim em que a tinta já começa a descer
  const POUR_DURATION = 1.5;        // s — descida da tinta que revela a hero
  const POUR_TITLE_DELAY = 900;     // ms — o título entra enquanto a tinta desce

  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Modo estático (fallback) ---------- */
  function enterStaticMode(reason) {
    hero.classList.add('is-static');
    root.classList.remove('is-loading', 'is-locked');
    $('.preloader')?.remove();
    if (reason) console.info('[hero] modo estático:', reason);
  }

  /* ---------- Vídeo: versão leve no celular ---------- */
  function pickVideoSource() {
    const alt = video.dataset.srcMobile;
    if (alt && matchMedia('(max-width: 768px)').matches) { video.src = alt; video.load(); }
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

  /* ---------- Preloader: o vídeo toca quase inteiro; depois a tinta continua escorrendo ---------- */
  async function runPreloader(ready, skip) {
    const pre = $('.preloader');
    if (!pre) return;
    if (skip) { pre.remove(); return; }

    const vid = $('.preloader__video', pre);
    const logoWrap = $('.preloader__logo', pre);

    /* Máscara da tinta preparada desde o início (totalmente opaca): na saída não há nada a criar,
       então não há engasgo entre a entrada e a saída da logo */
    const H = pre.offsetHeight;
    pre.style.setProperty('--my', (-1.4 * H) + 'px'); // tinta cobrindo a tela inteira
    pre.classList.add('is-pouring');

    /* Libera a saída perto do fim do vídeo (ou quando ele termina, falha ou estoura o limite) */
    const videoDone = vid ? new Promise((r) => {
      vid.addEventListener('timeupdate', () => {
        if (vid.duration && vid.currentTime >= vid.duration - POUR_LEAD) r();
      });
      vid.addEventListener('ended', r, { once: true });
      vid.addEventListener('error', r, { once: true });
      setTimeout(r, PRELOADER_MAX_WAIT);
    }) : Promise.resolve();

    if (vid) {
      vid.playbackRate = PRELOADER_RATE;
      const p = vid.play();
      if (p && p.catch) p.catch(() => {});
    }

    /* A logo é centralizada por transform no CSS; o GSAP anima só opacidade e escala sobre ele */
    gsap.set(logoWrap, { xPercent: -50, yPercent: -50, left: '50%', top: '50%', x: 0, y: 0 });
    gsap.fromTo(logoWrap, { opacity: 0, scale: 0.92 },
      { opacity: 1, scale: 1, duration: 1.5, delay: 0.25, ease: 'expo.out' });

    await Promise.all([ready, videoDone]);

    /* Saída: a tinta continua escorrendo para baixo e revela a hero.
       A máscara com a borda em dedos de tinta desce junto. */
    gsap.killTweensOf(logoWrap); // evita dois tweens disputando a mesma logo
    const tl = gsap.timeline({ onComplete: () => pre.remove() });
    tl.to(logoWrap, { opacity: 0, scale: 1.04, duration: 0.5, ease: 'power2.in' }, 0)
      .to(pre, { '--my': (0.6 * H) + 'px', duration: POUR_DURATION, ease: 'power2.in' }, 0.3);

    await new Promise((r) => setTimeout(r, POUR_TITLE_DELAY)); // o título entra enquanto a tinta desce
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

  /* ---------- Hero: scrub real por currentTime ---------- */
  function initHeroScrub() {
    const duration = video.duration;
    const maxTime = Math.max(duration - 0.05, 0);

    const scrollLength = () => Math.round(
      window.innerHeight * gsap.utils.clamp(MIN_SCROLL_SCREENS, MAX_SCROLL_SCREENS, duration * SCROLL_PER_SECOND)
    );
    const end = () => '+=' + scrollLength();

    console.info('[hero] vídeo carregado:', {
      duração: duration.toFixed(2) + ' s',
      resolução: video.videoWidth + '×' + video.videoHeight,
      distânciaDeScroll: scrollLength() + ' px'
    });

    video.pause();
    video.addEventListener('play', () => video.pause());
    video.currentTime = 0;
    video.addEventListener('seeked', () => hero.classList.add('has-video'), { once: true });
    if (video.readyState >= 2) hero.classList.add('has-video');

    /* iOS/Safari só libera seeks fluidos depois de uma interação com o vídeo */
    window.addEventListener('touchstart', () => {
      const p = video.play();
      if (p && typeof p.then === 'function') p.then(() => video.pause()).catch(() => {});
    }, { once: true, passive: true });

    /* O alvo vem do scroll; o tempo exibido persegue o alvo e só dispara seek quando muda de quadro.
       fastSeek só é preciso com o vídeo exportado com -g 1 (todos os quadros são keyframes). */
    let target = 0;
    let shown = 0;

    gsap.ticker.add(() => {
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
        scrub: 0.6,
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

    /* Zoom lento no vídeo: só em aparelhos potentes, é a camada mais pesada da hero */
    if (!LITE) tl.fromTo(video, { scale: 1 }, { scale: 1.07, duration: 1 }, 0);

    video.addEventListener('error', () => {
      hero.classList.add('is-static');
      ScrollTrigger.refresh();
    }, { once: true });
  }

  /* ---------- Entrada do título: letra por letra ---------- */
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
      .to(chars, { yPercent: 0, rotate: 0, duration: LITE ? 1.3 : 1.6, stagger: LITE ? 0.035 : 0.05 }, 0)
      .to(leadText, { opacity: 1, y: 0, duration: 1.2 }, 0.7)
      .to(header, { autoAlpha: 1, duration: 1, ease: 'power1.out' }, 0.9);
  }

  /* ---------- Acessos e header ---------- */
  function initPaths() {
    $$('.path').forEach((item) => {
      gsap.fromTo(item, { '--draw': 0 }, {
        '--draw': 1, duration: 1.4, ease: 'expo.out',
        scrollTrigger: { trigger: item, start: 'top 90%', once: true }
      });
      /* Título e nota sobem suavemente; clearProps devolve o controle do hover ao CSS */
      gsap.from([$('.path__title', item), $('.path__note', item)], {
        y: LITE ? 20 : 36, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: item, start: 'top 88%', once: true }
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
    console.warn('[gsap] assets/vendor não encontrado; tentando o CDN. Verifique se a pasta assets/ está ao lado do index.html.');
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

    pickVideoSource();
    const metaP = waitForVideoMetadata();
    metaP.catch(() => {});

    /* Pronto = fontes + metadados da hero + vídeo do preloader (com limite, para nunca ficar preso) */
    const pv = $('.preloader__video');
    const pvReady = pv ? new Promise((r) => {
      if (pv.readyState >= 3) return r();
      pv.addEventListener('canplay', r, { once: true });
      pv.addEventListener('error', r, { once: true });
    }) : null;

    const ready = Promise.race([
      Promise.all([document.fonts ? document.fonts.ready : null, metaP.catch(() => {}), pvReady]),
      new Promise((r) => setTimeout(r, 4500))
    ]);
    await runPreloader(ready, reduceMotion.matches);
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

    try { await metaP; initHeroScrub(); } catch (err) { enterStaticMode(err.message); }
    ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();