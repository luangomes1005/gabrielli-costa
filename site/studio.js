/* Conheça nosso studio — comportamento: vídeo da hero no scroll, carrossel do portfólio no scroll,
   revelações, parallax, comparador, tema e vaivém do header */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const header = $('.site-header');

  const SCROLL_LERP = 0.06;   // suavidade do scroll: menor = mais pesado e lento
  const SCROLL_WHEEL = 0.55;  // velocidade da roda do mouse: menor = mais lento
  const HERO_SCROLL = 250;    // % da altura da tela que o scroll da hero dura (maior = vídeo mais lento)
  const PF_SCRUB = 0.8;       // suavidade do carrossel (maior = mais "arrastado")

  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Comparador antes/depois (não depende de GSAP) ---------- */
  const cmp = $('.cmp');
  if (cmp) {
    const range = $('.cmp__range', cmp);
    const set = () => cmp.style.setProperty('--pos', range.value + '%');
    range.addEventListener('input', set);
    set();
  }

  /* ---------- Header: cor escura sobre seções claras (sem GSAP) ---------- */
  const lightSections = $$('.st-sec--blush, .site-footer');
  let themeObserver = null;
  function watchHeaderTheme() {
    if (themeObserver) themeObserver.disconnect();
    const mid = Math.round(header.offsetHeight / 2);
    const active = new Set();
    themeObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? active.add(e.target) : active.delete(e.target)));
      header.classList.toggle('is-on-light', active.size > 0);
    }, { rootMargin: `-${mid}px 0px -${Math.max(window.innerHeight - mid - 1, 0)}px 0px` });
    lightSections.forEach((s) => themeObserver.observe(s));
  }
  watchHeaderTheme();
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(watchHeaderTheme, 200); });

  /* ---------- Header: some ao rolar para baixo, volta ao rolar para cima ---------- */
  let anchorY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (y < 120) { header.classList.remove('is-hidden'); anchorY = y; return; }
    if (y > anchorY + 12) { header.classList.add('is-hidden'); anchorY = y; }
    else if (y < anchorY - 12) { header.classList.remove('is-hidden'); anchorY = y; }
  }, { passive: true });

  /* ---------- Sem GSAP ou com movimento reduzido: tudo visível, sem animação ---------- */
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger);
  let lenis = null;

  if (hasGsap && !reduce) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    /* Scroll suave (só com mouse; no toque o scroll nativo já é fluido) */
    if (window.Lenis && !coarse) {
      lenis = new Lenis({ lerp: SCROLL_LERP, wheelMultiplier: SCROLL_WHEEL });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    /* Entrada da hero: o nome sobe linha a linha, o resto aparece depois */
    const inners = $$('.st-title__in');
    gsap.set(inners, { yPercent: 115, visibility: 'visible' });
    gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.2 })
      .to(inners, { yPercent: 0, duration: 1.8, stagger: 0.12 }, 0)
      .to('[data-in]', { opacity: 1, duration: 1.4, stagger: 0.15 }, 0.5);

    /* ---------- HERO: o vídeo anda junto com o scroll (e volta quando o scroll volta) ----------
       A hero fica fixa (pin) enquanto o progresso do scroll vira o tempo do vídeo. */
    const hero = $('.st-hero');
    const video = $('.st-hero__video');
    if (hero && video) {
      video.loop = false;
      video.removeAttribute('autoplay');
      video.muted = true;
      // "destrava" o vídeo no iOS/Safari e já deixa o primeiro quadro pronto
      const unlock = video.play();
      if (unlock && unlock.then) unlock.then(() => video.pause()).catch(() => {});
      video.pause();

      const state = { p: 0 };
      gsap.to(state, {
        p: 1, ease: 'none',
        onUpdate() {
          const d = video.duration;
          if (!isFinite(d) || !d) return;
          const t = Math.min(state.p * d, d - 0.05);
          if (Math.abs(video.currentTime - t) > 0.03) video.currentTime = t;
        },
        scrollTrigger: {
          trigger: hero, start: 'top top', end: `+=${HERO_SCROLL}%`,
          pin: true, scrub: 0.6, anticipatePin: 1
        }
      });

      /* o convite para rolar some assim que a pessoa começa */
      gsap.to('.st-cue', {
        opacity: 0, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: '+=15%', scrub: true }
      });
    }

    /* ---------- PORTFÓLIO: carrossel horizontal conduzido pelo scroll ----------
       A seção fica fixa e o scroll vertical empurra a fila de fotos para o lado. */
    const pf = $('#portfolio');
    const track = pf && $('.gallery', pf);
    if (pf && track) {
      root.classList.add('pf-on');

      const bar = document.createElement('div');
      bar.className = 'pf-bar';
      bar.setAttribute('aria-hidden', 'true');
      bar.innerHTML = '<i></i>';
      pf.appendChild(bar);
      const fill = $('i', bar);

      const dist = () => {
        const pad = parseFloat(getComputedStyle(pf).paddingLeft) || 0;
        return Math.max(track.scrollWidth - (pf.clientWidth - pad * 2), 0);
      };

      gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: pf, start: 'top top', end: () => `+=${dist()}`,
          pin: true, scrub: PF_SCRUB, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (self) => { fill.style.transform = `scaleX(${self.progress})`; }
        }
      });
    }

    /* Revelações ao rolar. As fotos do carrossel ficam de fora: já nascem visíveis. */
    $$('.gallery [data-reveal]').forEach((el) => el.classList.add('is-in'));
    const items = $$('[data-reveal]').filter((el) => !el.closest('.gallery'));
    gsap.set(items, { y: 36 });
    ScrollTrigger.batch(items, {
      start: 'top 90%', once: true,
      onEnter: (els) => gsap.to(els, {
        opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08,
        onComplete: () => els.forEach((el) => {
          el.classList.add('is-in');
          gsap.set(el, { clearProps: 'opacity,transform' });
        })
      })
    });

    /* Parallax sutil nas fotos (desligado no toque, por desempenho) */
    if (!coarse) {
      $$('.about__img, .st-cta').forEach((frame) => {
        const img = $('img', frame);
        if (!img) return;
        gsap.fromTo(img, { yPercent: -5 }, {
          yPercent: 5, ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });
    }

    /* Medidas mudam quando fontes, imagens e o vídeo terminam de carregar */
    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
    addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    root.classList.remove('js'); // garante o conteúdo visível se o GSAP não carregou
  }

  /* ---------- Âncoras ---------- */
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id.length > 1 ? $(id) : null;
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));
})();