/* ============ DocEdit — viewer: anchored comments, replies, done/dismiss, mentions ============ */
"use strict";

const params = new URLSearchParams(location.search);
const TOKEN = params.get("t") || "";
const DIRECT_DOC = params.get("d") || "";
const BID = AUTH.bid();

let DOC = null;        // server payload
let THREADS = [];      // comment threads
let MEMBERS = [];      // usernames for @mentions
let PENDING_ANCHOR = null;

const $ = id => document.getElementById(id);

function accessBody(extra) {
  const b = TOKEN ? { token: TOKEN, bid: BID } : { docId: DIRECT_DOC };
  return Object.assign(b, extra || {});
}

function showState(icon, faMsg, enMsg, withLogin) {
  $("content").innerHTML =
    '<div class="state"><div class="icon">' + icon + "</div>" +
    "<h2>" + faMsg + "</h2><p>" + enMsg + "</p>" +
    (withLogin ? '<button class="btn-login" id="state-login">ورود / ثبت‌نام</button>' : "") +
    "</div>";
  $("doc-title").textContent = "DocEdit";
  if (withLogin) {
    $("state-login").addEventListener("click", () =>
      showAuthModal("برای دیدن این سند باید وارد شوی.", m => { if (m) loadDoc(); }));
  }
}

/* ---------------- load & render ---------------- */
async function loadDoc() {
  if (!TOKEN && !DIRECT_DOC) {
    showState("🔗", "لینک نامعتبر است", "Invalid link.");
    return;
  }
  let res, data;
  try {
    const qs = TOKEN
      ? "token=" + encodeURIComponent(TOKEN) + "&bid=" + BID
      : "docId=" + encodeURIComponent(DIRECT_DOC);
    res = await fetch((AUTH.serverBase() || "") + "/api/doc?" + qs, { headers: AUTH.headers() });
    data = await res.json();
  } catch (e) {
    showState("⚠️", "خطا در ارتباط با سرور", "Could not reach the server.");
    return;
  }
  if (!res.ok) {
    if (data.error === "login_required") {
      showState("🔐", "این سند فقط برای کاربران واردشده باز می‌شود", "Sign in to view this document.", true);
    } else if (data.error === "link_limit_reached") {
      showState("🔒", "ظرفیت این لینک تکمیل شده", "This link reached its maximum unique readers.");
    } else if (data.error === "link_not_found" || data.error === "not_found") {
      showState("🚫", "این لینک باطل شده یا وجود ندارد", "Revoked or nonexistent link.");
    } else {
      showState("⚠️", "خطا", data.error || "Unknown error");
    }
    return;
  }

  DOC = data;
  document.title = data.title + " — DocEdit";
  $("doc-title").textContent = data.title;
  document.documentElement.dir = data.dir || "ltr";

  // custom fonts travelling with the doc
  if (Array.isArray(data.fonts) && data.fonts.length) {
    const st = document.createElement("style");
    st.textContent = data.fonts.map(f =>
      `@font-face{font-family:"${String(f.name).replace(/"/g, "")}";src:url(${f.data});font-display:swap;}`
    ).join("\n");
    document.head.appendChild(st);
  }

  const holder = document.createElement("article");
  holder.className = "doc";
  holder.id = "doc-body";
  holder.dir = data.dir || "ltr";
  holder.innerHTML = (data.toc || "") + data.html;
  $("content").innerHTML = "";
  $("content").appendChild(holder);

  holder.querySelectorAll("pre.code-zone").forEach(pre => {
    const code = pre.querySelector("code");
    if (code && typeof hljs !== "undefined" && !code.classList.contains("hljs")) {
      try { hljs.highlightElement(code); } catch (e) {}
    }
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "⧉ کپی";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.textContent.replace(/⧉ کپی|✓/g, "").trim())
        .then(() => { btn.textContent = "✓"; setTimeout(() => (btn.textContent = "⧉ کپی"), 1200); });
    });
    pre.appendChild(btn);
  });

  // guest suggestion banner (dismissible)
  if (!AUTH.isLoggedIn() && !sessionStorage.getItem("de_viewer_nag")) {
    const bar = document.createElement("div");
    bar.className = "login-banner";
    bar.innerHTML = '<span>👤 برای کامنت‌گذاری و دسترسی همیشگی، وارد شو / ثبت‌نام کن (۱۰ ثانیه)</span>';
    const b1 = document.createElement("button");
    b1.textContent = "ورود";
    b1.addEventListener("click", () => showAuthModal("", m => { if (m) location.reload(); }));
    const b2 = document.createElement("button");
    b2.className = "ghost";
    b2.textContent = "بعدا";
    b2.addEventListener("click", () => { bar.remove(); sessionStorage.setItem("de_viewer_nag", "1"); });
    bar.append(b1, b2);
    $("content").prepend(bar);
  }

  if (DOC.allowComments || DOC.role === "owner" || DOC.isOwner) {
    $("comments-panel").hidden = false;
    initSelectionCommenting(holder);
    await refreshThreads();
    loadMembers();
  }
}

