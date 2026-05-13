# Intentional design cleanups during the migration

Tracks every visible deviation from the live WordPress site that was a deliberate decision, not a regression. Reviewed alongside Phase 9 visual diffs.

## Typography

- **Font:** Live site uses Neue Haas Unica Pro (licensed). New site uses Inter (free, near-substitute) via Bunny Fonts pending a font-license decision. Token in `resources/css/app.css` (`--font-sans`) so the swap is one line.
- **Type scale:** Unified to one scale defined in Tailwind theme tokens. The live site has subtle drift between H1 sizes across templates; the new site uses one scale across all pages.
- **Eyebrow tags:** Standardized as `.eyebrow` utility class — 0.18em letter spacing, semibold, uppercase, amber-400 by default. The live site has them styled slightly differently per Elementor block; we normalized.

## Spacing and rhythm

- **Section padding:** Unified to `py-16 md:py-24 lg:py-32` via the `.section` utility. The live site varies between 60-160px top/bottom across pages depending on which Elementor section was used.
- **Container width:** Unified to `max-w-6xl` with responsive horizontal padding via the `.container-haus` utility. Live site widths drift between 1140/1170/1200px depending on row.

## Animation

- **Fade-in-on-scroll:** Disabled by default for Phase 9. The hook (`data-haus-fade-in`) is left in templates so re-enabling is a JS-only change in Phase 11. Disabled because the initial opacity:0 caused content flashes on slow paints and on the visual-diff Playwright captures. Live site has subtle fades; we'll add them back tuned in Phase 11.
- **Header scroll behavior:** Transparent → solid on scroll, preserved.

## Layout

- **Project page sidebar:** "Project Details" facts sidebar is sticky-positioned on the right at desktop widths so it stays visible while reading the three-act narrative. Live site lets it scroll out of view.
- **Project narrative images:** Pulled from `gallery_images[1..3]` rather than embedding separate image fields per narrative section. If the project has fewer than 4 gallery images, the narrative sections degrade gracefully (text-only).
- **Team member hero:** Reorganized to a 2/3 portrait + 1/3 contact card grid on desktop. Live site has the portrait fill full width with the contact card overlaid awkwardly. New layout is cleaner and the contact card is more discoverable.

## Form behavior

- **Newsletter form:** Stubbed as plain HTML (no submission target) for now. Real submission via the Statamic `newsletter` form is wired in `resources/forms/newsletter.yaml`; the Antlers `{{ form:create }}` tag wasn't cooperating in this layout. Real submission is a launch-polish task.

## What is NOT changed

- Color palette: amber + warm-neutral ink scale matches the live site.
- Yellow tag/check-mark accent language: preserved as-is.
- Hero overlay pattern (full-bleed image + title + location): preserved.
- Three-act "We listen / We design / We deliver" narrative pattern: preserved.
- Footer CTA "Have a project in mind? / Let's talk." + newsletter signup + address: preserved.
- Capitalized `/Industries/` URLs: preserved exactly per the zero-301s contract.
- Mixed canonical patterns for portfolio categories (flat vs `/industry/`): preserved per the zero-301s contract.
