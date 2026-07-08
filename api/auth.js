/* POST /api/auth — fast combined login/register + session info
   {action:"enter", username, password} → login if user exists, else register
   {action:"me", session}               → current user info
   Anti-enumeration: rate-limited, generic errors, no user listing anywhere. */
"use strict";
const {
  getJson, setJson, rid, send, preflight, rateLimit,
  hashPassword, verifyPassword, signSession, sessionUser, normalizeUsername
} = require("./_lib");

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  try {
    const { action } = req.body || {};

    if (action === "me") {
      const user = await sessionUser(req);
      if (!user) return send(res, 401, { error: "login_required" });
      return send(res, 200, { ok: true, user: { id: user.id, username: user.username } });
    }

    if (action === "enter") {
      if (!(await rateLimit(req, "auth", 10, 60))) {
        return send(res, 429, { error: "too_many_attempts" });
      }
      const username = normalizeUsername((req.body || {}).username);
      const password = String((req.body || {}).password || "");
      if (!username) return send(res, 400, { error: "bad_username" });
      if (password.length < 6 || password.length > 128) {
        return send(res, 400, { error: "bad_password" });
      }

      const existingUid = await getJson("uname:" + username);
      if (existingUid) {
        // login
        const user = await getJson("user:" + existingUid);
        if (!user || !verifyPassword(password, user.salt, user.passHash)) {
          return send(res, 401, { error: "invalid_credentials" });
        }
        return send(res, 200, {
          ok: true, mode: "login",
          session: signSession(user.id),
          user: { id: user.id, username: user.username }
        });
      }

      // register
      const { salt, hash } = hashPassword(password);
      const user = {
        id: rid(12),
        username,
        salt,
        passHash: hash,
        createdAt: Date.now()
      };
      await setJson("user:" + user.id, user);
      await setJson("uname:" + username, user.id);
      // registry for admin oversight only (never exposed to normal users)
      const all = (await getJson("sys:users")) || [];
      all.push(user.id);
      await setJson("sys:users", all);

      return send(res, 200, {
        ok: true, mode: "register",
        session: signSession(user.id),
        user: { id: user.id, username: user.username }
      });
    }

    return send(res, 400, { error: "bad_action" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
