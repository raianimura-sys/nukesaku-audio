# Nukesaku Audio Website

Static website for Nukesaku Audio, published with GitHub Pages.

- Live: <https://raianimura-sys.github.io/nukesaku-audio/>
- Store: <https://nukesakuaudio.booth.pm/>
- YouTube: <https://youtube.com/channel/UCAgXW05yq8Rg0s3lzZblxLQ>

## Pages

- `index.html` — studio home: live HARMONY demo, public tools, development projects, learning and contact routes
- `harmony/` — free browser chord progression app with mobile support and MIDI export
- `harmony.html` — HARMONY features and a three-step guide, with direct app links
- `nukesakucompose.html` — currently distributed Beta product page
- `nukesakuchop.html` — upcoming phrase collage instrument product preview
- `compose-evolution.html` — formal 1.5.0 Composer Canvas development log and earlier milestones
- `knowledge.html` — 15-article beginner curriculum across three courses
- `article-*.html` — DAW, composition theory, MIDI editing and mixing fundamentals
- `404.html` — GitHub Pages fallback

## HARMONY

HARMONY is available at <https://raianimura-sys.github.io/nukesaku-audio/harmony/>. The home topic and <https://raianimura-sys.github.io/nukesaku-audio/harmony.html> introduce its features and workflow, with direct links to open the app. It runs in the browser on desktop and mobile; MIDI files can be imported into a DAW.

The rhythm catalog has 5 basic, 11 simple, and 32 complex patterns. Version 1.3 adds 12 hand-composed accompaniment grooves; density, accents, and variations apply to both playback and MIDI export.

Version 1.5 puts five context-aware chord recommendations at the center of the composer. The full palette is collapsed under “自分でコードを選ぶ” and keeps diatonic, borrowed, and unrestricted chord choices available. Recommendations include explanations and two-chord audition. Tapping a candidate selects and previews it; only its separate plus button or a drag inserts it into the progression.

Version 1.6 replaces mood-based suggestions in “アイデアの種” with eight named progressions. Royal road, Canon, Marusa, and Komuro are directly visible; every recipe shows its actual chords in the current key before loading. Curated chord qualities are preserved.

Version 2.3.1 gives the song-section proposal dialog a definite viewport-bounded height so its scrolling candidate area does not collapse to a header-only panel in iPhone web views.

Version 2.3 adds short list reveals, fluid chord rearrangement, interruptible disclosure animation and immediate modal/press feedback, following Motion Reference. It keeps the original palette, copy, gapless chord timeline and explicit plus/drag insertion. Reduced-motion preferences are respected and mobile controls are easier to tap.

Version 1.7 adds a labeled delete button to every timeline chord. Individual deletion preserves the selected chord when an earlier chord is removed, stops playback and previews, and supports undo/redo. Selection and deletion use separate keyboard-accessible buttons.

Progressions and favorites are stored locally in each browser. The GitHub Pages origin differs from the original Sites app, so saved projects do not transfer automatically. Export a project as JSON in the original app, then import that JSON into this version to move it.

`harmony-home.css` provides HARMONY-specific routes, its home topic, and introduction-page layout. The renewed home layout and site-wide spacing are applied by `studio.css`, using the original cream, pink, lavender, and mint brand palette.

## Home demo and shared styling

- `studio.css?v=4` is loaded after existing styles by every root-level HTML page, including product pages, learning articles, and the fallback. The independent `harmony/` app is excluded so its editor styling stays separate.
- `homepage-demo.js` uses the existing HARMONY engines for the home demo. Playback starts from a user action, plays the progression once, and can be stopped. The simple and complex controls let visitors compare the two rhythm families.
- Keep the home routes to `harmony/`, `harmony.html`, the COMPOSE Beta page, CHOP preview, development log, the 15-article curriculum, BOOTH, YouTube, and contact. Preserve the `#lab` and `#about` anchors used by other pages.
- Keep screenshots with their actual product/version labels. The FLOW and GuitarPractice images are development evidence, not released products.

## Local preview

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Design system

The site uses a shared studio design across its home, product pages, and learning content. Base color, spacing, type and radius tokens live in `style.css`; `studio.css` applies the redesigned home and the site-wide overrides. Prefer scoped home-page rules for layout changes and shared rules for navigation, typography, buttons, and footer consistency.

Interactive controls and text remain HTML/CSS/JavaScript. `nukesaku-audio-social-card-v2.jpg` is used only for social sharing, not as a page UI.

## Content accuracy rules

- The currently distributed Beta is macOS / Apple Silicon only.
- NukesakuCHOP is in final development; its OS, price and release date are not yet published.
- Formal COMPOSE 1.5.0 Composer Canvas is in development and has not started selling. Its chord editing, Piano Roll, and central editing UI are development features; do not attribute them to the distributed Beta 0.3.0.
- FLOW 0.9.0 is an unsold development build; Bitwig save/restore remains under verification. Its current evidence supports rhythm patterns, arrangement generation, and DRUM MAP display.
- GuitarPractice 0.1.3 is an undistributed validation prototype. Its tuner, chord dictionary, fretboard, and MIDI-to-TAB are being tested; real-guitar recognition accuracy remains in development.
- Windows remains unverified until a native build and DAW acceptance pass are complete.
- When shared CSS or JavaScript changes, bump its `?v=` query in every root-level HTML page that loads it. Update the home demo query on `index.html` when the demo changes. Do not change the independent app cache without an app update.

## Search and sharing

Canonical URLs and Open Graph metadata live in each page `<head>`. Update `sitemap.xml` when adding a public page. The root social card is 1200 × 630.
