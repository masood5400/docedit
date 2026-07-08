/* /api/share — manage private share links (owner only)
   POST   {password, docId, maxOpens, allowComments} → create link
   GET    ?password=&docId=                          → list links + usage
   DELETE {password, token}                          → revoke link */
"use strict";
const { getJson, setJson, delKey, rid, send, preflight, checkPassword } = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;

  try {
    if (req.method === "POST") {
      const { password, docId, maxOpens, allowComments } = req.body || {};
      if (!checkPassword(password)) return send(res, 401, { error: "Wrong password" });
      const doc = await getJson("doc:" + docId);
      if (!doc) return send(res, 404, { error: "Document not found" });

      const token = rid(16);
      const share = {
        docId,
        max: Math.min(Math.max(parseInt(maxOpens, 10) || 1, 1), 1000),
        allowComments: !!allowComments,
        browsers: [],
        totalViews: 0,
        createdAt: Date.now()
      };
      await setJson("share:" + token, share);
      doc.shares = (doc.shares || []).filter(t => t !== token);
      doc.shares.push(token);
      await setJson("doc:" + docId, doc);
      return send(res, 200, { ok: true, token });
    }

    if (req.method === "GET") {
      const { password, docId } = req.query || {};
      if (!checkPassword(password)) return send(res, 401, { error: "Wrong password" });
      const doc = await getJson("doc:" + docId);
      if (!doc) return send(res, 404, { error: "Document not found" });
      const shares = [];
      for (const token of doc.shares || []) {
        const s = await getJson("share:" + token);
        if (s) {
          shares.push({
            token,
            max: s.max,
            used: (s.browsers || []).length,
            totalViews: s.totalViews || 0,
            allowComments: !!s.allowComments,
            createdAt: s.createdAt
          });
        }
      }
      return send(res, 200, { ok: true, shares });
    }

    if (req.method === "DELETE") {
      const { password, token } = req.body || {};
      if (!checkPassword(password)) return send(res, 401, { error: "Wrong password" });
      const share = await getJson("share:" + token);
      if (share) {
        const doc = await getJson("doc:" + share.docId);
        if (doc) {
          doc.shares = (doc.shares || []).filter(t => t !== token);
          await setJson("doc:" + share.docId, doc);
        }
        await delKey("share:" + token);
        await delKey("comments:" + token);
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
