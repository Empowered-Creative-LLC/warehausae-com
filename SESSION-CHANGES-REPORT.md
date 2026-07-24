# Session Changes Report

**Date:** July 15, 2026  
**Branch:** `fix/project-gallery-carousel-lightbox`  
**Status:** Uncommitted local changes (16 files modified)

This report summarizes work done in this session to align rebuild pages with live [warehausae.com](https://warehausae.com), organized by page.

---

## Architecture — `/services/architecture/`

**Live reference:** https://warehausae.com/services/architecture/

| Change | Detail |
|--------|--------|
| Mid-page photo gallery restored | 5-slide Ken Burns slideshow (replacing single static mid image) |
| Recent Projects synced to live | Baseline list/order from live; excludes Civil-only projects that were incorrectly appearing (e.g. 84 Zions View Road, 4844 Market Street Self-Storage, Donwood Estates) |
| Hero / homepage strip imagery | Hero uses homepage Architecture iconbar asset |

**Primary files**
- `warehaus-statamic/content/collections/services/architecture.md`
- Shared: `ProjectListing.php`, `ProjectsCarousel.php`, `services/show.antlers.html`, `service.yaml`

---

## Civil Engineering — `/services/civil_engineering/`

**Live reference:** https://warehausae.com/services/civil_engineering/

| Change | Detail |
|--------|--------|
| Capabilities checklist layout fixed | Two independent columns (6 + 3) so “Municipal Engineering Services” is no longer stranded under a tall row |
| “Our Project Approach” removed | Section not present on live Civil page |
| Mid-page photo gallery restored | 9-slide Ken Burns slideshow |
| Recent Projects synced to live | Baseline membership/order from live scrape |

**Primary files**
- `warehaus-statamic/content/collections/services/civil_engineering.md`
- Shared: `services/show.antlers.html` (`capability_columns`), `service.yaml`

---

## Historic Preservation — `/services/historic-preservation/`

**Live reference:** https://warehausae.com/services/historic-preservation/

| Change | Detail |
|--------|--------|
| Mid-page photo gallery restored | 12-slide Ken Burns slideshow |
| Gettysburg section restored | “Restoring the Spirit of Gettysburg.” with intro + 4 project spotlight cards (George Spangler Farm, General Lee’s Headquarters, Gettysburg Armory, Wills Weinbrenner House) |
| Capabilities columns | Two independent stacks matching live |
| Recent Projects synced | Live baseline |

**Notes / known gaps**
- Some gallery assets use CDN near-matches (`-700x700` / `.webp`) where exact live filenames weren’t imported
- 3 Gettysburg spotlight images still hotlink live WordPress until imported to CDN

**Primary files**
- `warehaus-statamic/content/collections/services/historic-preservation.md`
- Shared: `services/show.antlers.html` (`spotlight_projects`), `service.yaml`, `app.js`, `app.css`

---

## Interior Design — `/services/interior_design/`

**Live reference:** https://warehausae.com/services/interior_design/

| Change | Detail |
|--------|--------|
| Mid-page photo gallery restored | 5-slide Ken Burns slideshow |
| Capability columns | Two stacks (4 + 3) matching live |
| Hero / mid imagery | Aligned with homepage Interiors iconbar asset |
| Recent Projects synced | Live baseline |

**Notes / known gaps**
- One live gallery asset (Hershey Next Century) missing locally/CDN → substituted with `Crystal-A-23.jpg`

**Primary files**
- `warehaus-statamic/content/collections/services/interior_design.md`

---

## Structural Engineering — `/services/structural/`

**Live reference:** https://warehausae.com/services/structural/

| Change | Detail |
|--------|--------|
| Mid-page photo gallery restored | 6-slide Ken Burns slideshow |
| “An Industrial Niche” section restored | Heading + prose below gallery (with Derek Donnelly link) |
| “Leading-Edge Technology” | Capabilities heading/intro restored for software list |
| Recent Projects synced | Live baseline |

**Notes / known gaps**
- Live client logo carousel assets (`/2023/06/1.png`–`9.png`) 404 on live; logo strip wired in template but empty until assets exist

**Primary files**
- `warehaus-statamic/content/collections/services/structural.md`
- Shared: `services/show.antlers.html`, `service.yaml`, `app.js`, `app.css`

---

## Building Sciences — `/building-sciences/`

**Type:** Portfolio category page

| Change | Detail |
|--------|--------|
| Gallery placeholder added | Mid-page Ken Burns slideshow using existing portfolio `photo_gallery` pattern |
| Placeholder slides (4) | UMFP Redwood Facade, Hershey Community Building, 1895 Federal Building, Lancaster Courthouse |

**Primary files**
- `warehaus-statamic/content/collections/portfolio_categories/building-sciences.md`

---

## Project Pages — `/project/{slug}/`

**Example verified:** `/project/210-york-street-office/`, `/project/phoenix-contact-office/`

| Change | Detail |
|--------|--------|
| Industries / categories moved | Removed from Project Details sidebar (fixes odd 2-col grid gap above “Industries”) |
| Orange category tags | Brand amber (`haus-amber-500`) chips, white text, links preserved when `url` exists |
| Final placement | Directly **under the lead heading** (e.g. “Harmony of historic and modern…”) above intro prose — **not** in the hero |
| Awards standalone section | Awards pulled out of the 2-col meta grid into a highlighted footer band (amber label + bullets) so a tall Services list no longer leaves a dead zone above Awards |

**Primary files**
- `warehaus-statamic/resources/views/projects/show.antlers.html`

---

## Careers — `/careers/`

| Change | Detail |
|--------|--------|
| Job posting timestamps removed | Posts still show date (e.g. “April 23, 2026”); time meta removed |

**Primary files**
- `warehaus-statamic/resources/views/pages/careers.antlers.html`
- `warehaus-statamic/resources/blueprints/collections/job_postings/job_posting.yaml` (note that time is not displayed)

---

## Homepage (related)

Included in the same working tree as service work:

| Change | Detail |
|--------|--------|
| Architecture circle / hero consistency | `Architecture.png` iconbar asset updated; Architecture service hero points at iconbar asset |
| Interior Design strip/hero | Uses Interiors iconbar asset for hero/mid imagery |

**Primary files**
- `warehaus-statamic/public/assets/images/home/iconbar/Architecture.png`
- Architecture / Interior Design service content (hero / strip fields)

---

## Shared / cross-page infrastructure

These support multiple service and portfolio pages:

| Area | Change |
|------|--------|
| Service Recent Projects | `ProjectListing::forService()` accepts live `recent_projects` baselines and sorts like portfolio carousels |
| Projects carousel tag | Passes baseline URLs from service entry `recent_projects` |
| Service detail template | `photo_gallery` slideshow; `capability_columns`; optional spotlight (Gettysburg / Industrial Niche); capabilities heading/intro |
| Service blueprint | New/extended fields: `photo_gallery`, `capability_columns`, `spotlight_*`, `capabilities_heading` / `capabilities_intro`, etc. |
| Front-end JS/CSS | Spotlight carousel + optional logo carousel support for service spotlights |

**Files**
- `warehaus-statamic/app/Support/ProjectListing.php`
- `warehaus-statamic/app/Tags/ProjectsCarousel.php`
- `warehaus-statamic/resources/views/services/show.antlers.html`
- `warehaus-statamic/resources/blueprints/collections/services/service.yaml`
- `warehaus-statamic/resources/js/app.js`
- `warehaus-statamic/resources/css/app.css`

---

## Quick checklist by URL

| Page | Gallery | Other notable changes |
|------|---------|------------------------|
| `/services/architecture/` | ✅ 5 slides | Recent Projects baseline; Civil-only exclusions |
| `/services/civil_engineering/` | ✅ 9 slides | Checklist columns; approach removed |
| `/services/historic-preservation/` | ✅ 12 slides | Gettysburg spotlight restored |
| `/services/interior_design/` | ✅ 5 slides | Capability columns |
| `/services/structural/` | ✅ 6 slides | Industrial Niche restored |
| `/building-sciences/` | ✅ 4 placeholder slides | — |
| `/project/...` | — | Industry tags under lead heading |
| `/careers/` | — | Date only (no time) |

---

## Follow-ups (optional)

1. Import/hotlink cleanup for Gettysburg spotlight images and any gallery near-matches still substituted
2. Recover Structural Industrial Niche client logos (or drop logo carousel until assets exist)
3. Replace Interior Design Hershey Next Century substitute with the correct asset when available
4. Commit + open PR to `dev` when ready for Cloud deploy
