/* /api/share — link shares + direct user grants (owner only)
   POST {action:"create", docId, maxOpens, allowComments, guestView, bid} → link token
   POST {action:"list", docId}
   POST {action:"revoke", token}
   POST {action:"grant", docId, username, role:"read"|"edit"}   (generic ok — no user enumeration)
   POST {action:"ungrant", docId, username}
   POST {action:"members", docId} → usernames with access (owner view) */
"use strict";
const {
  getJson, setJson, delKey, rid, send, preflight, rateLimit,
  sessionUser, normalizeUsername
} = require("./_lib");

const crypto = require("crypto");
const gkHash = k => crypto.createHash("sha256").update("gk:" + k).digest("base64url");

function isOwner(doc, user, guestKey) {
  if (user && doc.owner && doc.owner === user.id) return true;
  if (!doc.owner && doc.guestKeyHash && guestKey && gkHash(guestKey) === doc.guestKeyHash) return true;
  return false;
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    const body = req.body || {};
    const user = await sessionUser(req);
    const guestKey = typeof body.guestKey === "string" ? body.guestKey.slice(0, 64) : null;
    const doc = await getJson("doc:" + body.docId);
    // uniform 404: existence of a doc is never revealed to non-owners
    const owner = doc && isOwner(doc, user, guestKey);

    if (body.action === "create") {
      if (!owner) return send(res, 404, { error: "not_found" });
      if (!(await rateLimit(req, "share", 30, 60))) return send(res, 429, { error: "too_many_requests" });
      const token = rid(16);
      const share = {
        docId: doc.id,
        max: Math.min(Math.max(parseInt(body.maxOpens, 10) || 1, 1), 1000),
        allowComments: !!body.allowComments,
        guestView: body.guestView !== false, // default: guests may view
        browsers: [],
        totalViews: 0,
        creatorBid: typeof body.bid === "string" ? body.bid.slice(0, 64) : null,
        creatorUid: user ? user.id : null,
        createdAt: Date.now()
      };
      await setJson("share:" + token, share);
      doc.shares = (doc.shares || []).filter(t => t !== token);
      doc.shares.push(token);
      await setJson("doc:" + doc.id, doc);
      return send(res, 200, { ok: true, token });
    }

    if (body.action === "list") {
      if (!owner) return send(res, 404, { error: "not_found" });
      const shares = [];
      for (const token of doc.shares || []) {
        const s = await getJson("share:" + token);
        if (s) shares.push({
          token, max: s.max, used: (s.browsers || []).length,
          totalViews: s.totalViews || 0,
          allowComments: !!s.allowComments, guestView: s.guestView !== false,
          createdAt: s.createdAt
        });
      }
      return send(res, 200, { ok: true, shares });
    }

    if (body.action === "revoke") {
      if (!owner) return send(res, 404, { error: "not_found" });
      const share = await getJson("share:" + body.token);
      if (share && share.docId === doc.id) {
        doc.shares = (doc.shares || []).filter(t => t !== body.token);
        await setJson("doc:" + doc.id, doc);
        await delKey("share:" + body.token);
      }
      return send(res, 200, { ok: true });
    }

    if (body.action === "grant" || body.action === "ungrant") {
      if (!owner) return send(res, 404, { error: "not_found" });
      if (!user) return send(res, 401, { error: "login_required" }); // guests cannot grant
      if (!(await rateLimit(req, "grant", 20, 60))) return send(res, 429, { error: "too_many_requests" });
      const uname = normalizeUsername(body.username);
      if (uname) {
        const uid = await getJson("uname:" + uname);
        if (uid && uid !== user.id) {
          doc.sharedWith = doc.sharedWith || {};
          if (body.action === "grant") {
            doc.sharedWith[uid] = body.role === "edit" ? "edit" : "read";
            const inbox = (await getJson("shared-with:" + uid)) || [];
            if (!inbox.includes(doc.id)) inbox.push(doc.id);
            await setJson("shared-with:" + uid, inbox);
          } else {
            delete doc.sharedWith[uid];
            const inbox = (await getJson("shared-with:" + uid)) || [];
            await setJson("shared-with:" + uid, inbox.filter(x => x !== doc.id));
          }
          await setJson("doc:" + doc.id, doc);
        }
      }
      // generic response — never confirms whether the username exists
      return send(res, 200, { ok: true });
    }

    if (body.action === "members") {
      if (!owner) return send(res, 404, { error: "not_found" });
      const members = [];
      for (const [uid, role] of Object.entries(doc.sharedWith || {})) {
        const u = await getJson("user:" + uid);
        if (u) members.push({ username: u.username, role });
      }
      return send(res, 200, { ok: true, members });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
