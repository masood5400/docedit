/* ============ DocEdit — app glue: fonts, toolbar, theme, language ============ */
"use strict";

/* ---------- Google Fonts ---------- */
const GOOGLE_FONTS = [
  // LTR / Latin
  { name: "Inter", cat: "sans" },
  { name: "Roboto", cat: "sans" },
  { name: "Open Sans", cat: "sans" },
  { name: "Poppins", cat: "sans" },
  { name: "Montserrat", cat: "sans" },
  { name: "Nunito", cat: "sans" },
  { name: "Lora", cat: "serif" },
  { name: "Merriweather", cat: "serif" },
  { name: "Playfair Display", cat: "serif" },
  { name: "PT Serif", cat: "serif" },
  // RTL — Persian / Arabic
  { name: "Vazirmatn", cat: "rtl" },
  { name: "Noto Naskh Arabic", cat: "rtl" },
  { name: "Noto Kufi Arabic", cat: "rtl" },
  { name: "Amiri", cat: "rtl" },
  { name: "Cairo", cat: "rtl" },
  { name: "IBM Plex Sans Arabic", cat: "rtl" },
  { name: "Markazi Text", cat: "rtl" },
  { name: "Lalezar", cat: "rtl" },
  // Monospace
  { name: "JetBrains Mono", cat: "mono" },
  { name: "Fira Code", cat: "mono" },
  { name: "Source Code Pro", cat: "mono" },
  { name: "Roboto Mono", cat: "mono" }
];

const loadedFonts = new Set(["Inter", "Vazirmatn", "JetBrains Mono"]);

function loadGoogleFont(family) {
  if (loadedFonts.has(family)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.gf = family;
  link.href = "https://fonts.googleapis.com/css2?family=" +
    encodeURIComponent(family).replace(/%20/g, "+") +
    ":wght@400;700&display=swap";
  document.head.appendChild(link);
  loadedFonts.add(family);
}

function buildFontSelect() {
  const sel = document.getElementById("sel-font");
  const groups = { sans: "Sans", serif: "Serif", rtl: "فارسی / عربی (RTL)", mono: "Mono" };
  for (const [cat, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    GOOGLE_FONTS.filter(f => f.cat === cat).forEach(f => {
      const o = document.createElement("option");
      o.value = f.name;
      o.textContent = f.name;
      og.appendChild(o);
    });
    sel.appendChild(og);
  }
  sel.value = "Inter";
  sel.addEventListener("change", () => {
    loadGoogleFont(sel.value);
    exec("fontName", sel.value);
  });
}

/* ---------- toolbar wiring ---------- */
function wireToolbar() {
  // simple execCommand buttons
  document.querySelectorAll("[data-cmd]").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault()); // keep selection
    btn.addEventListener("click", () => exec(btn.dataset.cmd));
  });

  document.getElementById("btn-new").addEventListener("click", newDocument);
  document.getElementById("btn-open").addEventListener("click", openFilePicker);

  // export dropdown
  const dd = document.getElementById("btn-export").parentElement;
  document.getElementById("btn-export").addEventListener("click", e => {
    e.stopPropagation();
    dd.classList.toggle("open");
  });
  document.addEventListener("click", () => dd.classList.remove("open"));
  document.getElementById("export-menu").addEventListener("click", e => {
    const kind = e.target.dataset && e.target.dataset.export;
    if (kind) { dd.classList.remove("open"); doExport(kind); }
  });

  // block format / size
  document.getElementById("sel-block").addEventListener("change", e => setBlockFormat(e.target.value));
  document.getElementById("sel-size").addEventListener("change", e => exec("fontSize", e.target.value));

  // colors
  document.getElementById("color-fore").addEventListener("input", e => exec("foreColor", e.target.value));
  document.getElementById("color-back").addEventListener("input", e => exec("hiliteColor", e.target.value));

  // inline code
  document.getElementById("btn-inline-code").addEventListener("click", toggleInlineCode);

  // direction
  document.getElementById("btn-ltr").addEventListener("click", () => setBlockDirection("ltr"));
  document.getElementById("btn-rtl").addEventListener("click", () => setBlockDirection("rtl"));
  document.getElementById("btn-doc-dir").addEventListener("click", () => {
    const cur = editor.getAttribute("dir") === "rtl" ? "ltr" : "rtl";
    editor.setAttribute("dir", cur);
    markDirty();
  });

  // inserts
  document.getElementById("btn-link").addEventListener("click", insertLink);
  document.getElementById("btn-image").addEventListener("click", insertImage);
  document.getElementById("btn-table").addEventListener("click", () => showModal("modal-table"));
  document.getElementById("btn-code").addEventListener("click", () => showModal("modal-code"));

  // modals
  document.getElementById("tbl-ok").addEventListener("click", () => {
    const r = Math.max(1, +document.getElementById("tbl-rows").value || 3);
    const c = Math.max(1, +document.getElementById("tbl-cols").value || 3);
    hideModals();
    insertTable(r, c);
  });
  document.getElementById("code-ok").addEventListener("click", () => {
    const lang = document.getElementById("code-lang").value;
    hideModals();
    insertCodeZone(lang);
  });
  document.querySelectorAll("[data-close]").forEach(b =>
    b.addEventListener("click", hideModals));
  document.querySelectorAll(".modal-backdrop").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) hideModals(); }));

  // theme + language
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-lang").addEventListener("click", () => {
    toggleUiLang();
    refreshStatus();
  });

  // keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); doExport("html"); }
    else if (k === "o") { e.preventDefault(); openFilePicker(); }
    else if (k === "p") { e.preventDefault(); doExport("pdf-print"); }
  });
}

