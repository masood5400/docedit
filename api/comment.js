/* /api/comment — comments on a shared document (readers with access only)
   GET  ?token=&bid=            → list comments
   POST {token, bid, name, text} → add comment */
"use strict";
const { getJson, setJson, send, preflight } = require("./_lib");

async function authorized(token, bid) {
  const share = await getJson("share:" + token);
  if (!share) return null;
  if (!(share.browsers || []).includes(bid)) return null;
  return share;
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;

  try {
    if (req.method === "GET") {
      const { token, bid } = req.query || {};
      const share = await authorized(token, bid);
      if (!share) return send(res, 403, { error: "no_access" });
      const comments = (await getJson("comments:" + token)) || [];
      return send(res, 200, { ok: true, comments });
    }

    if (req.method === "POST") {
      const { token, bid, name, text } = req.body || {};
      const share = await authorized(token, bid);
      if (!share) return send(res, 403, { error: "no_access" });
      if (!share.allowComments) return send(res, 403, { error: "comments_disabled" });
      const clean = String(text || "").trim().slice(0, 2000);
      if (!clean) return send(res, 400, { error: "empty_comment" });

      const comments = (await getJson("comments:" + token)) || [];
      if (comments.length >= 500) return send(res, 429, { error: "too_many_comments" });
      comments.push({
        name: String(name || "").trim().slice(0, 60) || "—",
        text: clean,
        ts: Date.now()
      });
      await setJson("comments:" + token, comments);
      return send(res, 200, { ok: true, count: comments.length });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