/* ---------------- anchoring (text-quote, like hypothes.is) ---------------- */
function captureAnchorFromSelection(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const quote = sel.toString().trim();
  if (!quote || quote.length > 500) return null;
  // prefix/suffix from full text around the selection
  const full = root.textContent;
  const selText = sel.toString();
  // locate this occurrence: walk backwards from range start
  const pre = document.createRange();
  pre.setStart(root, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  return {
    quote: selText,
    prefix: before.slice(-40),
    suffix: full.slice(before.length + selText.length, before.length + selText.length + 40)
  };
}

/* find [start,end) of anchor in root text; -1 if not found */
function locateAnchor(root, anchor) {
  const full = root.textContent;
  if (!anchor.quote) return -1;
  // best: prefix+quote+suffix
  let i = full.indexOf(anchor.prefix + anchor.quote + anchor.suffix);
  if (i > -1 && anchor.prefix) return i + anchor.prefix.length;
  i = full.indexOf(anchor.quote + (anchor.suffix || ""));
  if (i > -1) return i;
  return full.indexOf(anchor.quote);
}

/* wrap text range [start, start+len) in <mark> elements (may span nodes) */
function highlightRange(root, start, len, cid, status) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0, node;
  const jobs = [];
  while ((node = walker.nextNode())) {
    const nLen = node.nodeValue.length;
    const nStart = pos, nEnd = pos + nLen;
    const s = Math.max(start, nStart), e = Math.min(start + len, nEnd);
    if (s < e) jobs.push({ node, from: s - nStart, to: e - nStart });
    pos = nEnd;
    if (nEnd >= start + len) break;
  }
  jobs.forEach(({ node, from, to }) => {
    const r = document.createRange();
    r.setStart(node, from);
    r.setEnd(node, to);
    const mark = document.createElement("mark");
    mark.className = "c-hl" + (status !== "open" ? " c-faded" : "");
    mark.dataset.cid = cid;
    try { r.surroundContents(mark); } catch (e) { /* partial node overlaps — skip */ }
  });
}

