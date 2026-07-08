/* ============ DocEdit — smart table of contents ============ */
"use strict";

let tocIdCounter = 1;

/* Detect heading-like elements:
   - real h1..h6
   - "smart": a short paragraph whose entire text is bold → treated as level 4 */
function collectHeadings(root = editor) {
  const out = [];
  root.querySelectorAll("h1,h2,h3,h4,h5,h6,p").forEach(el => {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const text = el.textContent.trim();
      if (text) out.push({ el, level: +tag[1], text });
    } else {
      // smart detection: fully-bold short paragraph
      const text = el.textContent.trim();
      if (!text || text.length > 80) return;
      const b = el.querySelector("b,strong");
      if (b && b.textContent.trim() === text && !el.closest("li,blockquote,td,th")) {
        out.push({ el, level: 4, text });
      }
    }
  });
  return out;
}

function ensureHeadingIds(headings) {
  headings.forEach(h => {
    if (!h.el.id) h.el.id = "sec-" + tocIdCounter++;
    h.id = h.el.id;
  });
}

/* ---------- sidebar ---------- */
function buildToc() {
  const list = document.getElementById("toc-list");
  if (!list) return;
  const headings = collectHeadings();
  ensureHeadingIds(headings);
  list.innerHTML = "";
  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "toc-empty";
    empty.textContent = t("toc_empty");
    list.appendChild(empty);
    return;
  }
  const minLevel = Math.min(...headings.map(h => h.level));
  headings.forEach(h => {
    const item = document.createElement("button");
    item.className = "toc-item lvl-" + Math.min(h.level - minLevel, 4);
    item.textContent = h.text.length > 60 ? h.text.slice(0, 57) + "…" : h.text;
    item.dataset.target = h.id;
    item.addEventListener("click", () => {
      const target = document.getElementById(h.id);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("toc-flash");
        setTimeout(() => target.classList.remove("toc-flash"), 1200);
      }
    });
    list.appendChild(item);
  });
  updateTocActive();
}

let tocTimer = null;
function scheduleTocRebuild() {
  clearTimeout(tocTimer);
  tocTimer = setTimeout(buildToc, 800);
}

/* scrollspy: highlight the section currently in view */
function updateTocActive() {
  const list = document.getElementById("toc-list");
  const ws = document.getElementById("workspace");
  if (!list || !ws) return;
  const items = list.querySelectorAll(".toc-item");
  if (!items.length) return;
  const wsTop = ws.getBoundingClientRect().top;
  let current = null;
  items.forEach(it => {
    const target = document.getElementById(it.dataset.target);
    if (target && target.getBoundingClientRect().top - wsTop < 80) current = it;
  });
  items.forEach(it => it.classList.toggle("active", it === current));
}

function initToc() {
  const panel = document.getElementById("toc-panel");
  const btn = document.getElementById("btn-toc");
  const visible = localStorage.getItem("de_toc") !== "0";
  panel.classList.toggle("hidden", !visible);
  btn.classList.toggle("active", visible);
  btn.addEventListener("click", () => {
    const nowHidden = panel.classList.toggle("hidden");
    btn.classList.toggle("active", !nowHidden);
    localStorage.setItem("de_toc", nowHidden ? "0" : "1");
  });
  document.getElementById("workspace").addEventListener("scroll", () => {
    requestAnimationFrame(updateTocActive);
  });
  editor.addEventListener("input", scheduleTocRebuild);
  buildToc();
}

/* ---------- TOC for exports ---------- */
function buildTocHtmlFor(clone, dir) {
  const headings = [];
  clone.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(el => {
    const text = el.textContent.trim();
    if (text && el.id) headings.push({ id: el.id, level: +el.tagName[1], text });
  });
  if (headings.length < 2 || !SETTINGS.exportToc) return "";
  const minLevel = Math.min(...headings.map(h => h.level));
  const title = dir === "rtl" ? "فهرست مطالب" : "Contents";
  let html = '<nav class="toc" dir="' + dir + '"><div class="toc-title">' + title + "</div><ul>";
  headings.forEach(h => {
    const esc = h.text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    html += '<li class="toc-l' + Math.min(h.level - minLevel, 4) + '"><a href="#' + h.id + '">' + esc + "</a></li>";
  });
  html += "</ul></nav>";
  return html;
}
