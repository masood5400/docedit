/* POST /api/publish — create or update a published document (owner only) */
"use strict";
const { getJson, setJson, rid, send, preflight, checkPassword } = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const { password, docId, title, html, dir, toc } = req.body || {};
    if (!checkPassword(password)) return send(res, 401, { error: "Wrong password" });
    if (!html || typeof html !== "string") return send(res, 400, { error: "Missing html" });
    if (html.length > 3_500_000) return send(res, 413, { error: "Document too large (max ~3.5MB)" });

    let id = typeof docId === "string" && /^[\w-]{4,40}$/.test(docId) ? docId : null;
    let doc = id ? await getJson("doc:" + id) : null;
    if (!doc) {
      id = rid(8);
      doc = { createdAt: Date.now(), shares: [] };
    }
    doc.title = String(title || "Untitled").slice(0, 200);
    doc.html = html;
    doc.toc = typeof toc === "string" ? toc.slice(0, 200_000) : "";
    doc.dir = dir === "rtl" ? "rtl" : "ltr";
    doc.updatedAt = Date.now();
    await setJson("doc:" + id, doc);

    return send(res, 200, { ok: true, docId: id });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
