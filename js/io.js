/* ============ DocEdit — file open & export ============ */
"use strict";

/* =================== OPEN =================== */

const fileInput = document.getElementById("file-input");

function openFilePicker() { fileInput.click(); }

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) openFile(fileInput.files[0]);
  fileInput.value = "";
});

/* drag & drop */
["dragover", "dragenter"].forEach(ev =>
  document.body.addEventListener(ev, e => {
    e.preventDefault();
    editor.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach(ev =>
  document.body.addEventListener(ev, e => {
    e.preventDefault();
    editor.classList.remove("dragover");
  })
);
document.body.addEventListener("drop", e => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) openFile(f);
});

async function openFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  try {
    if (ext === "md" || ext === "markdown") {
      const text = await file.text();
      loadHtml(markdownToHtml(text), file.name);
    } else if (ext === "txt") {
      const text = await file.text();
      loadHtml(textToHtml(text), file.name);
    } else if (ext === "html" || ext === "htm") {
      const text = await file.text();
      loadHtml(extractBodyHtml(text), file.name);
    } else if (ext === "docx") {
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      loadHtml(result.value, file.name);
    } else if (ext === "pdf") {
      const buf = await file.arrayBuffer();
      const html = await pdfToHtml(buf);
      loadHtml(html, file.name);
      alert(t("pdf_note"));
    } else {
      // unknown extension → try as plain text
      const text = await file.text();
      loadHtml(textToHtml(text), file.name);
    }
  } catch (err) {
    console.error(err);
    alert(t("open_error") + "\n" + err.message);
  }
}

function loadHtml(html, name) {
  editor.innerHTML = html || "<p><br></p>";
  normalizeImportedCode();
  highlightAllCodeZones();
  setFileName(name);
  markDirty();
  refreshStatus();
}

/* --- converters (import) --- */

function markdownToHtml(md) {
  return marked.parse(md, { breaks: false, gfm: true });
}

function textToHtml(text) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\r?\n/)
    .map(line => "<p dir=\"auto\">" + (esc(line) || "<br>") + "</p>")
    .join("");
}

function extractBodyHtml(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  doc.querySelectorAll("script, style, link, meta").forEach(n => n.remove());
  return doc.body ? doc.body.innerHTML : htmlText;
}

/* give imported <pre><code> blocks the code-zone treatment */
function normalizeImportedCode() {
  editor.querySelectorAll("pre").forEach(pre => {
    pre.classList.add("code-zone");
    pre.setAttribute("dir", "ltr");
    pre.setAttribute("spellcheck", "false");
    let code = pre.querySelector("code");
    if (!code) {
      code = document.createElement("code");
      code.textContent = pre.textContent;
      pre.textContent = "";
      pre.appendChild(code);
    }
    const m = (code.className || "").match(/language-([\w#+-]+)/);
    pre.dataset.lang = m ? m[1] : "plaintext";
  });
}

/* --- pdf import (text extraction via pdf.js) --- */
async function pdfToHtml(arrayBuffer) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // group items into lines by their y position
    const lines = [];
    let lastY = null, line = [];
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (line.length) lines.push(line.join(""));
        line = [];
      }
      line.push(item.str);
      lastY = y;
    }
    if (line.length) lines.push(line.join(""));
    html += lines
      .map(l => l.trim())
      .filter(l => l)
      .map(l => "<p dir=\"auto\">" + esc(l) + "</p>")
      .join("");
    if (p < pdf.numPages) html += "<hr>";
  }
  return html || "<p><br></p>";
}

/* =================== EXPORT =================== */

