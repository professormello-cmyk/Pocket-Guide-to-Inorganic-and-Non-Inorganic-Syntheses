# Pocket Corridor Table (sd/df) — Starter

Static PWA template:
- index.html + app.js + styles.css
- manifest.json + sw.js
- data/pcpt.csv (element-level CRS + DMC)
- data/cases.csv (optional cases; computed columns in browser)
- _redirects (Netlify SPA fallback: /* /index.html 200)

## Local test
Service Workers require HTTPS or localhost:
- `python -m http.server 8000`
- Open http://localhost:8000

## Deploy to Netlify (no build)
- Publish directory: folder that contains index.html
- Build command: empty
- Base directory: empty (unless monorepo)

## Deploy to GitHub Pages
- Settings → Pages → Deploy from branch → (main) / (root)
