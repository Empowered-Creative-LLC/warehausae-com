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
    toggle.addEventListener('click', () => {
        const hidden = nav.hasAttribute('hidden');
        if (hidden) nav.removeAttribute('hidden');
        else nav.setAttribute('hidden', '');
    });
}

/**
 * Fade-in-on-scroll. Any element with [data-haus-fade-in] reveals when it
 * enters the viewport. Optional [data-haus-fade-delay="200"] in ms.
 */
function initFadeInOnScroll() {
    // Fade-in is currently a no-op. The data-haus-fade-in attribute is left
    // in the templates so we can re-enable it as a polish task in Phase 11
    // without touching every template. To re-enable: replace this body with
    // an IntersectionObserver implementation. Disabled now because the
    // opacity:0 initial state caused content to flash empty during
    // Playwright screenshots and on slow devices where the observer hadn't
    // fired by paint.
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