const EXPORT_CSS = `
  body { font-family: 'Inter','Vazirmatn',system-ui,sans-serif; line-height:1.75;
         max-width:800px; margin:40px auto; padding:0 20px; color:#1c2330; font-size:16px; }
  h1{font-size:2em} h2{font-size:1.55em} h3{font-size:1.25em} h4{font-size:1.1em}
  blockquote{ margin:.8em 0; padding:.4em 1em; border-inline-start:4px solid #2f6fed;
              background:#eef3ff; border-radius:4px; }
  img{max-width:100%; height:auto;}
  table{border-collapse:collapse; width:100%; margin:.8em 0;}
  th,td{border:1px solid #c9d1dc; padding:6px 10px;}
  th{background:#eef3ff;}
  code{ font-family:'JetBrains Mono',Consolas,monospace; font-size:.88em; background:#f4f6f8;
        border:1px solid #dde3ea; border-radius:4px; padding:1px 5px; direction:ltr; unicode-bidi:embed; }
  pre.code-zone{ direction:ltr; text-align:left; background:#f6f8fa; border:1px solid #dde3ea;
                 border-radius:8px; padding:14px 16px; overflow-x:auto;
                 font-family:'JetBrains Mono',Consolas,monospace; font-size:13.5px;
                 line-height:1.6; white-space:pre-wrap; }
  pre.code-zone code{ background:none; border:none; padding:0; display:block; }
  [dir="rtl"]{text-align:right;} [dir="ltr"]{text-align:left;}
  hr{border:none; border-top:2px solid #dde3ea; margin:1.2em 0;}
`;

function collectFontLinks() {
  return [...document.querySelectorAll('link[href*="fonts.googleapis.com/css2"]')]
    .map(l => `<link href="${l.href}" rel="stylesheet">`)
    .join("\n");
}

/* returns a clean, highlighted clone of the document as an HTML string */
function getCleanContent() {
  if (activeCodeZone) { highlightCodeZone(activeCodeZone); activeCodeZone = null; }
  if (typeof buildToc === "function") buildToc();        // ensure heading ids exist
  if (typeof enforceDigits === "function") enforceDigits(); // enforce digit setting
  const clone = editor.cloneNode(true);
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("spellcheck");
  clone.classList.remove("page", "dragover");
  clone.querySelectorAll("pre.code-zone").forEach(pre => {
    const code = pre.querySelector("code");
    if (code && !code.classList.contains("hljs")) {
      // apply highlight in the clone
      const lang = pre.dataset.lang || "plaintext";
      try {
        const res = hljs.getLanguage(lang)
          ? hljs.highlight(code.textContent, { language: lang })
          : hljs.highlightAuto(code.textContent);
        code.innerHTML = res.value;
      } catch (e) { /* plain */ }
    }
  });
  return clone;
}

const TOC_CSS = `
  nav.toc{ border:1px solid #dde3ea; border-radius:8px; padding:14px 18px; margin:0 0 1.6em;
           background:#f8fafc; page-break-after:always; }
  nav.toc .toc-title{ font-weight:700; font-size:1.2em; margin-bottom:.5em; }
  nav.toc ul{ list-style:none; margin:0; padding:0; }
  nav.toc li{ margin:.25em 0; }
  nav.toc a{ text-decoration:none; color:#2f6fed; }
  nav.toc .toc-l1{ margin-inline-start:1.2em; } nav.toc .toc-l2{ margin-inline-start:2.4em; }
  nav.toc .toc-l3{ margin-inline-start:3.6em; } nav.toc .toc-l4{ margin-inline-start:4.8em; }
`;

const COPY_BTN_SCRIPT = `<script>
document.querySelectorAll("pre.code-zone").forEach(function(pre){
  var b=document.createElement("button");
  b.textContent="⧉ copy";
  b.style.cssText="position:absolute;top:6px;left:8px;font-size:11px;padding:2px 8px;"+
    "border:1px solid #c9d1dc;border-radius:5px;background:#fff;cursor:pointer;opacity:.75;";
  pre.style.position="relative";
  b.onclick=function(){
    navigator.clipboard.writeText(pre.textContent.replace(/⧉ copy|✓/,"").trim())
      .then(function(){ b.textContent="✓"; setTimeout(function(){b.textContent="⧉ copy";},1200); });
  };
  pre.appendChild(b);
});
<\/script>`;