function clearHighlights(root) {
  root.querySelectorAll("mark.c-hl").forEach(m => {
    const p = m.parentNode;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}

function applyAllHighlights() {
  const root = $("doc-body");
  if (!root) return;
  clearHighlights(root);
  // longest quotes first so nested/overlapping anchors still find their text
  [...THREADS]
    .filter(c => c.quote && c.status !== "dismissed")
    .sort((a, b) => b.quote.length - a.quote.length)
    .forEach(c => {
      const at = locateAnchor(root, c);
      if (at > -1) highlightRange(root, at, c.quote.length, c.id, c.status);
    });
}

/* ---------------- selection → comment button ---------------- */
function initSelectionCommenting(root) {
  const fab = $("comment-fab");
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (sel.isCollapsed || !root.contains(sel.anchorNode)) { fab.hidden = true; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { fab.hidden = true; return; }
    fab.style.top = (rect.top + window.scrollY - 42) + "px";
    fab.style.left = (rect.left + window.scrollX + rect.width / 2 - 20) + "px";
    fab.hidden = false;
  });
  fab.addEventListener("mousedown", e => {
    e.preventDefault();
    const anchor = captureAnchorFromSelection(root);
    if (!anchor) return;
    if (!AUTH.isLoggedIn()) {
      showAuthModal("برای کامنت گذاشتن باید وارد شوی — سریع است.", m => {
        if (m) { PENDING_ANCHOR = anchor; openComposer(anchor); refreshThreads(); }
      });
      return;
    }
    PENDING_ANCHOR = anchor;
    openComposer(anchor);
  });
}

function openComposer(anchor) {
  $("composer").hidden = false;
  $("composer-quote").textContent = "«" + anchor.quote.slice(0, 80) + (anchor.quote.length > 80 ? "…" : "") + "»";
  $("composer-text").value = "";
  $("composer-text").focus();
}

/* ---------------- mentions ---------------- */
async function loadMembers() {
  try {
    const data = await AUTH.api("/api/comment", accessBody({ action: "members" }));
    MEMBERS = data.members || [];
  } catch (e) { MEMBERS = []; }
}

function wireMentions(textarea, box) {
  textarea.addEventListener("input", () => {
    const v = textarea.value;
    const at = v.lastIndexOf("@");
    if (at === -1 || (at > 0 && !/\s/.test(v[at - 1]))) { box.hidden = true; return; }
    const term = v.slice(at + 1).toLowerCase();
    if (/\s/.test(term)) { box.hidden = true; return; }
    const hits = MEMBERS.filter(m => m.toLowerCase().startsWith(term)).slice(0, 6);
    if (!hits.length) { box.hidden = true; return; }
    box.innerHTML = "";
    hits.forEach(m => {
      const b = document.createElement("button");
      b.textContent = "@" + m;
      b.addEventListener("mousedown", e => {
        e.preventDefault();
        textarea.value = v.slice(0, at) + "@" + m + " ";
        box.hidden = true;
        textarea.focus();
      });
      box.appendChild(b);
    });
    box.hidden = false;
  });
  textarea.addEventListener("blur", () => setTimeout(() => (box.hidden = true), 200));
}

function extractMentions(text) {
  return [...text.matchAll(/@([a-z0-9_.-]{3,32})/gi)].map(m => m[1].toLowerCase()).slice(0, 10);
}

/* ---------------- threads panel ---------------- */
async function refreshThreads() {
  try {
    const data = await AUTH.api("/api/comment", accessBody({ action: "list" }));
    THREADS = data.comments || [];
    DOC.isDocOwner = data.isDocOwner;
    DOC.canComment = data.canComment;
    DOC.me = data.me;
    renderThreads();
    applyAllHighlights();
  } catch (e) { /* guests without access to list — leave silent */ }
}

function fmtTime(ts) {
  try { return new Date(ts).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }); }
  catch (e) { return ""; }
}

function renderMentionsText(text) {
  const span = document.createElement("span");
  text.split(/(@[a-z0-9_.-]{3,32})/gi).forEach(part => {
    if (/^@[a-z0-9_.-]{3,32}$/i.test(part)) {
      const b = document.createElement("b");
      b.className = "mention";
      b.textContent = part;
      span.appendChild(b);
    } else {
      span.appendChild(document.createTextNode(part));
    }
  });
  return span;
}

