/* ============ DocEdit — settings: digits enforcement + page size ============ */
"use strict";

const PAGE_SIZES = {
  a4:     { label: "A4 (210×297)",     w: 794,  h: 1123, jspdf: "a4",     css: "A4" },
  a5:     { label: "A5 (148×210)",     w: 559,  h: 794,  jspdf: "a5",     css: "A5" },
  letter: { label: "Letter (216×279)", w: 816,  h: 1056, jspdf: "letter", css: "letter" },
  legal:  { label: "Legal (216×356)",  w: 816,  h: 1344, jspdf: "legal",  css: "legal" },
  wide:   { label: "Wide / عریض",      w: 1123, h: 794,  jspdf: [297, 210], css: "A4 landscape" }
};

const DEFAULT_SETTINGS = {
  digits: "off",      // "off" | "fa" | "en"
  pageSize: "a4",
  exportToc: true
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS,
  JSON.parse(localStorage.getItem("de_settings") || "{}"));

function saveSettings() {
  localStorage.setItem("de_settings", JSON.stringify(SETTINGS));
}

/* ---------- digit conversion ---------- */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EN_DIGITS = "0123456789";

function convertDigits(str, mode) {
  if (mode === "fa") {
    return str.replace(/[0-9٠-٩]/g, ch => {
      const i = EN_DIGITS.indexOf(ch);
      if (i > -1) return FA_DIGITS[i];
      return FA_DIGITS[AR_DIGITS.indexOf(ch)];
    });
  }
  if (mode === "en") {
    return str.replace(/[۰-۹٠-٩]/g, ch => {
      const i = FA_DIGITS.indexOf(ch);
      if (i > -1) return EN_DIGITS[i];
      return EN_DIGITS[AR_DIGITS.indexOf(ch)];
    });
  }
  return str;
}

/* Convert all text nodes in root, skipping code zones & inline code.
   1:1 mapping keeps caret offsets valid. */
function enforceDigits(root = editor) {
  const mode = SETTINGS.digits;
  if (mode === "off") return;

  const sel = window.getSelection();
  const anchor = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  const aNode = anchor ? anchor.startContainer : null;
  const aOff = anchor ? anchor.startOffset : 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentNode;
      if (p && p.closest && p.closest("pre, code")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let changedAnchor = false;
  let n;
  while ((n = walker.nextNode())) {
    const converted = convertDigits(n.nodeValue, mode);
    if (converted !== n.nodeValue) {
      n.nodeValue = converted;
      if (n === aNode) changedAnchor = true;
    }
  }
  // restore caret if we touched the node the caret was in
  if (changedAnchor && aNode && root.contains(aNode)) {
    try {
      const r = document.createRange();
      const off = Math.min(aOff, aNode.nodeValue.length);
      r.setStart(aNode, off);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (e) { /* ignore */ }
  }
}

let digitsTimer = null;
function scheduleDigitEnforce() {
  if (SETTINGS.digits === "off") return;
  clearTimeout(digitsTimer);
  digitsTimer = setTimeout(() => enforceDigits(), 600);
}

/* ---------- page size ---------- */
function currentPageSize() {
  return PAGE_SIZES[SETTINGS.pageSize] || PAGE_SIZES.a4;
}

function applyPageSize() {
  const ps = currentPageSize();
  const wrap = document.getElementById("page-wrap");
  wrap.style.maxWidth = ps.w + "px";
  editor.style.minHeight = ps.h + "px";
  // dynamic @page rule for printing
  let st = document.getElementById("page-size-style");
  if (!st) {
    st = document.createElement("style");
    st.id = "page-size-style";
    document.head.appendChild(st);
  }
  st.textContent = "@page { size: " + ps.css + "; margin: 18mm; }";
}

/* ---------- settings modal wiring (elements exist in index.html) ---------- */
function openSettings() {
  document.getElementById("set-digits").value = SETTINGS.digits;
  document.getElementById("set-pagesize").value = SETTINGS.pageSize;
  document.getElementById("set-exporttoc").checked = !!SETTINGS.exportToc;
  document.getElementById("modal-settings").hidden = false;
}

function initSettingsUI() {
  const psSel = document.getElementById("set-pagesize");
  for (const [key, ps] of Object.entries(PAGE_SIZES)) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = ps.label;
    psSel.appendChild(o);
  }
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("set-ok").addEventListener("click", () => {
    SETTINGS.digits = document.getElementById("set-digits").value;
    SETTINGS.pageSize = document.getElementById("set-pagesize").value;
    SETTINGS.exportToc = document.getElementById("set-exporttoc").checked;
    saveSettings();
    applyPageSize();
    enforceDigits();
    if (typeof buildToc === "function") buildToc();
    document.getElementById("modal-settings").hidden = true;
    markDirty();
  });
}
