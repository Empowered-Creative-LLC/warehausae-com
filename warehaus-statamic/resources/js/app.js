import './bootstrap';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
    initStickyHeader();
    initMobileMenu();
    initMobileNavDisclosures();
    initDesktopDropdowns();
    initFadeInOnScroll();
    initParallaxBackgrounds();
    initHoverImages();
    initLottieAnimations();
    initRotatingWords();
    sizeCdWordsWrappers();
    initRecentProjectsCarousel();
    initProjectGalleryCarousel();
    initImageLightbox();
    initMissionTypewriter();
    initPortfolioLoadMore();
    initPortfolioSlideshows();
    initSpotlightCarousels();
    initLogoCarousels();
});

/**
 * Typewriter effect for the homepage mission statement. Types the copy out
 * character by character (preserving the amber .highlight spans) when the
 * element scrolls into view. Falls back to the fully-rendered text when JS is
 * unavailable or the user prefers reduced motion.
 */
function initMissionTypewriter() {
    const els = document.querySelectorAll('[data-haus-typewriter]');
    if (!els.length) return;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    els.forEach((el) => {
        // Snapshot the original segments (text + whether it's a highlight span).
        const segments = [...el.childNodes]
            .map((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return { text: node.textContent.replace(/\s+/g, ' '), highlight: false };
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                    return {
                        text: node.textContent.replace(/\s+/g, ' '),
                        highlight: node.classList.contains('highlight'),
                    };
                }
                return null;
            })
            .filter((seg) => seg && seg.text.length);

        if (!segments.length) return;

        // Trim the leading/trailing whitespace introduced by HTML indentation.
        segments[0].text = segments[0].text.replace(/^\s+/, '');
        segments[segments.length - 1].text = segments[segments.length - 1].text.replace(/\s+$/, '');

        if (reduceMotion || typeof IntersectionObserver === 'undefined') {
            return; // Leave the pre-rendered text as-is.
        }

        let started = false;
        const io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && !started) {
                    started = true;
                    io.unobserve(entry.target);
                    typeSegments(el, segments);
                }
            }
        }, { threshold: 0.4 });

        io.observe(el);
    });
}

function typeSegments(el, segments) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Rebuild the element empty, pre-creating each segment node so the caret
    // trails the typed text without layout jumps.
    el.textContent = '';
    el.classList.add('is-typing');

    const nodes = segments.map((seg) => {
        const node = seg.highlight ? document.createElement('span') : document.createTextNode('');
        if (seg.highlight) node.className = 'highlight';
        el.appendChild(node);
        return node;
    });

    const caret = document.createElement('span');
    caret.className = 'haus-caret';
    caret.setAttribute('aria-hidden', 'true');
    el.appendChild(caret);

    (async () => {
        for (let s = 0; s < segments.length; s++) {
            const { text, highlight } = segments[s];
            const node = nodes[s];
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (highlight) node.textContent += ch;
                else node.nodeValue += ch;
                // Brief pause after sentence punctuation for a natural cadence.
                await sleep(/[.,]/.test(ch) ? 180 : 20);
            }
        }
        // Typing done — let the caret blink idly.
        el.classList.remove('is-typing');
    })();
}

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
 * Portfolio index — reveal additional project cards in batches of nine.
 */
function initPortfolioLoadMore() {
    const grid = document.querySelector('[data-haus-portfolio-grid]');
    const button = document.querySelector('[data-haus-portfolio-load-more]');
    const wrap = document.querySelector('[data-haus-portfolio-load-more-wrap]');
    if (!grid || !button) return;

    const items = [...grid.querySelectorAll('[data-haus-portfolio-item]')];
    const batchSize = 9;
    let visible = items.filter((item) => !item.classList.contains('hidden')).length;

    const updateButton = () => {
        if (visible >= items.length) {
            wrap?.remove();
            return;
        }
        button.textContent = 'Load More';
    };

    button.addEventListener('click', () => {
        const next = items.slice(visible, visible + batchSize);
        next.forEach((item) => item.classList.remove('hidden'));
        visible += next.length;
        updateButton();
    });

    updateButton();
}

/**
 * Mobile nav submenus (e.g. Services) — toggle panel without navigating away.
 */
