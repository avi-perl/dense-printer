(function () {
  "use strict";

  const DEFAULTS = {
    font: "serif", size: 9, scale: 100, line: 1.2,
    cols: 2, margin: 0.25, para: 0.35,
    headings: true, justify: false, footer: true,
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

  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages"), scalerEl = $("pagesScaler"), stageEl = $("stage"), emptyEl = $("empty");

  function load(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save() {
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

  // ---------- Zoom ----------
  function applyZoom() {
    const pageH = 11 * 96;
    let z;
    if (zoom === "fit") { z = Math.min(1, (stageEl.clientHeight - 78) / pageH); }
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
    const r = trigger.getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 5) + "px";
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
  document.addEventListener("click", closeAllPops);
  stageEl.addEventListener("scroll", closeAllPops, { passive: true });

  // ---------- Actions ----------
  function setSetting(key, val) { settings[key] = val; save(); syncUI(); scheduleLayout(); }
  function toggle(key) { setSetting(key, !settings[key]); }

  function doAction(act) {
    switch (act) {
      case "files": $("fileInput").click(); break;
      case "folder": $("folderInput").click(); break;
      case "paste": openPaste(); break;
      case "sample": loadSample(); break;
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
    const md = files.filter((f) => MD_RE.test(f.name));
    if (!md.length) return;
    md.sort((a, b) => natCompare(a._path || a.webkitRelativePath || a.name, b._path || b.webkitRelativePath || b.name));
    const parts = [];
    for (const f of md) parts.push((await f.text()).replace(/\s+$/, ""));
    doc = { markdown: parts.join("\n\n"), names: md.map((f) => f.name) };
    save(); refreshSource(); repaginate();
  }
  function refreshSource() {
    if (doc.names.length) {
      $("docTitle").textContent = doc.names.length === 1 ? doc.names[0].replace(MD_RE, "") : doc.names.length + " documents";
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

  // ---------- Paste markdown ----------
  function ingestText(text, name) {
    if (!text || !text.trim()) return;
    doc = { markdown: text.replace(/\s+$/, ""), names: [name || "Pasted.md"] };
    save(); refreshSource(); repaginate();
  }
  function openPaste() {
    closeAllPops();
    $("pasteArea").value = doc.markdown && doc.names[0] === "Pasted.md" ? doc.markdown : "";
    $("pasteHint").textContent = "";
    $("pasteModal").classList.remove("hidden");
    setTimeout(() => $("pasteArea").focus(), 30);
  }
  function closePaste() { $("pasteModal").classList.add("hidden"); }
  function confirmPaste() {
    const text = $("pasteArea").value;
    if (!text.trim()) { $("pasteHint").textContent = "Nothing to add — paste some markdown first."; return; }
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
  // Global paste: drop clipboard markdown straight onto the page (unless typing in a field)
  document.addEventListener("paste", (e) => {
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
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
  window.addEventListener("drop", async (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging"); $("drop").classList.remove("over"); ingest(await filesFromDrop(e.dataTransfer)); });

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
  function boot() { syncUI(); refreshSource(); repaginate(); }
  if (window.marked) boot();
  else { const t = setInterval(() => { if (window.marked) { clearInterval(t); boot(); } }, 60); setTimeout(() => clearInterval(t), 4000); }
})();
