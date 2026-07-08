/* ============ DocEdit — editor core ============ */
"use strict";

const editor = document.getElementById("editor");

/* ---------- basic commands ---------- */
function exec(cmd, value = null) {
  editor.focus();
  document.execCommand(cmd, false, value);
  refreshStatus();
}

try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* not supported */ }

/* ---------- selection helpers ---------- */
function getSelectionBlocks() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const blocks = new Set();
  const blockOf = node => {
    while (node && node !== editor) {
      if (node.nodeType === 1 && /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|DIV|TD|TH)$/.test(node.tagName)) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  };
  const start = blockOf(range.startContainer);
  const end = blockOf(range.endContainer);
  if (start) blocks.add(start);
  if (end) blocks.add(end);
  if (start && end && start !== end && start.parentNode === end.parentNode) {
    let n = start.nextSibling;
    while (n && n !== end) {
      if (n.nodeType === 1) blocks.add(n);
      n = n.nextSibling;
    }
  }
  return [...blocks];
}

/* ---------- per-block direction ---------- */
function setBlockDirection(dir) {
  const blocks = getSelectionBlocks();
  if (!blocks.length) {
    // no block found (empty editor) — apply to editor itself
    editor.setAttribute("dir", dir);
    return;
  }
  blocks.forEach(b => {
    b.setAttribute("dir", dir);
    b.style.textAlign = dir === "rtl" ? "right" : "left";
  });
  markDirty();
}

/* ---------- block format ---------- */
function setBlockFormat(tag) {
  exec("formatBlock", "<" + tag.toUpperCase() + ">");
}

/* ---------- inline code ---------- */
function toggleInlineCode() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  // unwrap if already inside <code>
  let n = range.startContainer;
  while (n && n !== editor) {
    if (n.nodeType === 1 && n.tagName === "CODE" && !n.closest("pre")) {
      const parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
      markDirty();
      return;
    }
    n = n.parentNode;
  }
  const code = document.createElement("code");
  try {
    range.surroundContents(code);
  } catch (e) {
    code.appendChild(range.extractContents());
    range.insertNode(code);
  }
  markDirty();
}

/* ---------- insert helpers ---------- */
function insertHtmlAtCursor(html) {
  editor.focus();
  document.execCommand("insertHTML", false, html);
  markDirty();
}

function insertLink() {
  const url = prompt(t("link_prompt"), "https://");
  if (url) exec("createLink", url);
}

function insertImage() {
  const url = prompt(t("image_prompt"), "");
  if (url) {
    exec("insertImage", url);
  } else if (url === null) {
    // user cancelled → offer local file picker
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => exec("insertImage", r.result); // data URL → embedded
      r.readAsDataURL(f);
    };
    inp.click();
  }
}

function insertTable(rows, cols) {
  let html = "<table><tbody>";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      html += r === 0 ? "<th><br></th>" : "<td><br></td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table><p><br></p>";
  insertHtmlAtCursor(html);
}

/* ---------- code zones ---------- */
function insertCodeZone(lang) {
  const pre = '<pre class="code-zone" data-lang="' + lang +
    '" dir="ltr" spellcheck="false"><code class="language-' + lang +
    '">// code</code></pre><p><br></p>';
  insertHtmlAtCursor(pre);
}

/* While editing a code zone keep it plain text; highlight when leaving it. */
let activeCodeZone = null;

function plainifyCodeZone(pre) {
  const code = pre.querySelector("code");
  if (!code) return;
  const text = code.textContent;
  code.textContent = text;
  code.className = "language-" + (pre.dataset.lang || "plaintext");
}

function highlightCodeZone(pre) {
  const code = pre.querySelector("code");
  if (!code || typeof hljs === "undefined") return;
  const lang = pre.dataset.lang || "plaintext";
  const text = code.textContent;
  try {
    const res = hljs.getLanguage(lang)
      ? hljs.highlight(text, { language: lang })
      : hljs.highlightAuto(text);
    code.innerHTML = res.value;
    code.className = "hljs language-" + lang;
  } catch (e) { /* keep plain */ }
}

function highlightAllCodeZones(root = editor) {
  root.querySelectorAll("pre.code-zone").forEach(highlightCodeZone);
}

editor.addEventListener("focusin", () => trackCodeZone());
editor.addEventListener("click", () => trackCodeZone());
editor.addEventListener("keyup", () => trackCodeZone());

function trackCodeZone() {
  const sel = window.getSelection();
  let zone = null;
  if (sel.rangeCount) {
    let n = sel.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    zone = n && n.closest ? n.closest("pre.code-zone") : null;
  }
  if (zone !== activeCodeZone) {
    if (activeCodeZone) highlightCodeZone(activeCodeZone);
    if (zone) plainifyCodeZone(zone);
    activeCodeZone = zone;
  }
}

/* Tab inside code zones inserts spaces; Enter inserts newline (not new block) */
editor.addEventListener("keydown", e => {
  if (!activeCodeZone) return;
  if (e.key === "Tab") {
    e.preventDefault();
    document.execCommand("insertText", false, "    ");
  } else if (e.key === "Enter") {
    e.preventDefault();
    document.execCommand("insertText", false, "\n");
  }
});

/* ---------- paste: keep it reasonably clean ---------- */
editor.addEventListener("paste", e => {
  if (activeCodeZone) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  }
  // rich paste elsewhere is allowed (docs from Word/web keep basic formatting)
  markDirty();
});

/* ---------- status / word count ---------- */
const stWords = document.getElementById("st-words");
const stChars = document.getElementById("st-chars");
const stSave = document.getElementById("st-save");

function refreshStatus() {
  const text = editor.innerText || editor.textContent || "";
  const words = (text.trim().match(/[\p{L}\p{N}]+/gu) || []).length;
  stWords.textContent = words;
  stChars.textContent = text.replace(/\n/g, "").length;
}

let dirtyTimer = null;
function markDirty() {
  stSave.textContent = t("unsaved");
  stSave.classList.add("dirty");
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(autosave, 900);
  refreshStatus();
}

function autosave() {
  try {
    localStorage.setItem("de_autosave", editor.innerHTML);
    localStorage.setItem("de_autosave_name", currentFileName);
    localStorage.setItem("de_autosave_dir", editor.getAttribute("dir") || "ltr");
    stSave.textContent = t("saved");
    stSave.classList.remove("dirty");
  } catch (e) { /* storage full — ignore */ }
}

editor.addEventListener("input", markDirty);

/* ---------- document state ---------- */
let currentFileName = "untitled";

function setFileName(name) {
  currentFileName = name.replace(/\.[^.]+$/, "") || "untitled";
  document.getElementById("st-filename").textContent = currentFileName;
}

function newDocument() {
  if (!confirm(t("confirm_new"))) return;
  editor.innerHTML = "<p><br></p>";
  setFileName("untitled");
  markDirty();
  editor.focus();
}
