/* GET /api/doc?token=..&bid=.. — open a shared document.
   Access rules:
   - each browser gets a persistent random id (bid)
   - a browser already registered on this link can always re-open it
   - new browsers are admitted only while registered count < max
   - so with max=1, the first browser to open locks everyone else out */
"use strict";
const { getJson, setJson, send, preflight } = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  try {
    const { token, bid } = req.query || {};
    if (!token || !bid || !/^[\w-]{8,64}$/.test(String(bid))) {
      return send(res, 400, { error: "Missing token or browser id" });
    }
    const share = await getJson("share:" + token);
    if (!share) return send(res, 404, { error: "link_not_found" });

    const browsers = share.browsers || [];
    let allowed = browsers.includes(bid);
    if (!allowed && browsers.length < share.max) {
      browsers.push(bid);
      share.browsers = browsers;
      allowed = true;
    }
    if (!allowed) return send(res, 403, { error: "link_limit_reached" });

    share.totalViews = (share.totalViews || 0) + 1;
    await setJson("share:" + token, share);

    const doc = await getJson("doc:" + share.docId);
    if (!doc) return send(res, 404, { error: "doc_not_found" });

    return send(res, 200, {
      ok: true,
      title: doc.title,
      html: doc.html,
      toc: doc.toc || "",
      dir: doc.dir || "ltr",
      allowComments: !!share.allowComments,
      remaining: Math.max(share.max - browsers.length, 0),
      updatedAt: doc.updatedAt
    });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