function initMobileNavDisclosures() {
    document.querySelectorAll('[data-haus-mobile-disclosure]').forEach((root) => {
        const trigger = root.querySelector('[data-haus-mobile-disclosure-trigger]');
        const panel = root.querySelector('[data-haus-mobile-disclosure-panel]');
        const chevron = root.querySelector('[data-haus-mobile-disclosure-chevron]');
        if (!trigger || !panel) return;

        trigger.addEventListener('click', () => {
            const open = panel.hasAttribute('hidden');
            panel.toggleAttribute('hidden', !open);
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            chevron?.classList.toggle('rotate-180', open);
        });
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
 * Project page image gallery — ~4 thumbs visible, prev/next arrows, dots.
 * Mirrors Elementor's image carousel on warehausae.com project pages.
 */
function initProjectGalleryCarousel() {
    document.querySelectorAll('[data-haus-project-gallery]').forEach((root) => {
        const track = root.querySelector('[data-haus-gallery-track]');
        const items = [...root.querySelectorAll('[data-haus-gallery-item]')];
        const prev = root.querySelector('[data-haus-gallery-prev]');
        const next = root.querySelector('[data-haus-gallery-next]');
        const dots = [...(root.parentElement?.querySelectorAll('[data-haus-gallery-dot]') || [])];
        if (!track || !items.length) return;

        let index = 0;
        let syncingFromScroll = false;

        const itemsPerView = () => {
            const itemWidth = items[0].getBoundingClientRect().width || 1;
            return Math.max(1, Math.round(track.clientWidth / itemWidth));
        };

        const maxIndex = () => Math.max(0, items.length - itemsPerView());

        const gapPx = () => {
            const row = root.querySelector('[data-haus-gallery-items]');
            if (!row || items.length < 2) return 0;
            const styles = getComputedStyle(row);
            return Number.parseFloat(styles.columnGap || styles.gap) || 0;
        };

        const offsetForIndex = (i) => {
            const width = items[0].getBoundingClientRect().width;
            return Math.max(0, i * (width + gapPx()));
        };

        const syncDots = () => {
            dots.forEach((dot, i) => {
                const active = i === index;
                dot.setAttribute('aria-current', active ? 'true' : 'false');
                dot.classList.toggle('bg-haus-ink-700', active);
                dot.classList.toggle('bg-haus-ink-300', !active);
            });
        };

        const syncButtons = () => {
            if (prev) prev.disabled = index <= 0;
            if (next) next.disabled = index >= maxIndex();
            syncDots();
        };

        const scrollToIndex = (nextIndex, { smooth = true } = {}) => {
            index = Math.min(Math.max(0, nextIndex), maxIndex());
            const left = offsetForIndex(index);
            syncingFromScroll = true;
            if (smooth && typeof track.scrollTo === 'function') {
                track.scrollTo({ left, behavior: 'smooth' });
                // Hard-set shortly after if smooth scroll is ignored
                window.setTimeout(() => {
                    if (Math.abs(track.scrollLeft - left) > 8) {
                        track.scrollLeft = left;
                    }
                    syncingFromScroll = false;
                }, 50);
            } else {
                track.scrollLeft = left;
                syncingFromScroll = false;
            }
            syncButtons();
        };

        prev?.addEventListener('click', (event) => {
            event.preventDefault();
            scrollToIndex(index - 1);
        });
        next?.addEventListener('click', (event) => {
            event.preventDefault();
            scrollToIndex(index + 1);
        });

        dots.forEach((dot) => {
            dot.addEventListener('click', (event) => {
                event.preventDefault();
                scrollToIndex(Number(dot.dataset.hausGalleryIndex || 0));
            });
        });

        let scrollTimer;
        track.addEventListener('scroll', () => {
            if (syncingFromScroll) return;
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const width = items[0].getBoundingClientRect().width + gapPx();
                if (width <= 0) return;
                index = Math.min(maxIndex(), Math.round(track.scrollLeft / width));
                syncButtons();
            }, 80);
        }, { passive: true });

        scrollToIndex(0, { smooth: false });
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => scrollToIndex(index, { smooth: false }), 150);
        });
    });
}

/**
 * Simple full-screen lightbox for project gallery (and any [data-full-src] trigger).
 * Avoids navigating to raw /assets/imported paths that 404 when files live on S3.
 */
