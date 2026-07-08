/* POST /api/publish — document CRUD for logged-in users AND guests.
   Guests hold a random guestKey (kept in their browser) proving ownership of their docs.
   actions: publish | get | list | delete */
"use strict";
const {
  getJson, setJson, delKey, rid, send, preflight, rateLimit,
  sessionUser, userDocAccess
} = require("./_lib");

const crypto = require("crypto");
const gkHash = k => crypto.createHash("sha256").update("gk:" + k).digest("base64url");

function isOwner(doc, user, guestKey) {
  if (user && doc.owner && doc.owner === user.id) return true;
  if (!doc.owner && doc.guestKeyHash && guestKey && gkHash(guestKey) === doc.guestKeyHash) return true;
  return false;
}

function validFonts(fonts) {
  if (!Array.isArray(fonts)) return [];
  return fonts.slice(0, 3)
    .filter(f => f && typeof f.name === "string" && typeof f.data === "string" &&
      f.data.startsWith("data:") && f.data.length < 2_200_000)
    .map(f => ({ name: f.name.slice(0, 40), data: f.data }));
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    const body = req.body || {};
    const { action } = body;
    const user = await sessionUser(req);
    const guestKey = typeof body.guestKey === "string" ? body.guestKey.slice(0, 64) : null;

    /* ---------- publish / update ---------- */
    if (action === "publish" || !action) {
      if (!(await rateLimit(req, "publish", 30, 60))) {
        return send(res, 429, { error: "too_many_requests" });
      }
      const { docId, title, html, dir, toc, folderId } = body;
      if (!html || typeof html !== "string") return send(res, 400, { error: "missing_html" });
      if (html.length > 3_000_000) return send(res, 413, { error: "too_large" });
      if (!user && !guestKey) return send(res, 400, { error: "missing_identity" });

      let id = typeof docId === "string" && /^[\w-]{4,40}$/.test(docId) ? docId : null;
      let doc = id ? await getJson("doc:" + id) : null;

      if (doc && !isOwner(doc, user, guestKey)) {
        // not yours — check edit access, else create a fresh doc instead of overwriting
        const acc = userDocAccess(doc, user);
        if (acc !== "edit") { doc = null; id = null; }
      }

      if (!doc) {
        id = rid(10);
        doc = {
          id,
          owner: user ? user.id : null,
          guestKeyHash: user ? null : gkHash(guestKey),
          sharedWith: {},
          shares: [],
          createdAt: Date.now()
        };
        // registries
        if (user) {
          const mine = (await getJson("user-docs:" + user.id)) || [];
          mine.push(id);
          await setJson("user-docs:" + user.id, mine);
        }
        const all = (await getJson("sys:docs")) || [];
        all.push(id);
        await setJson("sys:docs", all);
      }

      // folder assignment (must own the folder)
      if (user && typeof folderId === "string") {
        const folder = await getJson("folder:" + folderId);
        if (folder && folder.owner === user.id) doc.folderId = folderId;
      }
      if (folderId === null) doc.folderId = null;

      doc.title = String(title || "Untitled").slice(0, 200);
      doc.html = html;
      doc.toc = typeof toc === "string" ? toc.slice(0, 200_000) : "";
      doc.dir = dir === "rtl" ? "rtl" : "ltr";
      if (Array.isArray(body.fonts)) doc.fonts = validFonts(body.fonts); // keep existing fonts when omitted
      doc.updatedAt = Date.now();
      await setJson("doc:" + id, doc);
      return send(res, 200, { ok: true, docId: id });
    }

    /* ---------- get own/editable doc (for re-editing) ---------- */
    if (action === "get") {
      const doc = await getJson("doc:" + body.docId);
      if (!doc) return send(res, 404, { error: "not_found" });
      const owner = isOwner(doc, user, guestKey);
      const acc = owner ? "owner" : userDocAccess(doc, user);
      if (!owner && acc !== "edit" && acc !== "read") return send(res, 404, { error: "not_found" });
      return send(res, 200, {
        ok: true,
        doc: {
          id: doc.id, title: doc.title, html: doc.html, dir: doc.dir,
          toc: doc.toc, fonts: doc.fonts || [], folderId: doc.folderId || null,
          role: owner ? "owner" : acc, updatedAt: doc.updatedAt
        }
      });
    }

    /* ---------- list my docs ---------- */
    if (action === "list") {
      if (!user) return send(res, 401, { error: "login_required" });
      const ids = (await getJson("user-docs:" + user.id)) || [];
      const docs = [];
      for (const id of ids) {
        const d = await getJson("doc:" + id);
        if (d) docs.push({
          id, title: d.title, updatedAt: d.updatedAt,
          folderId: d.folderId || null, shares: (d.shares || []).length
        });
      }
      return send(res, 200, { ok: true, docs });
    }

    /* ---------- delete ---------- */
    if (action === "delete") {
      const doc = await getJson("doc:" + body.docId);
      if (!doc || !isOwner(doc, user, guestKey)) return send(res, 404, { error: "not_found" });
      for (const tok of doc.shares || []) {
        await delKey("share:" + tok);
        await delKey("comments-idx:" + tok);
      }
      await delKey("comments:" + doc.id);
      await delKey("doc:" + doc.id);
      if (user) {
        const mine = (await getJson("user-docs:" + user.id)) || [];
        await setJson("user-docs:" + user.id, mine.filter(x => x !== doc.id));
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
