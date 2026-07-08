/* ============ DocEdit — publish & share (Vercel serverless backend) ============ */
"use strict";

function apiBase() {
  let base = document.getElementById("pub-server").value.trim();
  if (!base) {
    // when hosted on Vercel itself, same origin works
    if (location.protocol.startsWith("http") && !/localhost|127\.0\.0\.1/.test(location.host)) {
      base = location.origin;
    }
  }
  return base.replace(/\/+$/, "");
}

async function api(path, opts = {}) {
  const base = apiBase();
  if (!base) throw new Error(t("pub_need_server"));
  const res = await fetch(base + path, Object.assign({
    headers: { "content-type": "application/json" }
  }, opts));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

function pubState(msg, isError) {
  const el = document.getElementById("pub-status");
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

function openPublish() {
  document.getElementById("pub-server").value = localStorage.getItem("de_server") || "";
  document.getElementById("pub-pass").value = localStorage.getItem("de_pass") || "";
  document.getElementById("pub-title").value = currentFileName;
  pubState("");
  document.getElementById("share-result").hidden = true;
  document.getElementById("modal-publish").hidden = false;
  refreshShareList().catch(() => {});
}

function savedDocId() {
  return localStorage.getItem("de_docid_" + currentFileName) || null;
}

async function doPublish() {
  const password = document.getElementById("pub-pass").value;
  const title = document.getElementById("pub-title").value.trim() || currentFileName;
  if (!password) { pubState(t("pub_need_pass"), true); return; }
  localStorage.setItem("de_server", document.getElementById("pub-server").value.trim());
  localStorage.setItem("de_pass", password);
  pubState(t("pub_working"));
  try {
    if (typeof buildToc === "function") buildToc(); // ensure heading ids
    const clone = getCleanContent();
    const dir = editor.getAttribute("dir") || "ltr";
    const data = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({
        password, title,
        docId: savedDocId(),
        html: clone.innerHTML,
        dir,
        toc: buildTocHtmlFor(clone, dir)
      })
    });
    localStorage.setItem("de_docid_" + currentFileName, data.docId);
    pubState(t("pub_done") + " (id: " + data.docId + ")");
    document.getElementById("share-section").hidden = false;
    refreshShareList().catch(() => {});
  } catch (e) {
    pubState(t("pub_error") + e.message, true);
  }
}

async function doCreateShare() {
  const password = document.getElementById("pub-pass").value;
  const docId = savedDocId();
  if (!docId) { pubState(t("pub_first"), true); return; }
  const maxOpens = Math.max(1, +document.getElementById("share-max").value || 1);
  const allowComments = document.getElementById("share-comments").checked;
  pubState(t("pub_working"));
  try {
    const data = await api("/api/share", {
      method: "POST",
      body: JSON.stringify({ password, docId, maxOpens, allowComments })
    });
    const link = apiBase() + "/viewer.html?t=" + data.token;
    const box = document.getElementById("share-result");
    box.hidden = false;
    document.getElementById("share-link").value = link;
    pubState(t("share_created"));
    refreshShareList().catch(() => {});
  } catch (e) {
    pubState(t("pub_error") + e.message, true);
  }
}

function copyShareLink() {
  const inp = document.getElementById("share-link");
  inp.select();
  navigator.clipboard.writeText(inp.value).then(() => pubState(t("copied")));
}

async function refreshShareList() {
  const docId = savedDocId();
  const password = document.getElementById("pub-pass").value;
  const wrap = document.getElementById("share-list");
  if (!docId || !password || !apiBase()) { wrap.innerHTML = ""; return; }
  document.getElementById("share-section").hidden = false;
  try {
    const data = await api("/api/share?docId=" + encodeURIComponent(docId) +
      "&password=" + encodeURIComponent(password));
    wrap.innerHTML = "";
    (data.shares || []).forEach(s => {
      const row = document.createElement("div");
      row.className = "share-row";
      const info = document.createElement("span");
      info.textContent = "…" + s.token.slice(-6) + " — " + s.used + "/" + s.max +
        " " + t("opens") + (s.allowComments ? " 💬" : "");
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "📋";
      copyBtn.title = t("copy_link");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(apiBase() + "/viewer.html?t=" + s.token)
          .then(() => pubState(t("copied")));
      });
      const revokeBtn = document.createElement("button");
      revokeBtn.textContent = "🗑";
      revokeBtn.title = t("revoke");
      revokeBtn.addEventListener("click", async () => {
        try {
          await api("/api/share", {
            method: "DELETE",
            body: JSON.stringify({ password, token: s.token })
          });
          refreshShareList();
        } catch (e) { pubState(t("pub_error") + e.message, true); }
      });
      row.append(info, copyBtn, revokeBtn);
      wrap.appendChild(row);
    });
  } catch (e) { /* silent — list is optional */ }
}

function initPublishUI() {
  document.getElementById("btn-publish").addEventListener("click", openPublish);
  document.getElementById("pub-ok").addEventListener("click", doPublish);
  document.getElementById("share-create").addEventListener("click", doCreateShare);
  document.getElementById("share-copy").addEventListener("click", copyShareLink);
}
