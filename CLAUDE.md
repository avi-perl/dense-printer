# Dense Printer

A static, client-side-only site (GitHub Pages, deployed from `main`) that packs
markdown onto as few printed 8.5×11 pages as possible. No build step, no server:
`index.html` + `app.js` + `styles.css`, plus `test.html` (font/size specimen sheet).

## Rules

- **After every feature update, evaluate whether `llms.txt` needs updating.**
  `llms.txt` advertises the tool to AI agents — the URL API (`#md=<base64>` +
  settings params), parameter ranges/defaults, and headless print-to-PDF recipes.
  If a change adds/removes/renames a URL parameter, changes a default or valid
  range, adds a page, or alters how an agent should drive the tool, update
  `llms.txt` (and the README's agent note) in the same commit.
