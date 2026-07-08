/* POST /api/admin — super-admin oversight (ADMIN_PASSWORD protected).
   actions: overview | doc {docId} | resetpw {username, newPassword} */
"use strict";
const {
  getJson, setJson, send, preflight, rateLimit,
  checkPassword, hashPassword, normalizeUsername
} = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    if (!(await rateLimit(req, "admin", 15, 60))) return send(res, 429, { error: "too_many_attempts" });
    const body = req.body || {};
    if (!checkPassword(body.password)) return send(res, 401, { error: "wrong_password" });

    if (body.action === "overview") {
      const users = [];
      for (const uid of (await getJson("sys:users")) || []) {
        const u = await getJson("user:" + uid);
        if (u) {
          const docs = (await getJson("user-docs:" + uid)) || [];
          users.push({ id: uid, username: u.username, createdAt: u.createdAt, docs: docs.length });
        }
      }
      const docs = [];
      for (const did of (await getJson("sys:docs")) || []) {
        const d = await getJson("doc:" + did);
        if (d) {
          let ownerName = "«مهمان»";
          if (d.owner) {
            const o = await getJson("user:" + d.owner);
            ownerName = o ? o.username : "?";
          }
          const comments = (await getJson("comments:" + did)) || [];
          docs.push({
            id: did, title: d.title, owner: ownerName, guest: !d.owner,
            updatedAt: d.updatedAt, shares: (d.shares || []).length,
            comments: comments.length, size: (d.html || "").length
          });
        }
      }
      return send(res, 200, { ok: true, users, docs });
    }

    if (body.action === "doc") {
      const d = await getJson("doc:" + body.docId);
      if (!d) return send(res, 404, { error: "not_found" });
      const comments = (await getJson("comments:" + body.docId)) || [];
      return send(res, 200, {
        ok: true,
        doc: { id: d.id, title: d.title, html: d.html, dir: d.dir, toc: d.toc, fonts: d.fonts || [] },
        comments
      });
    }

    if (body.action === "resetpw") {
      const uname = normalizeUsername(body.username);
      const uid = uname ? await getJson("uname:" + uname) : null;
      const u = uid ? await getJson("user:" + uid) : null;
      if (!u) return send(res, 404, { error: "not_found" });
      const pw = String(body.newPassword || "");
      if (pw.length < 6) return send(res, 400, { error: "bad_password" });
      const { salt, hash } = hashPassword(pw);
      u.salt = salt;
      u.passHash = hash;
      await setJson("user:" + uid, u);
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
