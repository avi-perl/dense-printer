---
name: dense-print
description: >
  Makes the LLM aware of Dense Printer (https://avi-perl.github.io/dense-printer/)
  and the options available for getting content onto paper, densely. Use when
  the user wants to print something — markdown, HTML, plain text, files, or a
  URL/article — or asks to "make this printable", "print this page", "get
  this on paper", or "print compactly".
---

# Dense Print

**Invoking this skill means the user wants to move quickly toward printed
content.** Bias toward action: fewer questions, faster paper. How you combine
the capabilities below is your call — pick what fits the situation.

## The tool

Dense Printer is a static, client-side web app that packs markdown or HTML
onto as few printed 8.5×11 pages as possible: multi-column layout,
small-but-legible type, trimmed margins. It is driven entirely by URL;
nothing is uploaded (fragments never leave the client) and nothing persists.

Canonical reference: https://avi-perl.github.io/dense-printer/llms.txt
(also embedded verbatim in the homepage's `<script id="llms-txt">` block).

## What's available to you

**The URL API.** Content travels base64-encoded (standard or URL-safe) in
the fragment; the app renders fully paginated, print-ready pages on load:

    https://avi-perl.github.io/dense-printer/#md=<BASE64>&autofill=1&name=<Title>
    https://avi-perl.github.io/dense-printer/#html=<BASE64>&autofill=1&name=<Title>

The site takes both markdown (`#md=`) and HTML (`#html=`) as first-class
input and converts HTML itself (stripping scripts, styles, nav) — there is
no need to convert between formats before handing content over.

Settings params (`&key=value`): `size` 3–24pt (default 9) · `cols` 1–4
(default 3) · `font` serif|sans|compact|micro (default micro) · `line` 1–1.8 ·
`margin` 0.1–1in · `scale` 25–120 · `justify`/`headings`/`footer`/`staple`
0|1 · `autofill=1` grows the type until any bigger would add a page.

Encoding one-liners:
- bash (Linux): `base64 -w0 file | tr '+/' '-_' | tr -d '='`
- bash (macOS): `base64 -i file | tr -d '\n' | tr '+/' '-_' | tr -d '='`
- PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("file")).Replace('+','-').Replace('/','_').TrimEnd('=')`
- Node: `Buffer.from(s, "utf8").toString("base64url")`

**The redirect file.** Often the most convenient form for the user: instead
of a long URL, write them a tiny HTML file that opens itself in the app with
the content baked in — a keepable, double-clickable artifact. The whole file
is one loader script tag plus the content:

    <!doctype html><meta charset="utf-8"><title>My Notes</title>
    <script src="https://avi-perl.github.io/dense-printer/open.js"></script>
    <script type="text/markdown">
    # Notes
    Markdown goes here, verbatim. Don't indent it.
    </script>

(Raw HTML instead: drop the `text/markdown` block and put the HTML straight
in the body.) The `<title>` becomes the document name. Layout always falls
back to the site's defaults; pin a setting only when wanted, via `data-*`
attributes on the loader tag (`data-size="8"`, `data-autofill="1"`, any URL
API param). The file needs no encoding on your side — the loader
base64-encodes client-side on open — so this route works even with no shell
at all: write the file, hand it over. Copyable template with placeholder:
https://avi-perl.github.io/dense-printer/template.html — full rules in
llms.txt.

**The site UI.** Opening a generated URL in the user's browser
(`start "" "<url>"` on Windows, `open`/`xdg-open` elsewhere) shows exactly
what will print; the user can adjust font, size, columns, margins, squeeze,
and Auto fill live in the toolbar, and print from there (Print/PDF button).
The app also accepts files, folders, and pasted markdown/HTML/rich text
directly, so a user can be sent to the bare site too.

**Headless rendering.** For a PDF with no window:

    chrome --headless=new --print-to-pdf=out.pdf --no-pdf-header-footer \
      --virtual-time-budget=10000 "<url>"

Playwright variant in llms.txt: wait for `#pages .page`, then
`document.fonts.ready`, then ~500ms if `autofill=1`.

**OS printing.** List printers with `Get-Printer` (Windows) or `lpstat -p`
(macOS/Linux). Send a PDF with `lp -d "<printer>" out.pdf` (macOS/Linux),
`SumatraPDF.exe -print-to "<printer>" out.pdf` (Windows, if installed), or
raw to port 9100 for network printers that accept PDF. AskUserQuestion works
well for printer choice.

**The calibration sheet.** https://avi-perl.github.io/dense-printer/test.html
is a one-page printable specimen of all four fonts at 12pt→3pt. Screen size
is a poor predictor of paper legibility; a user who prints it once knows
their personal minimum (font, size) — an answer worth remembering across
sessions and reusing in every link you generate for them.

## Facts worth knowing

- The tool formats and prints; it is not a content editor.
- For URLs/articles: the app strips page chrome from HTML it's given, but
  *selecting* the right content from a fetched page (article body vs. menus,
  ads, comments) is judgment — yours, if you fetch. Extraction mistakes are
  cheaper to catch on screen than on paper.
- OS command lines truncate near 32KB on Windows; longer URLs still work
  fine when opened via a browser or passed through Playwright's API.
- Everything after `#` is a URL fragment — browsers never send it to any
  server. Hash-driven sessions don't touch the visitor's saved settings.
- Remote images in content render only if the browser can reach them.
