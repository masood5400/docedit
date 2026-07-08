/* ============ DocEdit — publish & share client (session/guest based) ============ */
"use strict";

function pubState(msg, isError) {
  const el = document.getElementById("pub-status");
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

function refreshAccountRow() {
  const el = document.getElementById("pub-account");
  const btnEl = document.getElementById("btn-account");
  const label = AUTH.isLoggedIn()
    ? "👤 " + AUTH.user.username
    : (t("guest_label"));
  if (el) el.textContent = label;
  if (btnEl) {
    btnEl.textContent = AUTH.isLoggedIn() ? "👤 " + AUTH.user.username : "👤";
    btnEl.title = AUTH.isLoggedIn() ? t("account") : t("login");
  }
}

function openPublish() {
  document.getElementById("pub-server").value = localStorage.getItem("de_server") || "";
  document.getElementById("pub-title").value = currentFileName;
  pubState("");
  document.getElementById("share-result").hidden = true;
  refreshAccountRow();
  loadFolderOptions().catch(() => {});
  document.getElementById("modal-publish").hidden = false;
  // gentle suggestion for guests (dismissible, once per session)
  if (!AUTH.isLoggedIn() && !sessionStorage.getItem("de_nagged")) {
    sessionStorage.setItem("de_nagged", "1");
    showAuthModal(t("guest_nag"), () => { refreshAccountRow(); loadFolderOptions().catch(() => {}); });
  }
  refreshShareList().catch(() => {});
}

function saveServerField() {
  localStorage.setItem("de_server", document.getElementById("pub-server").value.trim());
}

async function loadFolderOptions() {
  const sel = document.getElementById("pub-folder");
  sel.innerHTML = '<option value="">' + t("no_folder") + "</option>";
  if (!AUTH.isLoggedIn()) return;
  saveServerField();
  const data = await AUTH.api("/api/folders", { action: "list" });
  (data.own || []).forEach(f => {
    const o = document.createElement("option");
    o.value = f.id;
    o.textContent = "🗂 " + f.name;
    sel.appendChild(o);
  });
  const saved = localStorage.getItem("de_folder_" + currentFileName);
  if (saved) sel.value = saved;
}

function savedDocId() { return localStorage.getItem("de_docid_" + currentFileName) || null; }

async function doPublish() {
  saveServerField();
  const title = document.getElementById("pub-title").value.trim() || currentFileName;
  pubState(t("pub_working"));
  try {
    if (typeof buildToc === "function") buildToc();
    const clone = getCleanContent();
    const dir = editor.getAttribute("dir") || "ltr";
    const folderId = document.getElementById("pub-folder").value || undefined;
    if (folderId) localStorage.setItem("de_folder_" + currentFileName, folderId);
    const body = {
      action: "publish",
      title,
      docId: savedDocId(),
      html: clone.innerHTML,
      dir,
      toc: buildTocHtmlFor(clone, dir),
      fonts: CUSTOM_FONTS,
      folderId
    };
    if (!AUTH.isLoggedIn()) body.guestKey = AUTH.guestKey();
    const data = await AUTH.api("/api/publish", body);
    localStorage.setItem("de_docid_" + currentFileName, data.docId);
    pubState(t("pub_done") + " (id: " + data.docId + ")");
    document.getElementById("share-section").hidden = false;
    refreshShareList().catch(() => {});
  } catch (e) {
    pubState(t("pub_error") + e.message, true);
  }
}

async function doCreateShare() {
  const docId = savedDocId();
  if (!docId) { pubState(t("pub_first"), true); return; }
  pubState(t("pub_working"));
  try {
    const body = {
      action: "create",
      docId,
      maxOpens: Math.max(1, +document.getElementById("share-max").value || 1),
      allowComments: document.getElementById("share-comments").checked,
      guestView: document.getElementById("share-guestview").checked,
      bid: AUTH.bid()
    };
    if (!AUTH.isLoggedIn()) body.guestKey = AUTH.guestKey();
    const data = await AUTH.api("/api/share", body);
    const link = AUTH.serverBase() + "/viewer.html?t=" + data.token;
    document.getElementById("share-result").hidden = false;
    document.getElementById("share-link").value = link;
    pubState(t("share_created"));
    refreshShareList().catch(() => {});
  } catch (e) {
    pubState(t("pub_error") + e.message, true);
  }
}

async function doGrant() {
  const docId = savedDocId();
  if (!docId) { pubState(t("pub_first"), true); return; }
  if (!AUTH.isLoggedIn()) {
    showAuthModal(t("grant_needs_login"), m => { if (m) doGrant(); });
    return;
  }
  const username = document.getElementById("grant-user").value.trim();
  if (!username) return;
  const role = document.getElementById("grant-role").value;
  pubState(t("pub_working"));
  try {
    await AUTH.api("/api/share", { action: "grant", docId, username, role });
    document.getElementById("grant-user").value = "";
    pubState(t("grant_sent")); // generic — server never confirms user existence
    refreshMembers().catch(() => {});
  } catch (e) { pubState(t("pub_error") + e.message, true); }
}

async function refreshMembers() {
  const docId = savedDocId();
  const wrap = document.getElementById("member-list");
  wrap.innerHTML = "";
  if (!docId || !AUTH.isLoggedIn()) return;
  try {
    const body = { action: "members", docId };
    const data = await AUTH.api("/api/share", body);
    (data.members || []).forEach(mb => {
      const row = document.createElement("div");
      row.className = "share-row";
      const info = document.createElement("span");
      info.textContent = "👤 " + mb.username + " — " + (mb.role === "edit" ? t("role_edit") : t("role_read"));
      const rm = document.createElement("button");
      rm.textContent = "🗑";
      rm.title = t("revoke");
      rm.addEventListener("click", async () => {
        await AUTH.api("/api/share", { action: "ungrant", docId, username: mb.username });
        refreshMembers();
      });
      row.append(info, rm);
      wrap.appendChild(row);
    });
  } catch (e) { /* silent */ }
}

async function refreshShareList() {
  const docId = savedDocId();
  const wrap = document.getElementById("share-list");
  wrap.innerHTML = "";
  if (!docId || !AUTH.serverBase()) return;
  document.getElementById("share-section").hidden = false;
  try {
    const body = { action: "list", docId };
    if (!AUTH.isLoggedIn()) body.guestKey = AUTH.guestKey();
    const data = await AUTH.api("/api/share", body);
    (data.shares || []).forEach(s => {
      const row = document.createElement("div");
      row.className = "share-row";
      const info = document.createElement("span");
      info.textContent = "…" + s.token.slice(-6) + " — " + s.used + "/" + s.max + " " + t("opens") +
        (s.allowComments ? " 💬" : "") + (s.guestView ? "" : " 🔒" + t("login_only"));
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "📋";
      copyBtn.title = t("copy_link");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(AUTH.serverBase() + "/viewer.html?t=" + s.token)
          .then(() => pubState(t("copied")));
      });
      const revokeBtn = document.createElement("button");
      revokeBtn.textContent = "🗑";
      revokeBtn.title = t("revoke");
      revokeBtn.addEventListener("click", async () => {
        const body2 = { action: "revoke", docId, token: s.token };
        if (!AUTH.isLoggedIn()) body2.guestKey = AUTH.guestKey();
        await AUTH.api("/api/share", body2);
        refreshShareList();
      });
      row.append(info, copyBtn, revokeBtn);
      wrap.appendChild(row);
    });
    refreshMembers().catch(() => {});
  } catch (e) { /* silent */ }
}

