/* ============ DocEdit — dashboard: folders, docs, sharing ============ */
"use strict";

const $ = id => document.getElementById(id);

function accountLabel() {
  $("dash-account").textContent = AUTH.isLoggedIn() ? "👤 " + AUTH.user.username : "👤 ورود";
}

$("dash-account").addEventListener("click", () => {
  if (AUTH.isLoggedIn()) {
    if (confirm("خروج از حساب " + AUTH.user.username + "؟")) { AUTH.logout(); location.reload(); }
  } else {
    showAuthModal("", m => { if (m) location.reload(); });
  }
});

$("dash-server").value = localStorage.getItem("de_server") || "";
$("dash-server-save").addEventListener("click", () => {
  localStorage.setItem("de_server", $("dash-server").value.trim());
  loadAll();
});

function rowEl(cls = "row") {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

async function loadAll() {
  accountLabel();
  if (!AUTH.isLoggedIn()) {
    showAuthModal("برای مدیریت پوشه‌ها و اسنادت وارد شو.", m => { if (m) loadAll(); });
    return;
  }
  loadFolders();
  loadDocs();
}

/* ---------------- folders ---------------- */
async function loadFolders() {
  const wrap = $("folder-list");
  const shared = $("shared-list");
  try {
    const data = await AUTH.api("/api/folders", { action: "list" });
    wrap.innerHTML = "";
    if (!data.own.length) wrap.innerHTML = '<div class="empty">هنوز پوشه‌ای نداری.</div>';
    data.own.forEach(f => {
      const row = rowEl();
      const name = document.createElement("span");
      name.className = "grow";
      name.textContent = "📁 " + f.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = f.members ? f.members + " کاربر" : "";
      const shareBtn = document.createElement("button");
      shareBtn.className = "act";
      shareBtn.textContent = "🤝 اشتراک";
      shareBtn.addEventListener("click", async () => {
        const u = prompt("نام کاربری گیرنده:");
        if (!u) return;
        const role = confirm("اجازه ویرایش هم داشته باشد؟ (OK=ویرایش، Cancel=فقط خواندن)") ? "edit" : "read";
        await AUTH.api("/api/folders", { action: "share", folderId: f.id, username: u, role });
        alert("ثبت شد. اگر این نام کاربری وجود داشته باشد، دسترسی گرفت.");
        loadFolders();
      });
      const renameBtn = document.createElement("button");
      renameBtn.className = "act";
      renameBtn.textContent = "✏️";
      renameBtn.addEventListener("click", async () => {
        const n = prompt("نام جدید:", f.name);
        if (n) { await AUTH.api("/api/folders", { action: "rename", folderId: f.id, name: n }); loadFolders(); }
      });
      const delBtn = document.createElement("button");
      delBtn.className = "act";
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", async () => {
        if (confirm("پوشه حذف شود؟ (اسناد داخل آن حذف نمی‌شوند)")) {
          await AUTH.api("/api/folders", { action: "remove", folderId: f.id });
          loadFolders(); loadDocs();
        }
      });
      row.append(name, meta, shareBtn, renameBtn, delBtn);
      wrap.appendChild(row);
    });

    shared.innerHTML = "";
    const items = [...(data.shared || []).map(f => ({ ...f, kind: "folder" })),
                   ...(data.sharedDocs || []).map(d => ({ ...d, kind: "doc" }))];
    if (!items.length) shared.innerHTML = '<div class="empty">فعلا چیزی با تو به اشتراک گذاشته نشده.</div>';
    items.forEach(it => {
      const row = rowEl();
      const name = document.createElement("span");
      name.className = "grow";
      name.textContent = (it.kind === "folder" ? "📁 " : "📄 ") + (it.name || it.title);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = "از " + it.owner + " — " + (it.role === "edit" ? "ویرایش" : "خواندن");
      row.append(name, meta);
      if (it.kind === "doc") {
        const open = document.createElement("button");
        open.className = "act";
        open.textContent = "باز کردن";
        open.addEventListener("click", () => location.href = "viewer.html?d=" + it.id);
        row.appendChild(open);
        if (it.role === "edit") {
          const edit = document.createElement("button");
          edit.className = "act";
          edit.textContent = "✏️ ویرایش";
          edit.addEventListener("click", () => location.href = "index.html?doc=" + it.id);
          row.appendChild(edit);
        }
      } else {
        const open = document.createElement("button");
        open.className = "act";
        open.textContent = "دیدن اسناد";
        open.addEventListener("click", async () => {
          const d = await AUTH.api("/api/folders", { action: "docs", folderId: it.id });
          alert((d.docs || []).map(x => "📄 " + x.title).join("\n") || "پوشه خالی است");
        });
        row.appendChild(open);
      }
      shared.appendChild(row);
    });
  } catch (e) {
    wrap.innerHTML = '<div class="empty">خطا: ' + e.message + "</div>";
  }
}

$("new-folder-btn").addEventListener("click", async () => {
  const name = $("new-folder-name").value.trim();
  if (!name) return;
  await AUTH.api("/api/folders", { action: "create", name });
  $("new-folder-name").value = "";
  loadFolders();
});

/* ---------------- my docs ---------------- */
async function loadDocs() {
  const wrap = $("doc-list");
  try {
    const data = await AUTH.api("/api/publish", { action: "list" });
    wrap.innerHTML = "";
    if (!data.docs.length) wrap.innerHTML = '<div class="empty">هنوز سندی منتشر نکرده‌ای.</div>';
    data.docs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(d => {
      const row = rowEl();
      const name = document.createElement("span");
      name.className = "grow";
      name.textContent = "📄 " + d.title;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = new Date(d.updatedAt).toLocaleDateString("fa-IR") +
        (d.shares ? " — " + d.shares + " لینک" : "");
      const view = document.createElement("button");
      view.className = "act";
      view.textContent = "👁";
      view.title = "مشاهده";
      view.addEventListener("click", () => location.href = "viewer.html?d=" + d.id);
      const edit = document.createElement("button");
      edit.className = "act";
      edit.textContent = "✏️ ویرایش";
      edit.addEventListener("click", () => location.href = "index.html?doc=" + d.id);
      const del = document.createElement("button");
      del.className = "act";
      del.textContent = "🗑";
      del.addEventListener("click", async () => {
        if (confirm("«" + d.title + "» برای همیشه حذف شود؟")) {
          await AUTH.api("/api/publish", { action: "delete", docId: d.id });
          loadDocs();
        }
      });
      row.append(name, meta, view, edit, del);
      wrap.appendChild(row);
    });
  } catch (e) {
    wrap.innerHTML = '<div class="empty">خطا: ' + e.message + "</div>";
  }
}

loadAll();