function renderThreads() {
  const list = $("thread-list");
  list.innerHTML = "";
  const open = THREADS.filter(c => c.status === "open");
  const closed = THREADS.filter(c => c.status !== "open");
  $("threads-count").textContent = open.length;

  [...open, ...closed].forEach(c => {
    const div = document.createElement("div");
    div.className = "thread" + (c.status !== "open" ? " closed" : "");
    div.dataset.cid = c.id;

    if (c.quote) {
      const q = document.createElement("div");
      q.className = "t-quote";
      q.textContent = "«" + c.quote.slice(0, 70) + (c.quote.length > 70 ? "…" : "") + "»";
      q.addEventListener("click", () => {
        const mk = document.querySelector('mark.c-hl[data-cid="' + c.id + '"]');
        if (mk) { mk.scrollIntoView({ behavior: "smooth", block: "center" }); mk.classList.add("c-pulse"); setTimeout(() => mk.classList.remove("c-pulse"), 1500); }
      });
      div.appendChild(q);
    }

    const head = document.createElement("div");
    head.className = "t-head";
    head.innerHTML = "<b>" + c.author.username + "</b> <span>" + fmtTime(c.ts) + "</span>" +
      (c.status === "done" ? ' <span class="badge done">✓ انجام شد</span>' : "") +
      (c.status === "dismissed" ? ' <span class="badge">نادیده</span>' : "");
    div.appendChild(head);

    const body = document.createElement("div");
    body.className = "t-body";
    body.appendChild(renderMentionsText(c.text));
    div.appendChild(body);

    (c.replies || []).forEach(r => {
      const rd = document.createElement("div");
      rd.className = "t-reply";
      rd.innerHTML = "<b>" + r.author.username + "</b> <span>" + fmtTime(r.ts) + "</span>";
      const rb = document.createElement("div");
      rb.appendChild(renderMentionsText(r.text));
      rd.appendChild(rb);
      div.appendChild(rd);
    });

    // actions
    const act = document.createElement("div");
    act.className = "t-actions";
    const mine = DOC.me && c.author.username === DOC.me;
    if (DOC.canComment && c.status === "open") {
      const rp = document.createElement("button");
      rp.textContent = "پاسخ";
      rp.addEventListener("click", () => toggleReplyBox(div, c.id));
      act.appendChild(rp);
    }
    if ((DOC.isDocOwner || mine) && c.status === "open") {
      const done = document.createElement("button");
      done.className = "primary";
      done.textContent = "✓ انجام شد";
      done.addEventListener("click", () => setStatus(c.id, "done"));
      const dis = document.createElement("button");
      dis.textContent = "نادیده بگیر";
      dis.addEventListener("click", () => setStatus(c.id, "dismissed"));
      act.append(done, dis);
    }
    if ((DOC.isDocOwner || mine) && c.status !== "open") {
      const reopen = document.createElement("button");
      reopen.textContent = "بازکردن دوباره";
      reopen.addEventListener("click", () => setStatus(c.id, "open"));
      act.appendChild(reopen);
    }
    if (act.children.length) div.appendChild(act);
    list.appendChild(div);
  });
}

function toggleReplyBox(threadDiv, cid) {
  let box = threadDiv.querySelector(".reply-box");
  if (box) { box.remove(); return; }
  box = document.createElement("div");
  box.className = "reply-box";
  const ta = document.createElement("textarea");
  ta.placeholder = "پاسخ… (@ برای منشن)";
  const mbox = document.createElement("div");
  mbox.className = "mention-box";
  mbox.hidden = true;
  const send = document.createElement("button");
  send.className = "primary";
  send.textContent = "ارسال";
  send.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) return;
    if (!AUTH.isLoggedIn()) { showAuthModal("برای پاسخ باید وارد شوی.", m => { if (m) send.click(); }); return; }
    try {
      await AUTH.api("/api/comment", accessBody({ action: "reply", commentId: cid, text }));
      refreshThreads();
    } catch (e) { alert("خطا: " + e.message); }
  });
  box.append(ta, mbox, send);
  wireMentions(ta, mbox);
  threadDiv.appendChild(box);
  ta.focus();
}

async function setStatus(cid, status) {
  try {
    await AUTH.api("/api/comment", accessBody({ action: "status", commentId: cid, status }));
    refreshThreads();
  } catch (e) { alert("خطا: " + e.message); }
}

async function submitComposer() {
  const text = $("composer-text").value.trim();
  if (!text || !PENDING_ANCHOR) return;
  try {
    await AUTH.api("/api/comment", accessBody({
      action: "add",
      quote: PENDING_ANCHOR.quote,
      prefix: PENDING_ANCHOR.prefix,
      suffix: PENDING_ANCHOR.suffix,
      text,
      mentions: extractMentions(text)
    }));
    $("composer").hidden = true;
    PENDING_ANCHOR = null;
    refreshThreads();
  } catch (e) {
    if (e.code === 401) showAuthModal("برای کامنت گذاشتن باید وارد شوی.", m => { if (m) submitComposer(); });
    else alert("خطا: " + e.message);
  }
}

/* ---------------- init ---------------- */
$("composer-send").addEventListener("click", submitComposer);
$("composer-cancel").addEventListener("click", () => { $("composer").hidden = true; PENDING_ANCHOR = null; });
wireMentions($("composer-text"), $("composer-mentions"));
$("viewer-account").addEventListener("click", () => {
  if (AUTH.isLoggedIn()) {
    if (confirm("خروج از حساب " + AUTH.user.username + "؟")) { AUTH.logout(); location.reload(); }
  } else {
    showAuthModal("", m => { if (m) location.reload(); });
  }
});
if (AUTH.isLoggedIn()) $("viewer-account").textContent = "👤 " + AUTH.user.username;

loadDoc();
