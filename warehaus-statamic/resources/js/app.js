import './bootstrap';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
    initStickyHeader();
    initMobileMenu();
    initDesktopDropdowns();
    initFadeInOnScroll();
    initParallaxBackgrounds();
    initHoverImages();
    initLottieAnimations();
    initRotatingWords();
    sizeCdWordsWrappers();
    initRecentProjectsCarousel();
});

/**
 * Recent Projects carousel — paginates through the card list on desktop,
 * scrolls natively on mobile. Mirrors warehausae.com's "1 / 96" carousel.
 */
function initRecentProjectsCarousel() {
    document.querySelectorAll('[data-haus-recent-carousel]').forEach((root) => {
        const track = root.querySelector('[data-haus-carousel-track]');
        const items = [...root.querySelectorAll('[data-haus-carousel-card]')];
        const prev = root.querySelector('[data-haus-carousel-prev]');
        const next = root.querySelector('[data-haus-carousel-next]');
        const currentEl = root.parentElement.querySelector('[data-haus-carousel-current]');
        const totalEl = root.parentElement.querySelector('[data-haus-carousel-total]');
        if (!track || !items.length) return;

        if (totalEl) totalEl.textContent = items.length;

        // How many cards fit in the viewport — read from a sample card width.
        const cardsPerView = () => {
            const viewWidth = track.clientWidth;
            const cardWidth = items[0].getBoundingClientRect().width;
            return Math.max(1, Math.round(viewWidth / (cardWidth + 24)));
        };

        // Index of the leftmost visible card.
        let index = 0;
        const update = () => {
            const perView = cardsPerView();
            const max = Math.max(0, items.length - perView);
            if (index < 0) index = 0;
            if (index > max) index = max;
            const target = items[index];
            if (target) {
                track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
            }
            if (currentEl) currentEl.textContent = index + 1;
            if (prev) prev.disabled = index <= 0;
            if (next) next.disabled = index >= max;
        };

        prev?.addEventListener('click', () => { index -= cardsPerView(); update(); });
        next?.addEventListener('click', () => { index += cardsPerView(); update(); });

        // On native scroll (mobile), sync the counter to the leftmost visible card.
        let scrollTimer;
        track.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const scrollLeft = track.scrollLeft;
                let closest = 0;
                let closestDist = Infinity;
                items.forEach((el, i) => {
                    const dist = Math.abs(el.offsetLeft - track.offsetLeft - scrollLeft);
                    if (dist < closestDist) { closestDist = dist; closest = i; }
                });
                index = closest;
                if (currentEl) currentEl.textContent = index + 1;
            }, 100);
        }, { passive: true });

        update();
        // Re-sync on resize.
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(update, 150);
        });
    });
}

/**
 * "We listen. We design. We deliver." word rotator on the watermark hero.
 * Cycles is-visible across the <b> children every 2400ms (matches live).
 */
function initRotatingWords() {
    const wrappers = document.querySelectorAll('[data-haus-cd-words]');
    if (!wrappers.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    wrappers.forEach((wrapper) => {
        const words = [...wrapper.querySelectorAll('b')];
        if (words.length < 2) return;
        let i = words.findIndex(b => b.classList.contains('is-visible'));
        if (i < 0) i = 0;
        setInterval(() => {
            words[i].classList.remove('is-visible');
            i = (i + 1) % words.length;
            words[i].classList.add('is-visible');
        }, 2400);
    });
}

/**
 * Size each .cd-words-wrapper to the width of its widest <b> so the layout
 * doesn't jump as words rotate. Matches live's fixed-width behavior.
 */
function sizeCdWordsWrappers() {
    document.querySelectorAll('[data-haus-cd-words]').forEach((wrapper) => {
        let maxW = 0;
        wrapper.querySelectorAll('b').forEach((b) => {
            const prev = b.style.cssText;
            b.style.position = 'relative';
            b.style.opacity = '1';
            const w = b.getBoundingClientRect().width;
            if (w > maxW) maxW = w;
            b.style.cssText = prev;
        });
        if (maxW > 0) wrapper.style.width = `${Math.ceil(maxW)}px`;
    });
}

/**
 * Desktop nav dropdowns. Click or hover opens; click outside or Escape closes.
 */
function initDesktopDropdowns() {
    const dropdowns = document.querySelectorAll('[data-haus-dropdown]');
    if (!dropdowns.length) return;

    const closeAll = () => dropdowns.forEach((d) => {
        const menu = d.querySelector('[data-haus-dropdown-menu]');
        const trigger = d.querySelector('[data-haus-dropdown-trigger]');
        menu?.classList.add('hidden');
        trigger?.setAttribute('aria-expanded', 'false');
    });

    dropdowns.forEach((d) => {
        const trigger = d.querySelector('[data-haus-dropdown-trigger]');
        const menu = d.querySelector('[data-haus-dropdown-menu]');
        if (!trigger || !menu) return;
        let openTimer;

        const open = () => {
            clearTimeout(openTimer);
            closeAll();
            menu.classList.remove('hidden');
            trigger.setAttribute('aria-expanded', 'true');
        };
        const scheduleClose = () => {
            openTimer = setTimeout(() => {
                menu.classList.add('hidden');
                trigger.setAttribute('aria-expanded', 'false');
            }, 200);
        };

        d.addEventListener('mouseenter', open);
        d.addEventListener('mouseleave', scheduleClose);
        trigger.addEventListener('focus', open);
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}

/**
 * Lottie player. Any element with [data-haus-lottie="/path/to/lottie.json"]
 * gets the animation loaded and played on viewport entry (loops).
 * lottie-web is bundled via npm.
 */
function initLottieAnimations() {
    const els = document.querySelectorAll('[data-haus-lottie]');
    if (!els.length) return;

    let lottiePromise;
    const loadLottie = () => {
        if (!lottiePromise) lottiePromise = import('lottie-web');
        return lottiePromise;
    };

    const play = async (el) => {
        const path = el.dataset.hausLottie;
        if (!path || el.dataset.hausLottieLoaded === '1') return;
        el.dataset.hausLottieLoaded = '1';
        const mod = await loadLottie();
        const lottie = mod.default || mod;
        lottie.loadAnimation({
            container: el,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path,
        });
    };

    if (typeof IntersectionObserver === 'undefined') {
        els.forEach(play);
        return;
    }
    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                play(entry.target);
                io.unobserve(entry.target);
            }
        }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach((el) => io.observe(el));
}

/**
 * Sticky header transparent → solid as user scrolls past the hero.
 * The header itself is fixed via Tailwind class; we just toggle a
 * background class once scrollY > 50px (or once we've passed any
 * data-haus-hero element).
 */
function initStickyHeader() {
    const header = document.querySelector('[data-haus-header]');
    if (!header) return;

    // Some pages (e.g. news entries) have a white top, so the header must
    // stay solid/dark even at scroll position 0 to keep the wordmark legible.
    const forceSolid = header.hasAttribute('data-haus-header-solid');

    const TRANSPARENT = ['bg-transparent'];
    const SOLID = ['bg-haus-ink-900/95', 'backdrop-blur', 'shadow-sm'];

    const apply = (solid) => {
        for (const c of TRANSPARENT) header.classList.toggle(c, !solid);
        for (const c of SOLID) header.classList.toggle(c, solid);
    };

    const update = () => apply(forceSolid || window.scrollY > 60);
    update();
    window.addEventListener('scroll', update, { passive: true });
}

/**
 * Mobile menu toggle.
 */
function initMobileMenu() {
    const toggle = document.querySelector('[data-haus-mobile-toggle]');
    const nav = document.querySelector('[data-haus-mobile-nav]');
    if (!toggle || !nav) return;
    const iconMenu = toggle.querySelector('[data-haus-icon="menu"]');
    const iconClose = toggle.querySelector('[data-haus-icon="close"]');

    const setOpen = (open) => {
        if (open) nav.removeAttribute('hidden');
        else nav.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        if (iconMenu) iconMenu.classList.toggle('hidden', open);
        if (iconClose) iconClose.classList.toggle('hidden', !open);
    };

    toggle.addEventListener('click', () => {
        setOpen(nav.hasAttribute('hidden'));
    });

    // Close menu when a nav link is clicked (so the page navigation
    // doesn't leave the menu open during transition).
    nav.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => setOpen(false));
    });

    // Close on Escape.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !nav.hasAttribute('hidden')) setOpen(false);
    });
}

