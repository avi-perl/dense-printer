# Markdown Page Printer

Pack markdown into dense, print-ready 8.5×11 pages — tune columns, type size, margins, and squeeze, then Print/PDF. HTML imports too: drop in `.html` files or paste rich text and it's converted to markdown on the spot. A static, client-side-only site; nothing leaves your browser.

**Open it:** https://avi-perl.github.io/dense-printer/ · or just open `index.html`.

**For AI agents & automation:** the app has a URL API — pass base64 markdown (or HTML, via `#html=`) and settings in the URL fragment (`#md=<base64>&size=8&cols=3`) and it renders fully paginated, ready for headless print-to-PDF. When a link is awkward, write a redirect file instead: a bare HTML file with the content plus one `<script src=".../open.js">` tag that opens itself in the app on double-click. See [llms.txt](llms.txt) for the full parameter list, the redirect-file template, and copy-paste recipes. There's also a ready-made agent skill at [skill.md](skill.md) — Claude Code users can save it to `~/.claude/skills/dense-print/SKILL.md`.

> 🤖 An AI project — designed and built with AI.