let savedSelection = null;
function showModal(id) {
  const sel = window.getSelection();
  savedSelection = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  document.getElementById(id).hidden = false;
}
function hideModals() {
  document.querySelectorAll(".modal-backdrop").forEach(m => (m.hidden = true));
  if (savedSelection) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
    savedSelection = null;
  }
  editor.focus();
}

/* ---------- floating copy button for code zones ---------- */
function initCodeCopyButton() {
  const btn = document.getElementById("code-copy-btn");
  const ws = document.getElementById("workspace");
  let target = null;

  editor.addEventListener("mouseover", e => {
    const pre = e.target.closest && e.target.closest("pre.code-zone");
    if (!pre) return;
    target = pre;
    const preRect = pre.getBoundingClientRect();
    const wsRect = ws.getBoundingClientRect();
    btn.style.top = (preRect.top - wsRect.top + ws.scrollTop + 6) + "px";
    btn.style.left = (preRect.left - wsRect.left + ws.scrollLeft + 8) + "px";
    btn.textContent = "⧉ " + t("copy_code");
    btn.hidden = false;
  });
  ws.addEventListener("mouseleave", () => { btn.hidden = true; });
  ws.addEventListener("scroll", () => { btn.hidden = true; });
  editor.addEventListener("mouseover", e => {
    if (!e.target.closest("pre.code-zone") && e.target !== btn) {
      // moved off the code zone onto normal content
      if (!btn.matches(":hover")) btn.hidden = true;
    }
  });
  btn.addEventListener("mousedown", e => e.preventDefault());
  btn.addEventListener("click", () => {
    if (!target) return;
    navigator.clipboard.writeText(target.textContent).then(() => {
      btn.textContent = "✓ " + t("copied");
      setTimeout(() => { btn.hidden = true; }, 900);
    });
  });
}

/* ---------- theme ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById("hljs-theme-light").disabled = theme === "dark";
  document.getElementById("hljs-theme-dark").disabled = theme !== "dark";
  localStorage.setItem("de_theme", theme);
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

/* ---------- init ---------- */
(function init() {
  applyTheme(localStorage.getItem("de_theme") || "light");
  applyI18n();
  buildFontSelect();
  wireToolbar();
  initSettingsUI();
  applyPageSize();
  initPublishUI();
  initCodeCopyButton();
  initFontImportUI();
  injectCustomFonts();

  // restore autosaved document
  const saved = localStorage.getItem("de_autosave");
  if (saved && saved.trim() && saved !== "<p><br></p>") {
    editor.innerHTML = saved;
    editor.setAttribute("dir", localStorage.getItem("de_autosave_dir") || "ltr");
    const name = localStorage.getItem("de_autosave_name");
    if (name) setFileName(name);
    normalizeImportedCode();
    highlightAllCodeZones();
  }
  initToc();
  editor.addEventListener("input", scheduleDigitEnforce);
  refreshStatus();
  maybeLoadRemoteDoc();
})();
