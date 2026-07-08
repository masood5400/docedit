/* ============ DocEdit — shared auth client (editor + viewer + dashboard) ============
   Fast combined login/register. Session token in localStorage, sent as x-session. */
"use strict";

const AUTH = {
  session: localStorage.getItem("de_session") || null,
  user: JSON.parse(localStorage.getItem("de_user") || "null"),

  serverBase() {
    const saved = localStorage.getItem("de_server");
    if (saved) return saved.replace(/\/+$/, "");
    if (location.protocol.startsWith("http") && !/localhost|127\.0\.0\.1/.test(location.host)) {
      return location.origin;
    }
    return "";
  },

  headers() {
    const h = { "content-type": "application/json" };
    if (this.session) h["x-session"] = this.session;
    return h;
  },

  async api(path, body) {
    const base = this.serverBase();
    if (!base) throw new Error(FA ? "آدرس سرور تنظیم نشده" : "Server URL not set");
    const res = await fetch(base + path, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || ("HTTP " + res.status)); e.code = res.status; throw e; }
    return data;
  },

  isLoggedIn() { return !!(this.session && this.user); },

  async enter(username, password) {
    const data = await this.api("/api/auth", { action: "enter", username, password });
    this.session = data.session;
    this.user = data.user;
    localStorage.setItem("de_session", this.session);
    localStorage.setItem("de_user", JSON.stringify(this.user));
    return data.mode; // "login" | "register"
  },

  logout() {
    this.session = null;
    this.user = null;
    localStorage.removeItem("de_session");
    localStorage.removeItem("de_user");
  },

  /* guest browser identity (also used as the "unique browser" id) */
  bid() {
    let id = localStorage.getItem("de_bid");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") :
        Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem("de_bid", id);
    }
    return id;
  },

  /* guest ownership key for docs published without an account */
  guestKey() {
    let k = localStorage.getItem("de_guestkey");
    if (!k) {
      k = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") :
        Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem("de_guestkey", k);
    }
    return k;
  }
};

const FA = (localStorage.getItem("de_lang") || "en") === "fa" ||
  document.documentElement.lang === "fa";

/* ---------- minimal login modal (injected; usable on any page) ---------- */
function showAuthModal(reason, onDone) {
  let m = document.getElementById("auth-modal");
  if (m) m.remove();
  m = document.createElement("div");
  m.id = "auth-modal";
  m.style.cssText = "position:fixed;inset:0;background:rgba(10,15,25,.55);display:flex;align-items:center;justify-content:center;z-index:500;";
  const rtl = FA ? "rtl" : "ltr";
  m.innerHTML = `
  <div dir="${rtl}" style="background:var(--panel,#fff);color:var(--text,#1c2330);border-radius:14px;
       padding:26px 28px;min-width:320px;max-width:92vw;box-shadow:0 8px 40px rgba(0,0,0,.35);
       font-family:'Vazirmatn','Inter',system-ui,sans-serif;">
    <h3 style="margin:0 0 6px;font-size:17px;">${FA ? "ورود / ثبت‌نام سریع" : "Quick sign in / sign up"}</h3>
    <p style="margin:0 0 14px;font-size:12.5px;color:#6b7686;">${reason || ""}</p>
    <input id="auth-user" placeholder="${FA ? "نام کاربری (a-z و 0-9)" : "username (a-z, 0-9)"}" dir="ltr"
      style="width:100%;box-sizing:border-box;height:38px;margin-bottom:8px;border:1px solid #c9d1dc;border-radius:8px;padding:0 10px;font-size:14px;background:transparent;color:inherit;">
    <input id="auth-pass" type="password" placeholder="${FA ? "گذرواژه (حداقل ۶ نویسه)" : "password (min 6 chars)"}" dir="ltr"
      style="width:100%;box-sizing:border-box;height:38px;margin-bottom:6px;border:1px solid #c9d1dc;border-radius:8px;padding:0 10px;font-size:14px;background:transparent;color:inherit;">
    <p style="margin:0 0 12px;font-size:11.5px;color:#6b7686;">
      ${FA ? "اگر حساب نداشته باشی، همین‌جا خودکار ساخته می‌شود." : "No account? It will be created automatically."}</p>
    <p id="auth-err" style="margin:0 0 10px;font-size:12.5px;color:#d33;min-height:16px;"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="auth-cancel" style="height:36px;padding:0 16px;border:1px solid #c9d1dc;border-radius:8px;background:transparent;color:inherit;cursor:pointer;">
        ${FA ? "بعدا" : "Later"}</button>
      <button id="auth-go" style="height:36px;padding:0 22px;border:none;border-radius:8px;background:#2f6fed;color:#fff;cursor:pointer;font-weight:600;">
        ${FA ? "ورود" : "Enter"}</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  const err = m.querySelector("#auth-err");
  const go = async () => {
    const u = m.querySelector("#auth-user").value.trim();
    const p = m.querySelector("#auth-pass").value;
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(u)) { err.textContent = FA ? "نام کاربری نامعتبر است" : "Invalid username"; return; }
    if (p.length < 6) { err.textContent = FA ? "گذرواژه کوتاه است" : "Password too short"; return; }
    err.textContent = "…";
    try {
      const mode = await AUTH.enter(u, p);
      m.remove();
      if (onDone) onDone(mode);
    } catch (e) {
      err.textContent = e.code === 401 ? (FA ? "گذرواژه اشتباه است" : "Wrong password") :
        e.code === 429 ? (FA ? "تلاش زیاد — کمی صبر کن" : "Too many attempts — wait a minute") : e.message;
    }
  };
  m.querySelector("#auth-go").addEventListener("click", go);
  m.querySelector("#auth-pass").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  m.querySelector("#auth-cancel").addEventListener("click", () => { m.remove(); if (onDone) onDone(null); });
  m.addEventListener("click", e => { if (e.target === m) { m.remove(); if (onDone) onDone(null); } });
  m.querySelector("#auth-user").focus();
}