function copyShareLink() {
  const inp = document.getElementById("share-link");
  inp.select();
  navigator.clipboard.writeText(inp.value).then(() => pubState(t("copied")));
}

function accountButtonClick() {
  if (AUTH.isLoggedIn()) {
    if (confirm(t("logout_confirm") + " (" + AUTH.user.username + ")")) {
      AUTH.logout();
      refreshAccountRow();
    }
  } else {
    showAuthModal("", () => refreshAccountRow());
  }
}

function initPublishUI() {
  document.getElementById("btn-publish").addEventListener("click", openPublish);
  document.getElementById("btn-account").addEventListener("click", accountButtonClick);
  document.getElementById("btn-dashboard").addEventListener("click", () => {
    saveServerField && document.getElementById("pub-server") && saveServerField();
    location.href = "dashboard.html";
  });
  document.getElementById("pub-ok").addEventListener("click", doPublish);
  document.getElementById("share-create").addEventListener("click", doCreateShare);
  document.getElementById("share-copy").addEventListener("click", copyShareLink);
  document.getElementById("grant-ok").addEventListener("click", doGrant);
  refreshAccountRow();
}

/* re-open a published doc for editing: index.html?doc=<id> */
async function maybeLoadRemoteDoc() {
  const id = new URLSearchParams(location.search).get("doc");
  if (!id) return;
  try {
    const body = { action: "get", docId: id };
    if (!AUTH.isLoggedIn()) body.guestKey = AUTH.guestKey();
    const data = await AUTH.api("/api/publish", body);
    const d = data.doc;
    adoptDocFonts(d.fonts);
    editor.innerHTML = d.html;
    editor.setAttribute("dir", d.dir || "ltr");
    normalizeImportedCode();
    highlightAllCodeZones();
    setFileName(d.title || "document");
    localStorage.setItem("de_docid_" + currentFileName, d.id);
    buildToc();
    refreshStatus();
  } catch (e) {
    alert(t("pub_error") + e.message);
  }
}
