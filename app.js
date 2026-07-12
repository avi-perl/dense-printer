(function () {
  "use strict";

  const DEFAULTS = {
    font: "micro", size: 9, scale: 100, line: 1.2,
    cols: 3, margin: 0.25, para: 0.35,
    headings: true, justify: true, footer: true,
    staple: false, stapleSize: 0.85,
  };
  const FONTS = {
    serif: "'Source Serif 4', Charter, 'Times New Roman', Georgia, serif",
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    compact: "'IBM Plex Sans Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif",
    micro: "'Amiko', 'Helvetica Neue', Arial, sans-serif",
  };
  const FONT_LABEL = { serif: "Serif", sans: "Sans", compact: "Compact", micro: "Micro" };

  let settings = { ...DEFAULTS, ...load("mdpp_settings", {}) };
  if (!FONTS[settings.font]) settings.font = "serif";
  let doc = load("mdpp_doc", { markdown: "", names: [] });
  let zoom = load("mdpp_zoom", "fit");

  // ---------- HTML import ----------
  // Declared before the URL API so #html= links can convert during initial
  // load (the Turndown script tags precede app.js, so the globals exist).
  const HTML_RE = /\.(html?|xhtml)$/i;
  const HTML_STRIP = "script,style,noscript,template,iframe,object,embed,canvas,form,button,input,select,textarea,nav,aside";
  function htmlToMarkdown(html) {
    let body;
    try { body = new DOMParser().parseFromString(html, "text/html").body; }
    catch (e) { return ""; }
    body.querySelectorAll(HTML_STRIP).forEach((el) => el.remove());
    if (!window.TurndownService) return body.textContent.trim(); // CDN blocked — degrade to plain text
    try {
      const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", hr: "---" });
      if (window.turndownPluginGfm) td.use(turndownPluginGfm.gfm);
      return td.turndown(body).trim();
    } catch (e) { return body.textContent.trim(); }
  }
  // Copying markdown out of an editor also puts a styled-HTML flavor on the
  // clipboard; when the plain text already reads as markdown, keep it verbatim.
  function looksLikeMarkdown(text) {
    return /^#{1,6}\s|^```|^[-*+]\s|^\s*\d+\.\s|^>\s|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|^\|.+\|/m.test(text);
  }
  // Raw HTML source pasted as plain text: a whole document, or a fragment that
  // opens with a tag and closes one (and doesn't read as markdown).
  function looksLikeHtml(text) {
    const t = text.trim();
    if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return true;
    return /^<([a-z][a-z0-9-]*)(\s[^>]*)?>/i.test(t) && /<\/[a-z][a-z0-9-]*>/i.test(t) && !looksLikeMarkdown(t);
  }
  function htmlFlavorToMarkdown(dt) {
    if (!dt || !dt.getData) return "";
    let html;
    try { html = dt.getData("text/html"); } catch (e) { return ""; }
    if (!html || !html.trim()) return "";
    const text = dt.getData("text/plain") || "";
    if (text.trim() && looksLikeMarkdown(text)) return "";
    return htmlToMarkdown(html);
  }

  // ---------- URL API ----------
  // #md=<base64 markdown> or #html=<base64 html>, plus &size=8&cols=3&...,
  // lets tools drive the app with a single link (see llms.txt). HTML is
  // converted to markdown on load. Hash-driven sessions never touch
  // localStorage, so a generated link can't clobber a person's saved
  // document or settings.
  let hashDriven = false;
  let autoFillPending = false;
  (function readHash() {
    if (location.hash.length < 2) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const md64 = p.get("md"), html64 = p.get("html");
    if (!md64 && !html64) return;
    let text;
    try {
      // URLSearchParams decodes "+" as a space; spaces are invalid in base64,
      // so any space here was a "+" in standard base64. Also accept base64url.
      const b64 = (md64 || html64).replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      text = new TextDecoder("utf-8").decode(bytes);
    } catch (e) { return; }
    if (!md64) text = htmlToMarkdown(text);
    if (!text.trim()) return;
    hashDriven = true;
    doc = { markdown: text.replace(/\s+$/, ""), names: [p.get("name") || "Linked.md"] };
    if (FONTS[p.get("font")]) settings.font = p.get("font");
    [["size", 3, 24], ["line", 1, 1.8], ["margin", 0.1, 1], ["para", 0, 1], ["scale", 25, 120], ["stapleSize", 0.4, 1.6]].forEach(([k, lo, hi]) => {
      const v = parseFloat(p.get(k));
      if (!isNaN(v)) settings[k] = Math.min(hi, Math.max(lo, v));
    });
    const c = parseInt(p.get("cols"), 10);
    if (c >= 1 && c <= 4) settings.cols = c;
    ["headings", "justify", "footer", "staple"].forEach((k) => {
      const v = p.get(k);
      if (v != null) settings[k] = v === "1" || v === "true";
    });
    const af = p.get("autofill");
    if (af === "1" || af === "true") autoFillPending = true;
  })();

  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages"), scalerEl = $("pagesScaler"), stageEl = $("stage"), emptyEl = $("empty");

  function load(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save() {
    if (hashDriven) return;
    try {
      localStorage.setItem("mdpp_settings", JSON.stringify(settings));
      localStorage.setItem("mdpp_doc", JSON.stringify(doc));
      localStorage.setItem("mdpp_zoom", JSON.stringify(zoom));
    } catch (e) { /* storage full or blocked — keep running with in-memory state */ }
  }
  // Safety net: flush once more on the way out, in case any change skipped save().
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });

  function applyVars() {
    const px = (settings.size * (96 / 72) * settings.scale / 100);
    pagesEl.style.setProperty("--base-font", px.toFixed(3) + "px");
    pagesEl.style.setProperty("--line-height", String(settings.line));
    pagesEl.style.setProperty("--para-gap", settings.para + "em");
    pagesEl.style.setProperty("--margin", settings.margin + "in");
    pagesEl.style.setProperty("--cols", String(settings.cols));
    pagesEl.style.setProperty("--doc-font", FONTS[settings.font] || FONTS.serif);
    pagesEl.style.setProperty("--staple-size", settings.stapleSize + "in");
  }

  // ---------- Pagination ----------
  let layoutTimer = null;
  function scheduleLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(repaginate, 70); }

  function makePage() {
    const page = document.createElement("div");
    page.className = "page";
    const content = document.createElement("div");
    content.className = "page-content" + (settings.headings ? "" : " plain") + (settings.justify ? " justify" : "");
    if (settings.staple) {
      const s = document.createElement("div");
      s.className = "staple-reserve";
      s.setAttribute("aria-hidden", "true");
      content.appendChild(s);
    }
    page.appendChild(content);
    if (settings.footer) {
      const f = document.createElement("div");
      f.className = "page-footer";
      const d = document.createElement("span"); d.className = "pf-date"; d.textContent = todayStr();
      const p = document.createElement("span"); p.className = "pf-page";
      f.appendChild(d); f.appendChild(p);
      page.appendChild(f);
    }
    return { page, content };
  }

  function todayStr() {
    try { return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
    catch (e) { return new Date().toDateString(); }
  }

  function overflows(el) {
    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  }

  function repaginate() {
    applyVars();
    if (!doc.markdown.trim()) {
      pagesEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      $("pagesInd").textContent = "";
      applyZoom();
      return;
    }
    emptyEl.classList.add("hidden");

    let html;
    try { html = marked.parse(doc.markdown, { breaks: false, gfm: true }); }
    catch (e) { html = "<p>Could not parse markdown.</p>"; }

    const temp = document.createElement("div");
    temp.innerHTML = html;
    const nodes = Array.from(temp.children);

    pagesEl.innerHTML = "";
    let i = 0, guard = 0;
    while (i < nodes.length && guard < 6000) {
      guard++;
      const { page, content } = makePage();
      pagesEl.appendChild(page);
      let placed = 0;
      while (i < nodes.length) {
        content.appendChild(nodes[i]);
        if (overflows(content)) {
          if (placed === 0) { i++; placed++; }     // single oversized block: keep, accept overflow
          else { content.removeChild(nodes[i]); }  // bump to next page
          break;
        }
        i++; placed++;
      }
    }

    const n = pagesEl.children.length;
    if (settings.footer) {
      Array.from(pagesEl.children).forEach((p, idx) => {
        const pf = p.querySelector(".pf-page");
        if (pf) pf.textContent = "Page " + (idx + 1) + " of " + n;
      });
    }
    $("pagesInd").textContent = n + (n === 1 ? " page" : " pages");
    applyZoom();
  }

  // ---------- Auto fill ----------
  // Grow the type until any bigger would spill onto another page: first the
  // font size (0.5pt grid), then the squeeze scale (1% grid) to fine-tune.
  // Each trial repaginates synchronously, so binary search keeps it cheap and
  // the browser only paints the final state.
  function autoFill() {
    if (!doc.markdown.trim()) return;
    repaginate();
    const target = pagesEl.children.length;
    function grow(key, hi, step) {
      const lo = settings[key];
      let best = lo;
      let a = 1, b = Math.round((hi - lo) / step);
      while (a <= b) {
        const m = (a + b) >> 1;
        settings[key] = lo + m * step;
        repaginate();
        if (pagesEl.children.length <= target) { best = settings[key]; a = m + 1; }
        else { b = m - 1; }
      }
      settings[key] = best;
      repaginate();
    }
    grow("size", 24, 0.5);
    grow("scale", 120, 1);
    save(); syncUI();
  }

  // ---------- Zoom ----------
  const MOBILE_MQ = window.matchMedia("(max-width: 720px)");
  function applyZoom() {
    const pageH = 11 * 96, pageW = 8.5 * 96;
    let z;
    if (zoom === "fit") {
      z = Math.min(1, (stageEl.clientHeight - 78) / pageH);
      // on phones, fit the page width too so the sheet isn't cropped
      if (MOBILE_MQ.matches) z = Math.min(z, (stageEl.clientWidth - 24) / pageW);
    }
    else { z = parseFloat(zoom) / 100; }
    pagesEl.style.transform = "scale(" + z + ")";
    scalerEl.style.width = (pagesEl.offsetWidth * z) + "px";
    scalerEl.style.height = (pagesEl.offsetHeight * z) + "px";
  }

  // ---------- UI sync ----------
  function syncUI() {
    $("fontLab").textContent = FONT_LABEL[settings.font];
    $("sizeVal").textContent = trim(settings.size);
    $("lineLab").textContent = settings.line.toFixed(settings.line % 1 === 0 ? 1 : 2).replace(/0$/, "").replace(/\.$/, ".0");
    $("lineLab").textContent = fmtLine(settings.line);
    setSeg("segCols", String(settings.cols));
    $("vMargin").textContent = settings.margin.toFixed(2) + " in";
    $("vPara").textContent = settings.para.toFixed(2) + " em";
    $("vScale").textContent = settings.scale + "%";
    $("vStaple").textContent = settings.stapleSize.toFixed(2) + " in";
    $("rMargin").value = settings.margin;
    $("rPara").value = settings.para;
    $("rScale").value = settings.scale;
    $("rStaple").value = settings.stapleSize;
    $("zoomLab").textContent = zoom === "fit" ? "Fit" : zoom + "%";
    document.querySelectorAll('[data-tg]').forEach((el) => el.classList.toggle("on", !!settings[el.dataset.tg]));
    document.querySelectorAll('#dd-font .dd-opt').forEach((b) => b.classList.toggle("on", b.dataset.font === settings.font));
    document.querySelectorAll('#dd-line .dd-opt').forEach((b) => b.classList.toggle("on", parseFloat(b.dataset.line) === settings.line));
    document.querySelectorAll('#dd-zoom .dd-opt, #menu-view [data-zoom]').forEach((b) => b.classList.toggle("on", b.dataset.zoom === zoom));
    $("stapleSub").classList.toggle("dim", !settings.staple);
    document.querySelectorAll('#menu-format .tg, #menu-insert .tg').forEach((el) => el.classList.toggle("on", !!settings[el.dataset.tg]));
  }
  function trim(v) { return (Math.round(v * 10) / 10).toString().replace(/\.0$/, ""); }
  function fmtLine(v) { return v % 1 === 0 ? v.toFixed(1) : String(v); }
  function setSeg(id, val) { $(id).querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === val)); }

  // ---------- Popups ----------
  function closeAllPops() {
    document.querySelectorAll(".popup.open").forEach((p) => p.classList.remove("open"));
    document.querySelectorAll("[data-pop].active").forEach((t) => t.classList.remove("active"));
  }
  function placePopup(trigger, pop) {
    if (MOBILE_MQ.matches) { pop.style.top = ""; pop.style.left = ""; return; } // mobile: CSS turns the popup into a full drawer panel
    const r = trigger.getBoundingClientRect();
    let top = Math.round(r.bottom + 5);
    top = Math.max(8, Math.min(top, window.innerHeight - pop.offsetHeight - 8)); // keep tall popups on-screen (drawer triggers can sit low)
    pop.style.top = top + "px";
    let left = pop.classList.contains("right") ? (r.right - pop.offsetWidth) : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pop.offsetWidth - 8));
    pop.style.left = Math.round(left) + "px";
  }
  document.querySelectorAll("[data-pop]").forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = $(trigger.dataset.pop);
      const open = pop.classList.contains("open");
      closeAllPops();
      if (!open) { pop.classList.add("open"); trigger.classList.add("active"); placePopup(trigger, pop); }
    });
  });
  document.querySelectorAll(".popup").forEach((p) => p.addEventListener("click", (e) => e.stopPropagation()));
  // Mobile sub-menu back buttons: return to the main drawer without closing it
  document.querySelectorAll(".popup").forEach((pop) => {
    const trigger = document.querySelector('[data-pop="' + pop.id + '"]');
    const back = document.createElement("button");
    back.type = "button";
    back.className = "pop-back";
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg><span>' + ((trigger && trigger.title) || "Back") + "</span>";
    back.addEventListener("click", (e) => { e.stopPropagation(); closeAllPops(); });
    pop.insertBefore(back, pop.firstChild);
  });
  document.addEventListener("click", closeAllPops);
  stageEl.addEventListener("scroll", closeAllPops, { passive: true });

  // ---------- Mobile tools drawer ----------
  // On small screens the toolbar kicks out from the right; same element, same
  // controls, so every binding above works unchanged.
  function setTools(open) { document.body.classList.toggle("tools-open", open); if (!open) closeAllPops(); }
  $("btnTools").addEventListener("click", (e) => { e.stopPropagation(); setTools(!document.body.classList.contains("tools-open")); });
  $("tbClose").addEventListener("click", () => setTools(false));
  $("tbScrim").addEventListener("click", () => setTools(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".popup.open")) closeAllPops(); // step back to the main menu first
    else setTools(false);
  });
  document.querySelector(".tb-inner").addEventListener("scroll", closeAllPops, { passive: true });

  // ---------- Actions ----------
  function setSetting(key, val) { settings[key] = val; save(); syncUI(); scheduleLayout(); }
  function toggle(key) { setSetting(key, !settings[key]); }

  function doAction(act) {
    switch (act) {
      case "files": $("fileInput").click(); break;
      case "folder": $("folderInput").click(); break;
      case "paste": openPaste(); break;
      case "sample": loadSample(); break;
      case "autofill": autoFill(); break;
      case "clear": doc = { markdown: "", names: [] }; save(); refreshSource(); repaginate(); break;
      case "print": window.print(); break;
      case "setup": openPop("pop-setup"); break;
      case "staplecfg": openPop("pop-setup"); break;
      case "reset": settings = { ...DEFAULTS }; save(); syncUI(); repaginate(); break;
    }
  }
  function openPop(id) { closeAllPops(); const p = $(id); const t = document.querySelector('[data-pop="' + id + '"]'); if (p && t) { p.classList.add("open"); t.classList.add("active"); placePopup(t, p); } }

  // menu + dropdown item clicks
  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); doAction(b.dataset.act); if (!["setup", "staplecfg"].includes(b.dataset.act)) closeAllPops(); }));
  document.querySelectorAll("[data-tg]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggle(b.dataset.tg); }));
  document.querySelectorAll("[data-font]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setSetting("font", b.dataset.font); closeAllPops(); }));
  document.querySelectorAll("[data-line]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setSetting("line", parseFloat(b.dataset.line)); closeAllPops(); }));
  document.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); zoom = b.dataset.zoom; save(); syncUI(); applyZoom(); closeAllPops(); }));

  $("segCols").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; setSetting("cols", parseInt(b.dataset.v, 10)); });
  $("sizeMinus").addEventListener("click", () => setSetting("size", Math.max(3, Math.round((settings.size - 0.5) * 2) / 2)));
  $("sizePlus").addEventListener("click", () => setSetting("size", Math.min(24, Math.round((settings.size + 0.5) * 2) / 2)));
  $("btnPrint").addEventListener("click", () => window.print());

  function bindRange(id, key, fmt, parse) {
    $(id).addEventListener("input", (e) => { settings[key] = parse(e.target.value); save(); syncUI(); scheduleLayout(); });
  }
  bindRange("rMargin", "margin", null, parseFloat);
  bindRange("rPara", "para", null, parseFloat);
  bindRange("rScale", "scale", null, (v) => parseInt(v, 10));
  bindRange("rStaple", "stapleSize", null, parseFloat);

  // ---------- File loading ----------
  const MD_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
  function natCompare(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
  async function ingest(files) {
    const md = files.filter((f) => MD_RE.test(f.name) || HTML_RE.test(f.name));
    if (!md.length) return;
    md.sort((a, b) => natCompare(a._path || a.webkitRelativePath || a.name, b._path || b.webkitRelativePath || b.name));
    const parts = [];
    for (const f of md) {
      const raw = (await f.text()).replace(/\s+$/, "");
      parts.push(HTML_RE.test(f.name) ? htmlToMarkdown(raw) : raw);
    }
    doc = { markdown: parts.join("\n\n"), names: md.map((f) => f.name) };
    save(); refreshSource(); repaginate();
  }
  function refreshSource() {
    if (doc.names.length) {
      $("docTitle").textContent = doc.names.length === 1 ? doc.names[0].replace(MD_RE, "").replace(HTML_RE, "") : doc.names.length + " documents";
    } else {
      $("docTitle").textContent = "Untitled document";
    }
  }
  $("fileInput").addEventListener("change", (e) => ingest(Array.from(e.target.files)));
  $("folderInput").addEventListener("change", (e) => ingest(Array.from(e.target.files)));
  $("dropFiles").onclick = () => $("fileInput").click();
  $("dropFolder").onclick = () => $("folderInput").click();
  $("dropSample").onclick = () => loadSample();
  function loadSample() { doc = { markdown: SAMPLE, names: ["Field Notes.md"] }; save(); refreshSource(); repaginate(); }

  // ---------- Paste content ----------
  function ingestText(text, name) {
    if (!text || !text.trim()) return;
    if (looksLikeHtml(text)) text = htmlToMarkdown(text);
    if (!text.trim()) return;
    doc = { markdown: text.replace(/\s+$/, ""), names: [name || "Pasted.md"] };
    save(); refreshSource(); repaginate();
  }
  function openPaste() {
    setTools(false); // mobile: land on the page view when the modal closes, not the drawer
    closeAllPops();
    $("pasteArea").value = doc.markdown && doc.names[0] === "Pasted.md" ? doc.markdown : "";
    $("pasteHint").textContent = "";
    $("pasteModal").classList.remove("hidden");
    setTimeout(() => $("pasteArea").focus(), 30);
  }
  function closePaste() { $("pasteModal").classList.add("hidden"); }
  function confirmPaste() {
    const text = $("pasteArea").value;
    if (!text.trim()) { $("pasteHint").textContent = "Nothing to add — paste some markdown, HTML, or rich text first."; return; }
    ingestText(text, "Pasted.md");
    closePaste();
  }
  $("dropPaste").onclick = openPaste;
  $("pasteCancel").addEventListener("click", closePaste);
  $("pasteUse").addEventListener("click", confirmPaste);
  $("pasteModal").addEventListener("click", (e) => { if (e.target === $("pasteModal")) closePaste(); });
  $("pasteArea").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePaste();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmPaste();
  });
  // Rich text / HTML pasted into the modal lands as markdown
  $("pasteArea").addEventListener("paste", (e) => {
    const md = htmlFlavorToMarkdown(e.clipboardData);
    if (!md) return;
    e.preventDefault();
    const ta = e.target;
    ta.setRangeText(md, ta.selectionStart, ta.selectionEnd, "end");
  });
  // Global paste: drop clipboard markdown — or rich text, converted — straight onto the page (unless typing in a field)
  document.addEventListener("paste", (e) => {
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
    const dt = e.clipboardData || window.clipboardData;
    const md = htmlFlavorToMarkdown(dt);
    if (md) { e.preventDefault(); ingestText(md, "Pasted.md"); return; }
    const text = dt.getData("text");
    if (text && text.trim()) { e.preventDefault(); ingestText(text, "Pasted.md"); }
  });

  // ---------- Drag & drop ----------
  function readEntries(reader) {
    return new Promise((res) => { let out = []; const step = () => reader.readEntries((es) => { if (!es.length) res(out); else { out = out.concat(es); step(); } }, () => res(out)); step(); });
  }
  async function walk(entry, path, acc) {
    if (entry.isFile) { await new Promise((res) => entry.file((f) => { f._path = path + entry.name; acc.push(f); res(); }, res)); }
    else if (entry.isDirectory) { const ents = await readEntries(entry.createReader()); for (const e of ents) await walk(e, path + entry.name + "/", acc); }
  }
  async function filesFromDrop(dt) {
    const entries = [];
    if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
      for (const it of dt.items) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) entries.push(en); }
    }
    if (entries.length) { const acc = []; for (const en of entries) await walk(en, "", acc); return acc; }
    return Array.from(dt.files || []);
  }
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); $("drop").classList.add("over"); });
  window.addEventListener("dragover", (e) => { e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { e.preventDefault(); dragDepth--; if (dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); $("drop").classList.remove("over"); } });
  window.addEventListener("drop", async (e) => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging"); $("drop").classList.remove("over");
    const dragged = htmlFlavorToMarkdown(e.dataTransfer); // e.g. a selection dragged from a browser; must read before the await — the DataTransfer empties once the handler yields
    const files = await filesFromDrop(e.dataTransfer);
    if (files.length) ingest(files);
    else if (dragged) ingestText(dragged, "Dropped.md");
  });

  window.addEventListener("resize", () => { clearTimeout(window._rz); closeAllPops(); window._rz = setTimeout(applyZoom, 120); });

  // vertical wheel slides the filmstrip horizontally when a whole page fits
  stageEl.addEventListener("wheel", (e) => {
    const canScrollVert = stageEl.scrollHeight > stageEl.clientHeight + 1;
    if (!canScrollVert && e.deltaY !== 0 && !e.shiftKey) { stageEl.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  // ---------- Sample ----------
  const SAMPLE = [
    "# Field Notes — Density Test", "",
    "This sample shows how the tool packs content. Tune the **columns**, **text size**, **squeeze**, **margins**, and **spacing** from the toolbar and watch the page count update live. The goal: maximum legible information per sheet — a real replacement for *N-up* printing.", "",
    "## Why pack the page", "",
    "Printing 9 slides per sheet shrinks everything blindly and wastes margins. Here you control the trade-off directly: shrink type, add columns, justify and hyphenate, and trim margins until the density is exactly where you want it — without losing the document structure.", "",
    "- Continuous flow across as many pages as needed",
    "- One, two, three, or four columns",
    "- Serif, compact sans, or a narrow face for maximum characters per line",
    "- Headings can be styled or flattened to claw back vertical space", "",
    "### A small table", "",
    "| Setting | Looser | Denser |", "|---|---|---|",
    "| Text size | 12 pt | 7 pt |", "| Columns | 1 | 4 |",
    "| Margins | 1.0 in | 0.15 in |", "| Line spacing | 1.6 | 1.0 |", "",
    "> Tip: the *Squeeze* slider scales the whole layout at once — a fast way to fit one more page's worth of content onto the current sheet.", "",
    "### Code renders too", "",
    "```", "for sheet in document:", "    while column_has_room(sheet):", "        place(next_block)", "```", "",
    "## Lorem, for flow", "",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.", "",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.", "",
    "Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi.", "",
    "1. First, drop your files.", "2. Then choose a column count.", "3. Finally, squeeze to taste and print.", "",
    "Cras pede libero, dapibus nec, pretium sit amet, tempor quis. Sed aliquam, nisi quis porttitor congue, elit erat euismod orci, ac placerat dolor lectus quis orci. Phasellus consectetuer vestibulum elit. Aenean tellus metus, bibendum sed, posuere ac, mattis non, nunc.",
  ].join("\n") + buildSampleBody();

  function buildSampleBody() {
    const LP = [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      "Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus. Phasellus viverra nulla ut metus varius laoreet.",
      "Quisque rutrum. Aenean imperdiet. Etiam ultricies nisi vel augue. Curabitur ullamcorper ultricies nisi. Nam eget dui. Etiam rhoncus. Maecenas tempus, tellus eget condimentum rhoncus, sem quam semper libero, sit amet adipiscing sem neque sed ipsum.",
      "Nam quam nunc, blandit vel, luctus pulvinar, hendrerit id, lorem. Maecenas nec odio et ante tincidunt tempus. Donec vitae sapien ut libero venenatis faucibus. Nullam quis ante. Etiam sit amet orci eget eros faucibus tincidunt.",
      "Sed fringilla mauris sit amet nibh. Donec sodales sagittis magna. Sed consequat, leo eget bibendum sodales, augue velit cursus nunc, quis gravida magna mi a libero. Fusce vulputate eleifend sapien. Vestibulum purus quam, scelerisque ut, mollis sed.",
      "Cras sagittis. Praesent nec nisl a purus blandit viverra. Praesent ac massa at ligula laoreet iaculis. Nulla neque dolor, sagittis eget, iaculis quis, molestie non, velit. Mauris turpis nunc, blandit et, volutpat molestie, porta ut, ligula.",
    ];
    const CH = ["Method", "Measurements", "Field Results", "Discussion", "Appendix", "Background", "Calibration", "Edge Cases", "Throughput Notes", "Conclusions"];
    const out = [];
    const pick = (i) => LP[i % LP.length];
    for (let c = 0; c < CH.length; c++) {
      out.push("", "## " + (c + 1) + ". " + CH[c], "");
      out.push(pick(c), "", pick(c + 1), "");
      out.push("### Observations", "");
      out.push(pick(c + 2), "");
      out.push("- " + pick(c + 3).split(". ")[0] + ".", "- " + pick(c + 4).split(". ")[0] + ".", "- " + pick(c + 5).split(". ")[0] + ".", "");
      if (c % 2 === 0) {
        out.push("| Trial | Input | Output | Density |", "|---|---|---|---|", "| A | 12 pt / 1 col | 9 pages | 1.0x |", "| B | 7 pt / 2 col | 3 pages | 3.0x |", "| C | 4 pt / 4 col | 1 page | 6.0x |", "");
      } else {
        out.push("> " + pick(c + 1).split(". ")[0] + " — a note worth keeping inline.", "");
        out.push("```", "yield = (cols * chars_per_line * lines) / page", "density = yield / baseline", "```", "");
      }
      out.push(pick(c + 2), "");
    }
    return "\n" + out.join("\n");
  }

  // ---------- Boot ----------
  function boot() {
    syncUI(); refreshSource(); repaginate();
    // Web fonts change metrics after first layout; repaginate once they land,
    // and only then run a URL-requested auto fill so it measures real glyphs.
    const fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    fonts.then(() => {
      repaginate();
      if (autoFillPending) { autoFillPending = false; autoFill(); }
    });
  }
  if (window.marked) boot();
  else { const t = setInterval(() => { if (window.marked) { clearInterval(t); boot(); } }, 60); setTimeout(() => clearInterval(t), 4000); }
})();
