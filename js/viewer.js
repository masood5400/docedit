/* ============ DocEdit — shared document viewer ============ */
"use strict";

const params = new URLSearchParams(location.search);
const TOKEN = params.get("t") || "";

function browserId() {
  let id = localStorage.getItem("de_bid");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") :
      Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem("de_bid", id);
  }
  return id;
}
const BID = browserId();

function showState(icon, faMsg, enMsg) {
  document.getElementById("content").innerHTML =
    '<div class="state"><div class="icon">' + icon + "</div>" +
    "<h2>" + faMsg + "</h2><p>" + enMsg + "</p></div>";
  document.getElementById("doc-title").textContent = "DocEdit";
}

async function loadDoc() {
  if (!TOKEN) {
    showState("🔗", "لینک نامعتبر است", "Invalid link — no token provided.");
    return;
  }
  let res, data;
  try {
    res = await fetch("/api/doc?token=" + encodeURIComponent(TOKEN) + "&bid=" + BID);
    data = await res.json();
  } catch (e) {
    showState("⚠️", "خطا در ارتباط با سرور", "Could not reach the server.");
    return;
  }
  if (!res.ok) {
    if (data.error === "link_limit_reached") {
      showState("🔒", "ظرفیت این لینک تکمیل شده", "This link has reached its maximum number of unique readers.");
    } else if (data.error === "link_not_found") {
      showState("🚫", "این لینک باطل شده یا وجود ندارد", "This link was revoked or never existed.");
    } else {
      showState("⚠️", "خطا", data.error || "Unknown error");
    }
    return;
  }

  document.title = data.title + " — DocEdit";
  document.getElementById("doc-title").textContent = data.title;
  if (data.updatedAt) {
    document.getElementById("doc-meta").textContent =
      new Date(data.updatedAt).toLocaleDateString("fa-IR");
  }
  document.documentElement.dir = data.dir || "ltr";

  const holder = document.createElement("article");
  holder.className = "doc";
  holder.dir = data.dir || "ltr";
  holder.innerHTML = (data.toc || "") + data.html;
  document.getElementById("content").innerHTML = "";
  document.getElementById("content").appendChild(holder);

  // highlight + copy buttons
  holder.querySelectorAll("pre.code-zone").forEach(pre => {
    const code = pre.querySelector("code");
    if (code && typeof hljs !== "undefined" && !code.classList.contains("hljs")) {
      try { hljs.highlightElement(code); } catch (e) {}
    }
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "⧉ کپی";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.textContent.replace(/^⧉ کپی|✓$/g, "").trim())
        .then(() => {
          btn.textContent = "✓";
          setTimeout(() => { btn.textContent = "⧉ کپی"; }, 1200);
        });
    });
    pre.appendChild(btn);
  });

  if (data.allowComments) {
    document.getElementById("comments").hidden = false;
    loadComments();
    document.getElementById("c-send").addEventListener("click", sendComment);
  }
}

async function loadComments() {
  try {
    const res = await fetch("/api/comment?token=" + encodeURIComponent(TOKEN) + "&bid=" + BID);
    const data = await res.json();
    if (!res.ok) return;
    const list = document.getElementById("comment-list");
    list.innerHTML = "";
    (data.comments || []).forEach(c => {
      const div = document.createElement("div");
      div.className = "comment";
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = c.name;
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = new Date(c.ts).toLocaleString("fa-IR");
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = c.text;
      div.append(who, when, body);
      list.appendChild(div);
    });
  } catch (e) { /* silent */ }
}

async function sendComment() {
  const name = document.getElementById("c-name").value.trim();
  const text = document.getElementById("c-text").value.trim();
  if (!text) return;
  const btn = document.getElementById("c-send");
  btn.disabled = true;
  try {
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, bid: BID, name, text })
    });
    if (res.ok) {
      document.getElementById("c-text").value = "";
      loadComments();
    } else {
      const data = await res.json().catch(() => ({}));
      alert("خطا: " + (data.error || res.status));
    }
  } finally {
    btn.disabled = false;
  }
}

loadDoc();