function initImageLightbox() {
    const triggers = [...document.querySelectorAll('[data-haus-gallery-item][data-full-src]')];
    if (!triggers.length) return;

    const sources = triggers.map((el) => ({
        src: el.getAttribute('data-full-src'),
        alt: el.querySelector('img')?.getAttribute('alt') || '',
    })).filter((item) => item.src);

    if (!sources.length) return;

    let activeIndex = 0;
    let overlay = document.querySelector('[data-haus-lightbox]');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.setAttribute('data-haus-lightbox', '');
        overlay.className = 'haus-lightbox';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="haus-lightbox__backdrop" data-haus-lightbox-close tabindex="-1"></div>
            <button type="button" class="haus-lightbox__close" data-haus-lightbox-close aria-label="Close image">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
            <button type="button" class="haus-lightbox__nav haus-lightbox__nav--prev" data-haus-lightbox-prev aria-label="Previous image">
                <svg viewBox="0 0 12 16" width="14" height="18" fill="none" aria-hidden="true">
                    <path d="M9 1L2 8L9 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <figure class="haus-lightbox__figure">
                <img class="haus-lightbox__img" alt="" data-haus-lightbox-img>
                <figcaption class="haus-lightbox__caption" data-haus-lightbox-caption></figcaption>
            </figure>
            <button type="button" class="haus-lightbox__nav haus-lightbox__nav--next" data-haus-lightbox-next aria-label="Next image">
                <svg viewBox="0 0 12 16" width="14" height="18" fill="none" aria-hidden="true">
                    <path d="M3 1L10 8L3 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;
        document.body.appendChild(overlay);
    }

    const img = overlay.querySelector('[data-haus-lightbox-img]');
    const caption = overlay.querySelector('[data-haus-lightbox-caption]');
    const prevBtn = overlay.querySelector('[data-haus-lightbox-prev]');
    const nextBtn = overlay.querySelector('[data-haus-lightbox-next]');

    const show = (index) => {
        activeIndex = (index + sources.length) % sources.length;
        const item = sources[activeIndex];
        img.src = item.src;
        img.alt = item.alt;
        caption.textContent = item.alt;
        caption.hidden = !item.alt;
        const multi = sources.length > 1;
        if (prevBtn) prevBtn.hidden = !multi;
        if (nextBtn) nextBtn.hidden = !multi;
    };

    const open = (index) => {
        show(index);
        overlay.hidden = false;
        document.body.classList.add('haus-lightbox-open');
        overlay.querySelector('[data-haus-lightbox-close]')?.focus();
    };

    const close = () => {
        overlay.hidden = true;
        document.body.classList.remove('haus-lightbox-open');
        img.removeAttribute('src');
    };

    triggers.forEach((el, i) => {
        el.addEventListener('click', () => open(i));
    });

    overlay.querySelectorAll('[data-haus-lightbox-close]').forEach((el) => {
        el.addEventListener('click', close);
    });
    prevBtn?.addEventListener('click', () => show(activeIndex - 1));
    nextBtn?.addEventListener('click', () => show(activeIndex + 1));

    document.addEventListener('keydown', (event) => {
        if (overlay.hidden) return;
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowLeft') show(activeIndex - 1);
        if (event.key === 'ArrowRight') show(activeIndex + 1);
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

/**
 * Portfolio category Ken Burns photo slideshow — fades between full-bleed
 * images, matching the Elementor background slideshow on warehausae.com.
 */
function initPortfolioSlideshows() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-haus-portfolio-slideshow]').forEach((root) => {
        const slides = [...root.querySelectorAll('[data-haus-slideshow-slide]')];
        if (slides.length < 2) return;

        let index = 0;
        const show = (next) => {
            slides[index].classList.remove('is-active');
            index = next;
            slides[index].classList.add('is-active');
        };

        if (reducedMotion) return;

        setInterval(() => {
            show((index + 1) % slides.length);
        }, 5000);
    });
}

/**
 * Service spotlight carousel — heading+intro | project slides (Historic
 * Preservation Gettysburg section on warehausae.com).
 */
function initSpotlightCarousels() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-haus-spotlight-carousel]').forEach((root) => {
        const slides = [...root.querySelectorAll('[data-haus-spotlight-slide]')];
        if (slides.length < 2) return;

        const dotsWrap = root.querySelector('[data-haus-spotlight-dots]');
        const prevBtn = root.querySelector('[data-haus-spotlight-prev]');
        const nextBtn = root.querySelector('[data-haus-spotlight-next]');
        let index = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')));
        let timer = null;

        const dots = slides.map((_, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'haus-spotlight-dot' + (i === index ? ' is-active' : '');
            btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
            btn.addEventListener('click', () => show(i, true));
            dotsWrap?.appendChild(btn);
            return btn;
        });

        const show = (next, userAction = false) => {
            slides[index].classList.remove('is-active');
            dots[index]?.classList.remove('is-active');
            index = (next + slides.length) % slides.length;
            slides[index].classList.add('is-active');
            dots[index]?.classList.add('is-active');
            if (userAction) restart();
        };

        const restart = () => {
            if (reducedMotion) return;
            clearInterval(timer);
            timer = setInterval(() => show(index + 1), 5000);
        };

        prevBtn?.addEventListener('click', () => show(index - 1, true));
        nextBtn?.addEventListener('click', () => show(index + 1, true));

        root.addEventListener('mouseenter', () => clearInterval(timer));
        root.addEventListener('mouseleave', () => restart());

        restart();
    });
}

/**
 * Service spotlight logo carousel — fades between client logos beside the
 * "An Industrial Niche" style spotlight strip (~1.45s cadence on live).
 */
function initLogoCarousels() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-haus-logo-carousel]').forEach((root) => {
        const slides = [...root.querySelectorAll('[data-haus-logo-slide]')];
        if (slides.length < 2) return;

        let index = 0;
        const show = (next) => {
            slides[index].classList.remove('is-active');
            index = next;
            slides[index].classList.add('is-active');
        };

        if (reducedMotion) return;

        setInterval(() => {
            show((index + 1) % slides.length);
        }, 1450);
    });
}
