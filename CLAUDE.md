# Dense Printer

A static, client-side-only site (GitHub Pages, deployed from `main`) that packs
markdown onto as few printed 8.5×11 pages as possible. No build step, no server:
`index.html` + `app.js` + `styles.css`, plus `test.html` (font/size specimen sheet).

## Rules

- **`index.html` embeds a verbatim copy of `llms.txt`** in the
  `<script type="text/plain" id="llms-txt">` block at the bottom of the page,
  so agents that fetch only the homepage get the full API docs. Any edit to
  `llms.txt` MUST update that embedded copy in the same commit — the two must
  stay byte-identical (compare the file against the block's content, minus the
  wrapping newlines the script tag adds).

- **`skill.md` (site root) is a verbatim copy of `.claude/skills/dense-print/SKILL.md`**
  so agents can fetch the skill from the deployed site. Any edit to the skill
  must update both files in the same commit — keep them byte-identical.

- **After every feature update, evaluate whether `llms.txt` needs updating.**
  `llms.txt` advertises the tool to AI agents — the URL API (`#md=<base64>` +
  settings params), parameter ranges/defaults, and headless print-to-PDF recipes.
  If a change adds/removes/renames a URL parameter, changes a default or valid
  range, adds a page, or alters how an agent should drive the tool, update
  `llms.txt` (and the README's agent note) in the same commit.
