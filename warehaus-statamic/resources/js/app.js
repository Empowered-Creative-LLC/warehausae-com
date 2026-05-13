import './bootstrap';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
    initStickyHeader();
    initMobileMenu();
    initFadeInOnScroll();
    initParallaxBackgrounds();
    initHoverImages();
});

/**
 * Sticky header transparent → solid as user scrolls past the hero.
 * The header itself is fixed via Tailwind class; we just toggle a
 * background class once scrollY > 50px (or once we've passed any
 * data-haus-hero element).
 */
function initStickyHeader() {
    const header = document.querySelector('[data-haus-header]');
    if (!header) return;

    const TRANSPARENT = ['bg-transparent', 'text-white'];
    const SOLID = ['bg-haus-ink-900/95', 'backdrop-blur', 'shadow-sm', 'text-white'];

    const apply = (solid) => {
        for (const c of TRANSPARENT) header.classList.toggle(c, !solid);
        for (const c of SOLID) header.classList.toggle(c, solid);
    };

    const update = () => apply(window.scrollY > 60);
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