/**
 * Fade-in-on-scroll. Any element with [data-haus-fade-in] reveals when it
 * enters the viewport. Optional [data-haus-fade-delay="200"] in ms.
 */
function initFadeInOnScroll() {
    const els = document.querySelectorAll('[data-haus-fade-in]');
    if (!els.length || typeof IntersectionObserver === 'undefined') return;

    // Strategy: only HIDE elements that are well below the fold AND were
    // visible to the document when JS started (i.e. they were going to be
    // painted). This prevents the flash of empty space we saw earlier
    // where above-the-fold content got hidden before the observer ran.
    // We use CSS transitions added via class so SSR / no-JS renders show
    // everything as normal.
    const toObserve = [];
    els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 100) {
            // Already in or near viewport — show immediately, no transition.
            return;
        }
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 700ms ease-out, transform 700ms ease-out';
        el.style.transitionDelay = `${el.dataset.hausFadeDelay ?? 0}ms`;
        el.style.willChange = 'opacity, transform';
        toObserve.push(el);
    });

    if (toObserve.length === 0) return;

    const reveal = (el) => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        setTimeout(() => { el.style.willChange = 'auto'; }, 800);
    };

    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            reveal(entry.target);
            io.unobserve(entry.target);
        }
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

    toObserve.forEach((el) => io.observe(el));

    // Safety net: if anything is still hidden 3 seconds after load (e.g.
    // headless browser captures, IntersectionObserver edge cases, or the
    // user lands on a long page with prefers-reduced-motion), force reveal.
    setTimeout(() => {
        toObserve.forEach((el) => {
            if (el.style.opacity === '0') {
                io.unobserve(el);
                reveal(el);
            }
        });
    }, 3000);
}

/**
 * Parallax backgrounds — any element with [data-haus-parallax]
 * gets its background-position shifted relative to scroll.
 * Optional [data-haus-parallax-amount="0.4"] controls the strength
 * (0.4 = background moves at 40% of scroll speed).
 */
function initParallaxBackgrounds() {
    const els = document.querySelectorAll('[data-haus-parallax]');
    if (!els.length) return;
    els.forEach((el) => {
        const amount = Number(el.dataset.hausParallaxAmount ?? 0.35);
        gsap.to(el, {
            backgroundPositionY: `${amount * 100}%`,
            ease: 'none',
            scrollTrigger: {
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
            },
        });
    });
}

/**
 * Hover image enhancement — any image with [data-haus-hover-image] gets a
 * subtle scale on hover. The CSS handles most of it; this just adds a
 * class for browsers that don't support :has() based selectors.
 */
function initHoverImages() {
    document.querySelectorAll('[data-haus-hover-image]').forEach((el) => {
        el.classList.add('overflow-hidden');
        const img = el.querySelector('img');
        if (!img) return;
        img.classList.add('transition-transform', 'duration-500', 'group-hover:scale-105');
    });
}
