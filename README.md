# Nukesaku Audio Website

Static website for Nukesaku Audio, published with GitHub Pages.

- Live: <https://raianimura-sys.github.io/nukesaku-audio/>
- Store: <https://nukesakuaudio.booth.pm/>
- YouTube: <https://youtube.com/channel/UCAgXW05yq8Rg0s3lzZblxLQ>

## Pages

- `index.html` — brand home and primary routes
- `nukesakucompose.html` — currently distributed Beta product page
- `nukesakuchop.html` — upcoming phrase collage instrument product preview
- `compose-evolution.html` — formal 1.0 development log
- `knowledge.html` — 15-article beginner curriculum across three courses
- `article-*.html` — DAW, composition theory, MIDI editing and mixing fundamentals
- `404.html` — GitHub Pages fallback

## Local preview

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Design system

The editable color, spacing, type and radius tokens are at the top of `style.css`. The current direction is “Warm Editorial × Music Tech”: warm and approachable at brand level, dark and precise around product imagery.

Interactive controls and text remain HTML/CSS/JavaScript. `nukesaku-audio-social-card-v2.jpg` is used only for social sharing, not as a page UI.

## Content accuracy rules

- The currently distributed Beta is macOS / Apple Silicon only.
- NukesakuCHOP is in final development; its OS, price and release date are not yet published.
- Formal 1.0 is in development and must not be described as released.
- Windows remains unverified until a native build and DAW acceptance pass are complete.
- When CSS or JavaScript changes, bump the `?v=` query in every HTML page.

## Search and sharing

Canonical URLs and Open Graph metadata live in each page `<head>`. Update `sitemap.xml` when adding a public page. The root social card is 1200 × 630.
