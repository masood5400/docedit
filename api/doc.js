/* GET /api/doc — open a document.
   ?token=..&bid=..[&s=session]  → via share link
   ?docId=..&s=session           → via direct user access (dashboard / shared-with-me)

   Owner & share-creator bypass: never counted against the unique-browser limit.
   Users with direct access: never counted.
   share.guestView=false → guests get 401 login_required. */
"use strict";
const { getJson, setJson, send, preflight, sessionUser, userDocAccess } = require("./_lib");

async function folderRole(doc, user) {
  if (!user || !doc.folderId) return null;
  const folder = await getJson("folder:" + doc.folderId);
  if (!folder) return null;
  if (folder.owner === user.id) return "owner";
  return (folder.sharedWith && folder.sharedWith[user.id]) || null;
}

function docPayload(doc, extra) {
  return Object.assign({
    ok: true,
    title: doc.title,
    html: doc.html,
    toc: doc.toc || "",
    dir: doc.dir || "ltr",
    fonts: doc.fonts || [],
    docId: doc.id,
    updatedAt: doc.updatedAt
  }, extra);
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });

  try {
    const q = req.query || {};
    const user = await sessionUser(req);

    /* ---- direct access by docId (no link) ---- */
    if (q.docId && !q.token) {
      const doc = await getJson("doc:" + q.docId);
      if (!doc) return send(res, 404, { error: "not_found" });
      let role = userDocAccess(doc, user) || (await folderRole(doc, user));
      if (!role) return send(res, 404, { error: "not_found" }); // uniform — never reveal existence
      return send(res, 200, docPayload(doc, {
        role, allowComments: true, canComment: !!user, remaining: null
      }));
    }

    /* ---- via share link ---- */
    const token = q.token;
    const bid = String(q.bid || "");
    if (!token || !/^[\w-]{8,64}$/.test(bid)) {
      return send(res, 400, { error: "bad_request" });
    }
    const share = await getJson("share:" + token);
    if (!share) return send(res, 404, { error: "link_not_found" });
    const doc = await getJson("doc:" + share.docId);
    if (!doc) return send(res, 404, { error: "doc_not_found" });

    /* bypass tiers — no counting for: */
    const isDocOwner = user && doc.owner && doc.owner === user.id;
    const isCreator = (user && share.creatorUid && share.creatorUid === user.id) ||
      (share.creatorBid && share.creatorBid === bid);
    const directRole = userDocAccess(doc, user) || (await folderRole(doc, user));

    if (isDocOwner || isCreator || directRole) {
      share.totalViews = (share.totalViews || 0) + 1;
      await setJson("share:" + token, share);
      return send(res, 200, docPayload(doc, {
        role: isDocOwner ? "owner" : (directRole || "read"),
        isOwner: !!(isDocOwner || isCreator),
        allowComments: !!share.allowComments,
        canComment: !!user,
        remaining: Math.max(share.max - (share.browsers || []).length, 0)
      }));
    }

    /* guests blocked if the link requires login */
    if (share.guestView === false && !user) {
      return send(res, 401, { error: "login_required" });
    }

    /* unique-browser counting for everyone else */
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

    return send(res, 200, docPayload(doc, {
      role: "viewer",
      allowComments: !!share.allowComments,
      canComment: !!user && !!share.allowComments,
      remaining: Math.max(share.max - browsers.length, 0)
    }));
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
