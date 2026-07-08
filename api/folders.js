/* POST /api/folders — folders for registered users
   actions: create {name} | list | rename {folderId,name} | remove {folderId}
            share {folderId, username, role} | ungrant {folderId, username}
            docs {folderId} */
"use strict";
const {
  getJson, setJson, delKey, rid, send, preflight, rateLimit,
  sessionUser, normalizeUsername
} = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    const body = req.body || {};
    const user = await sessionUser(req);
    if (!user) return send(res, 401, { error: "login_required" });

    if (body.action === "create") {
      if (!(await rateLimit(req, "folders", 30, 60))) return send(res, 429, { error: "too_many_requests" });
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return send(res, 400, { error: "bad_name" });
      const folder = {
        id: rid(10), owner: user.id, name,
        sharedWith: {}, createdAt: Date.now()
      };
      await setJson("folder:" + folder.id, folder);
      const mine = (await getJson("user-folders:" + user.id)) || [];
      mine.push(folder.id);
      await setJson("user-folders:" + user.id, mine);
      return send(res, 200, { ok: true, folder: { id: folder.id, name } });
    }

    if (body.action === "list") {
      const out = { own: [], shared: [] };
      for (const fid of (await getJson("user-folders:" + user.id)) || []) {
        const f = await getJson("folder:" + fid);
        if (f) out.own.push({ id: f.id, name: f.name, members: Object.keys(f.sharedWith || {}).length });
      }
      for (const fid of (await getJson("shared-folders:" + user.id)) || []) {
        const f = await getJson("folder:" + fid);
        if (f && f.sharedWith && f.sharedWith[user.id]) {
          const o = await getJson("user:" + f.owner);
          out.shared.push({ id: f.id, name: f.name, role: f.sharedWith[user.id], owner: o ? o.username : "?" });
        }
      }
      // docs shared with me directly
      out.sharedDocs = [];
      for (const did of (await getJson("shared-with:" + user.id)) || []) {
        const d = await getJson("doc:" + did);
        if (d && d.sharedWith && d.sharedWith[user.id]) {
          const o = d.owner ? await getJson("user:" + d.owner) : null;
          out.sharedDocs.push({ id: did, title: d.title, role: d.sharedWith[user.id], owner: o ? o.username : "?" });
        }
      }
      return send(res, 200, { ok: true, ...out });
    }

    const folder = body.folderId ? await getJson("folder:" + body.folderId) : null;
    const owner = folder && folder.owner === user.id;

    if (body.action === "rename") {
      if (!owner) return send(res, 404, { error: "not_found" });
      folder.name = String(body.name || "").trim().slice(0, 60) || folder.name;
      await setJson("folder:" + folder.id, folder);
      return send(res, 200, { ok: true });
    }

    if (body.action === "remove") {
      if (!owner) return send(res, 404, { error: "not_found" });
      await delKey("folder:" + folder.id);
      const mine = (await getJson("user-folders:" + user.id)) || [];
      await setJson("user-folders:" + user.id, mine.filter(x => x !== folder.id));
      return send(res, 200, { ok: true });
    }

    if (body.action === "share" || body.action === "ungrant") {
      if (!owner) return send(res, 404, { error: "not_found" });
      if (!(await rateLimit(req, "grant", 20, 60))) return send(res, 429, { error: "too_many_requests" });
      const uname = normalizeUsername(body.username);
      if (uname) {
        const uid = await getJson("uname:" + uname);
        if (uid && uid !== user.id) {
          folder.sharedWith = folder.sharedWith || {};
          const inbox = (await getJson("shared-folders:" + uid)) || [];
          if (body.action === "share") {
            folder.sharedWith[uid] = body.role === "edit" ? "edit" : "read";
            if (!inbox.includes(folder.id)) inbox.push(folder.id);
          } else {
            delete folder.sharedWith[uid];
            const i = inbox.indexOf(folder.id);
            if (i > -1) inbox.splice(i, 1);
          }
          await setJson("shared-folders:" + uid, inbox);
          await setJson("folder:" + folder.id, folder);
        }
      }
      return send(res, 200, { ok: true }); // generic — no user enumeration
    }

    if (body.action === "docs") {
      if (!folder) return send(res, 404, { error: "not_found" });
      const role = owner ? "owner" : (folder.sharedWith && folder.sharedWith[user.id]);
      if (!role) return send(res, 404, { error: "not_found" });
      const ownerIds = (await getJson("user-docs:" + folder.owner)) || [];
      const docs = [];
      for (const did of ownerIds) {
        const d = await getJson("doc:" + did);
        if (d && d.folderId === folder.id) {
          docs.push({ id: did, title: d.title, updatedAt: d.updatedAt });
        }
      }
      return send(res, 200, { ok: true, docs, role, name: folder.name });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
