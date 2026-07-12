/* Dense Printer redirect loader.
 *
 * Include this script in a bare HTML file alongside your content and the
 * page immediately redirects into the Dense Printer app with the content
 * (and any settings) packed into the URL fragment. The file needs no other
 * markup — see llms.txt ("Redirect file") for the two-line template.
 *
 * Content sources, in order of precedence:
 *   1. A <script type="text/markdown"> block — sent as markdown (#md=).
 *   2. Otherwise the document body's HTML, minus script/noscript tags —
 *      sent as HTML (#html=) and converted to markdown by the app.
 *
 * Settings: any data-* attribute on this script's tag becomes a URL
 * parameter (data-size="8" -> size=8). <title> becomes the document name
 * unless data-name is given.
 */
(function () {
  var APP = "https://avi-perl.github.io/dense-printer/";
  var me = document.currentScript;

  function b64url(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    // Chunked: String.fromCharCode.apply on the whole array overflows the
    // argument-count limit for documents beyond a few hundred KB.
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function go() {
    var params = new URLSearchParams();
    var mdEl = document.querySelector('script[type="text/markdown"]');
    if (mdEl) {
      var md = mdEl.textContent.replace(/^\n/, "").replace(/\n[ \t]*$/, "");
      if (!md.trim()) return;
      params.set("md", b64url(md));
    } else {
      var body = document.body.cloneNode(true);
      body.querySelectorAll("script, noscript").forEach(function (el) { el.remove(); });
      var html = body.innerHTML;
      if (!html.trim()) return;
      params.set("html", b64url(html));
    }
    if (document.title) params.set("name", document.title);
    if (me && me.dataset) {
      for (var k in me.dataset) params.set(k, me.dataset[k]);
    }
    location.replace(APP + "#" + params.toString());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go);
  } else {
    go();
  }
})();
