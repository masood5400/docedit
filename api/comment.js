/* /api/comment — Google-Docs-style anchored comment threads.
   Anchors: {quote, prefix, suffix} (text-quote anchoring on the rendered document).
   Commenting ALWAYS requires login. Reading follows document access.
   POST actions:
     list    {token,bid | docId}
     add     {token,bid | docId, quote, prefix, suffix, text, mentions[]}
     reply   {token,bid | docId, commentId, text}
     status  {token,bid | docId, commentId, status:"open"|"done"|"dismissed"}
     members {token,bid | docId} → usernames with access (for @mentions) */
"use strict";
const {
  getJson, setJson, rid, send, preflight, rateLimit,
  sessionUser, userDocAccess
} = require("./_lib");

async function folderRole(doc, user) {
  if (!user || !doc.folderId) return null;
  const folder = await getJson("folder:" + doc.folderId);
  if (!folder) return null;
  if (folder.owner === user.id) return "owner";
  return (folder.sharedWith && folder.sharedWith[user.id]) || null;
}

async function resolveAccess(body, user) {
  // via link
  if (body.token) {
    const share = await getJson("share:" + body.token);
    if (!share) return null;
    const doc = await getJson("doc:" + share.docId);
    if (!doc) return null;
    const bid = String(body.bid || "");
    const isDocOwner = user && doc.owner && doc.owner === user.id;
    const isCreator = (user && share.creatorUid && share.creatorUid === user.id) ||
      (share.creatorBid && share.creatorBid === bid);
    const directRole = userDocAccess(doc, user) || (await folderRole(doc, user));
    const isReader = (share.browsers || []).includes(bid);
    if (!isDocOwner && !isCreator && !directRole && !isReader) return null;
    return {
      doc,
      isDocOwner: !!(isDocOwner || isCreator),
      canComment: !!user && (isDocOwner || isCreator || !!directRole || !!share.allowComments)
    };
  }
  // direct
  if (body.docId) {
    const doc = await getJson("doc:" + body.docId);
    if (!doc) return null;
    const role = userDocAccess(doc, user) || (await folderRole(doc, user));
    if (!role) return null;
    return { doc, isDocOwner: role === "owner", canComment: !!user };
  }
  return null;
}

function publicThread(c) {
  return {
    id: c.id,
    quote: c.quote, prefix: c.prefix, suffix: c.suffix,
    text: c.text,
    author: c.author,
    mentions: c.mentions || [],
    status: c.status || "open",
    ts: c.ts,
    replies: (c.replies || []).map(r => ({ id: r.id, text: r.text, author: r.author, ts: r.ts }))
  };
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    const body = req.body || {};
    const user = await sessionUser(req);
    const access = await resolveAccess(body, user);
    if (!access) return send(res, 404, { error: "not_found" });
    const { doc } = access;
    const key = "comments:" + doc.id;

    if (body.action === "list") {
      const comments = (await getJson(key)) || [];
      return send(res, 200, {
        ok: true,
        comments: comments.map(publicThread),
        isDocOwner: access.isDocOwner,
        canComment: access.canComment,
        me: user ? user.username : null
      });
    }

    if (body.action === "members") {
      // for @mention autocomplete — only people who already have access can see this
      const names = new Set();
      if (doc.owner) {
        const o = await getJson("user:" + doc.owner);
        if (o) names.add(o.username);
      }
      for (const uid of Object.keys(doc.sharedWith || {})) {
        const u = await getJson("user:" + uid);
        if (u) names.add(u.username);
      }
      const comments = (await getJson(key)) || [];
      comments.forEach(c => {
        if (c.author && c.author.username) names.add(c.author.username);
        (c.replies || []).forEach(r => r.author && names.add(r.author.username));
      });
      return send(res, 200, { ok: true, members: [...names] });
    }

    if (body.action === "add") {
      if (!user) return send(res, 401, { error: "login_required" });
      if (!access.canComment) return send(res, 403, { error: "comments_disabled" });
      if (!(await rateLimit(req, "comment", 30, 60))) return send(res, 429, { error: "too_many_requests" });
      const text = String(body.text || "").trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: "empty_comment" });
      const comments = (await getJson(key)) || [];
      if (comments.length >= 500) return send(res, 429, { error: "too_many_comments" });
      const thread = {
        id: rid(8),
        quote: String(body.quote || "").slice(0, 500),
        prefix: String(body.prefix || "").slice(0, 60),
        suffix: String(body.suffix || "").slice(0, 60),
        text,
        mentions: Array.isArray(body.mentions) ? body.mentions.slice(0, 10).map(m => String(m).slice(0, 32)) : [],
        author: { uid: user.id, username: user.username },
        status: "open",
        replies: [],
        ts: Date.now()
      };
      comments.push(thread);
      await setJson(key, comments);
      return send(res, 200, { ok: true, comment: publicThread(thread) });
    }

    if (body.action === "reply") {
      if (!user) return send(res, 401, { error: "login_required" });
      if (!access.canComment) return send(res, 403, { error: "comments_disabled" });
      const comments = (await getJson(key)) || [];
      const thread = comments.find(c => c.id === body.commentId);
      if (!thread) return send(res, 404, { error: "not_found" });
      const text = String(body.text || "").trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: "empty_comment" });
      thread.replies = thread.replies || [];
      if (thread.replies.length >= 100) return send(res, 429, { error: "too_many_replies" });
      thread.replies.push({
        id: rid(6), text,
        author: { uid: user.id, username: user.username },
        ts: Date.now()
      });
      await setJson(key, comments);
      return send(res, 200, { ok: true });
    }

    if (body.action === "status") {
      if (!user) return send(res, 401, { error: "login_required" });
      const comments = (await getJson(key)) || [];
      const thread = comments.find(c => c.id === body.commentId);
      if (!thread) return send(res, 404, { error: "not_found" });
      const mine = thread.author && thread.author.uid === user.id;
      if (!access.isDocOwner && !mine) return send(res, 403, { error: "not_allowed" });
      const status = ["open", "done", "dismissed"].includes(body.status) ? body.status : "open";
      thread.status = status;
      await setJson(key, comments);
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
