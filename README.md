# USA Laser Engraving Map

A single-page web tool for building a laser-ready SVG map of the USA (including Alaska and Hawaii).
Toggle layers, set the output size and icon size, then download.

## What's here

- `index.html`: the whole website. It's one self-contained file with no server needed, so it can be hosted anywhere (GitHub Pages, Netlify, Vercel).
- `source/`: what builds `index.html`.
  - `template.html`: the page UI (layout, controls, download logic). Edit this for UI changes.
  - `build.mjs`: projects the map data and converts all text to outlines. Edit this for landmarks, label positions and park markers.
  - `build_roads.geojson`, `build_parks.geojson`: simplified Natural Earth data.

## Rebuild after changes

```bash
cd source
npm install      # first time only
npm run build    # regenerates ../index.html
```

## Layers

Base (frame, US outline, state borders), roads (freeways, highways), park areas,
**icons** (park trees, landmark stars) and **text** (state abbreviations, park names, landmark names, title), plus a compass.
Each layer is its own Inkscape/LightBurn layer in the exported SVG.

Icons can be exported as filled (engrave) or outline (cut holes). "Download insert pieces" makes a matching
sheet of shapes to cut out as pegs for a travel map.

## Data

US state boundaries: US Census via [us-atlas](https://github.com/topojson/us-atlas). Roads and parks: [Natural Earth](https://www.naturalearthdata.com/). Both are public domain.
Font: Barlow Condensed (SIL Open Font License), embedded as outlines.
