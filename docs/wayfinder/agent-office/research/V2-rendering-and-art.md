# V2 research: rendering approach and free art for the Agent Office

Read 14 Oct 2026 by a research agent; every licence and size line below was read from the URL beside it that day. Ratings marked judgement were not measured.

## Recommendation

Hand drawn isometric SVG in the page (2:1 grid, furniture as `<symbol>` placed with `<use>`, `shape-rendering: crispEdges` for the pixel look), with every name tag and status chip as real HTML text in an overlay and the SVG art `aria-hidden`. Our own art, so no licence to track.

- Day and night: every colour is a CSS custom property swapped by the time of day preset, plus one tint layer with `mix-blend-mode: multiply`. MDN: "Baseline, Widely available ... across browsers since January 2020" (https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode).
- Motion: `gsap.matchMedia()` with `reduceMotion: "(prefers-reduced-motion: reduce)"`; animations inside it "get reverted automatically" when the query stops matching (https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/), which fits the house rule of `gsap.from()` plus `clearProps` and nothing under reduced motion.

Runner up: canvas 2D with Kenney CC0 isometric sprites and the same HTML overlay; scales better for a large scene but every sprite and click area is placed by hand.

## Comparison

| Approach | Library size (gzip) | Licence | Phone performance (judgement) | Screen reader text (judgement) | Effort (judgement) | Day and night |
| :--- | ---: | :--- | :--- | :--- | :--- | :--- |
| SVG tiles + HTML overlay | none (GSAP 27,206 B) | own art | good to a few hundred nodes | native | medium | CSS variables + `mix-blend-mode` |
| Canvas 2D + sprite sheet | none | per art pack | very good | needs a DOM copy of all text | medium to high | multiply layer |
| PixiJS 8.6.6 | 214,892 B | MIT | very good (WebGL) | needs a DOM copy | high | filter or tint |
| Phaser 3.90.0 | 315,492 B | MIT | good | needs a DOM copy | highest | camera or tint |
| CSS 3D transforms | none | none | risky on phones | native but rotated | high | CSS variables |

Sizes: https://bundlephobia.com/api/size?package=pixi.js@8.6.6, https://bundlephobia.com/api/size?package=phaser@3.90.0, https://bundlephobia.com/api/size?package=gsap@3.13.0

## Licence lines

- GSAP, permitted use: "the implementation and/or use of GSAP Products on any website, web application, or digital interface"; FAQ: "Commercial usage is covered under the standard license." Effective 30 Apr 2025, modified 30 May 2025. https://gsap.com/licensing/
- Kenney: "all game assets on the asset pages are public domain licensed (CC0). You're free to use them, even in commercial projects." https://kenney.nl/support · packs: https://kenney.nl/assets/isometric-miniature-library, https://kenney.nl/assets/isometric-miniature-farm, https://kenney.nl/assets/furniture-kit, https://kenney.nl/assets/mini-characters (each page: "License: Creative Commons CC0")
- CC0 deed: "You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission." https://creativecommons.org/publicdomain/zero/1.0/
- PixiJS MIT: https://raw.githubusercontent.com/pixijs/pixijs/dev/LICENSE · Phaser MIT: https://raw.githubusercontent.com/phaserjs/phaser/master/LICENSE.md
- Rejected, paid with credits required: LimeZu Modern Office ("Credits required", from $5.00) https://limezu.itch.io/modernoffice and Modern Interiors ("paying at least 1.50$") https://limezu.itch.io/moderninteriors

## Not verified

- Phone performance, accessibility and effort ratings, including the few hundred node limit for SVG.
- Whether Kenney Furniture Kit and Mini Characters ship isometric 2D images or only 3D models.
- Whether Kenney's isometric style suits a cute pixel home office (previews not viewed).
- Other OpenGameArt and itch.io packs; the reference clip itself.
- That canvas content needs a DOM copy of its text (MDN page returned 404).