function buildFullHtml(forWord = false) {
  const clone = getCleanContent();
  const dir = editor.getAttribute("dir") || "ltr";
  const ps = (typeof currentPageSize === "function") ? currentPageSize() : null;
  const pageRule = ps ? `@page { size: ${ps.css}; margin: 18mm; }` : "";
  const hl = forWord ? "" :
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">';
  const toc = (typeof buildTocHtmlFor === "function") ? buildTocHtmlFor(clone, dir) : "";
  return `<!DOCTYPE html>
<html lang="${UI_LANG}" dir="${dir}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(currentFileName)}</title>
${forWord ? "" : collectFontLinks()}
${hl}
<style>${EXPORT_CSS}${TOC_CSS}${pageRule}${typeof customFontCss === "function" ? customFontCss() : ""}</style>
</head>
<body dir="${dir}">
${toc}
${clone.innerHTML}
${forWord ? "" : COPY_BTN_SCRIPT}
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

/* --- individual exporters --- */

function exportHtml() {
  download(new Blob([buildFullHtml()], { type: "text/html;charset=utf-8" }),
    currentFileName + ".html");
}

function exportTxt() {
  const clone = getCleanContent();
  download(new Blob([clone.innerText || clone.textContent || ""], { type: "text/plain;charset=utf-8" }),
    currentFileName + ".txt");
}

function exportMd() {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
  td.addRule("codeZone", {
    filter: node => node.nodeName === "PRE" && node.classList.contains("code-zone"),
    replacement: (content, node) => {
      const lang = node.dataset.lang || "";
      const code = node.textContent.replace(/\n$/, "");
      return "\n```" + lang + "\n" + code + "\n```\n";
    }
  });
  const clone = getCleanContent();
  // strip highlight spans so turndown sees plain code text
  clone.querySelectorAll("pre.code-zone code").forEach(c => { c.textContent = c.textContent; });
  const md = td.turndown(clone.innerHTML);
  download(new Blob([md], { type: "text/markdown;charset=utf-8" }), currentFileName + ".md");
}

function exportDocx() {
  const html = buildFullHtml(true);
  const blob = htmlDocx.asBlob(html, { orientation: "portrait" });
  download(blob, currentFileName + ".docx");
}

function exportPdfDownload() {
  const clone = getCleanContent();
  const dir = editor.getAttribute("dir") || "ltr";
  const ps = (typeof currentPageSize === "function") ? currentPageSize() : { w: 794, jspdf: "a4" };
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:" + ps.w + "px;background:#fff;color:#1c2330;padding:40px;";
  holder.dir = dir;
  const toc = (typeof buildTocHtmlFor === "function") ? buildTocHtmlFor(clone, dir) : "";
  const tocStyle = toc ? "<style>" + TOC_CSS + "</style>" : "";
  holder.innerHTML = tocStyle + toc + clone.innerHTML;
  document.body.appendChild(holder);
  const orientation = ps.w > (ps.h || 99999) ? "landscape" : "portrait";
  html2pdf()
    .set({
      margin: [12, 12],
      filename: currentFileName + ".pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: ps.jspdf, orientation },
      pagebreak: { mode: ["avoid-all", "css"] }
    })
    .from(holder)
    .save()
    .then(() => holder.remove())
    .catch(e => { holder.remove(); alert(t("export_error") + e.message); });
}

function exportPdfPrint() {
  const w = window.open("", "_blank");
  if (!w) { window.print(); return; }
  w.document.write(buildFullHtml());
  w.document.close();
  w.document.title = currentFileName;
  // give fonts a moment to load before printing
  setTimeout(() => { w.focus(); w.print(); }, 800);
}

/* --- RTF export (compact HTML→RTF converter) --- */

function exportRtf() {
  const clone = getCleanContent();
  const rtf = htmlToRtf(clone);
  download(new Blob([rtf], { type: "application/rtf" }), currentFileName + ".rtf");
}

function rtfEscape(text) {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\line ";
    else if (cp < 128) out += ch;
    else if (cp <= 0xFFFF) out += "\\u" + (cp > 32767 ? cp - 65536 : cp) + "?";
    else {
      // surrogate pair
      const h = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
      const l = ((cp - 0x10000) % 0x400) + 0xDC00;
      out += "\\u" + (h - 65536) + "?\\u" + (l - 65536) + "?";
    }
  }
  return out;
}

function htmlToRtf(root) {
  const H_SIZES = { H1: 48, H2: 38, H3: 32, H4: 28 };
  let body = "";

  function walkInline(node, state) {
    let s = "";
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        s += rtfEscape(child.nodeValue);
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        let open = "", close = "";
        if (tag === "B" || tag === "STRONG") { open = "{\\b "; close = "}"; }
        else if (tag === "I" || tag === "EM") { open = "{\\i "; close = "}"; }
        else if (tag === "U") { open = "{\\ul "; close = "}"; }
        else if (tag === "S" || tag === "STRIKE" || tag === "DEL") { open = "{\\strike "; close = "}"; }
        else if (tag === "CODE") { open = "{\\f1 "; close = "}"; }
        else if (tag === "BR") { s += "\\line "; return; }
        else if (tag === "IMG") { return; } // images not embedded in RTF export
        s += open + walkInline(child, state) + close;
      }
    });
    return s;
  }

  function para(node, opts = {}) {
    const dir = (node.getAttribute && node.getAttribute("dir")) ||
      (node.closest && node.closest("[dir]") ? node.closest("[dir]").getAttribute("dir") : "ltr");
    const rtl = dir === "rtl" ? "\\rtlpar\\qr " : "";
    const size = opts.size ? `\\fs${opts.size} ` : "\\fs24 ";
    const bold = opts.bold ? "\\b " : "";
    const font = opts.mono ? "\\f1 " : "\\f0 ";
    const prefix = opts.prefix ? rtfEscape(opts.prefix) : "";
    const content = opts.text !== undefined ? rtfEscape(opts.text) : walkInline(node, {});
    return `{\\pard ${rtl}${font}${size}${bold}${prefix}${content}\\par}\n`;
  }

  function walkBlocks(node) {
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        if (child.nodeValue.trim()) body += para({ getAttribute: () => null, closest: () => null }, { text: child.nodeValue });
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName;
      if (H_SIZES[tag]) {
        body += para(child, { size: H_SIZES[tag], bold: true });
      } else if (tag === "P" || tag === "DIV" || tag === "BLOCKQUOTE") {
        if (child.querySelector("p,div,pre,ul,ol,table,h1,h2,h3,h4")) walkBlocks(child);
        else body += para(child);
      } else if (tag === "PRE") {
        child.textContent.split("\n").forEach(lineText => {
          body += para(child, { text: lineText, mono: true, size: 20 });
        });
      } else if (tag === "UL" || tag === "OL") {
        let i = 1;
        child.querySelectorAll(":scope > li").forEach(li => {
          const prefix = tag === "OL" ? (i++) + ". " : "• ";
          body += para(li, { prefix });
        });
      } else if (tag === "TABLE") {
        child.querySelectorAll("tr").forEach(tr => {
          const cells = [...tr.querySelectorAll("th,td")].map(c => c.textContent.trim());
          body += para(tr, { text: cells.join("  |  ") });
        });
      } else if (tag === "HR") {
        body += para(child, { text: "—".repeat(20) });
      } else {
        body += para(child);
      }
    });
  }

  walkBlocks(root);
  return "{\\rtf1\\ansi\\ansicpg1252\\deff0" +
    "{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Courier New;}}" +
    "\n" + body + "}";
}

/* --- export dispatcher --- */
function doExport(kind) {
  try {
    switch (kind) {
      case "pdf-print": exportPdfPrint(); break;
      case "pdf": exportPdfDownload(); break;
      case "docx": exportDocx(); break;
      case "md": exportMd(); break;
      case "html": exportHtml(); break;
      case "txt": exportTxt(); break;
      case "rtf": exportRtf(); break;
    }
  } catch (e) {
    console.error(e);
    alert(t("export_error") + e.message);
  }
}
