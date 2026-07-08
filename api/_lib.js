/* DocEdit serverless core: Redis (REST or TCP), auth, sessions, rate limiting */
"use strict";

const crypto = require("crypto");

/* ---------------- Redis (both styles) ---------------- */
const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TCP_URL = process.env.REDIS_URL || process.env.KV_URL;

let tcpClient = null;
async function tcp() {
  if (!tcpClient) {
    const { createClient } = require("redis");
    tcpClient = createClient({ url: TCP_URL });
    tcpClient.on("error", () => { tcpClient = null; });
    await tcpClient.connect();
  }
  return tcpClient;
}

async function redis(...cmd) {
  if (REST_URL && REST_TOKEN) {
    const res = await fetch(REST_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + REST_TOKEN,
        "content-type": "application/json"
      },
      body: JSON.stringify(cmd)
    });
    const data = await res.json();
    if (data.error) throw new Error("Redis: " + data.error);
    return data.result;
  }
  if (TCP_URL) {
    const c = await tcp();
    return c.sendCommand(cmd.map(String));
  }
  throw new Error("Redis is not configured (set REDIS_URL or UPSTASH_REDIS_REST_URL/_TOKEN)");
}

async function getJson(key) {
  const v = await redis("GET", key);
  return v ? JSON.parse(v) : null;
}
async function setJson(key, obj) { return redis("SET", key, JSON.stringify(obj)); }
async function delKey(key) { return redis("DEL", key); }

function rid(bytes = 16) { return crypto.randomBytes(bytes).toString("base64url"); }

/* ---------------- HTTP helpers ---------------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-session");
}
function send(res, code, obj) { cors(res); res.status(code).json(obj); }
function preflight(req, res) {
  if (req.method === "OPTIONS") { cors(res); res.status(204).end(); return true; }
  return false;
}
function getIp(req) {
  const h = req.headers || {};
  return String(h["x-forwarded-for"] || h["x-real-ip"] || "0.0.0.0").split(",")[0].trim();
}

/* ---------------- rate limiting (per IP per action) ---------------- */
async function rateLimit(req, action, limit, windowSec = 60) {
  try {
    const key = "rl:" + action + ":" + getIp(req);
    const n = await redis("INCR", key);
    if (Number(n) === 1) await redis("EXPIRE", key, windowSec);
    return Number(n) <= limit;
  } catch (e) {
    return true; // fail open — availability over strictness
  }
}

/* ---------------- admin ---------------- */
function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD env var is not set on the server");
  if (typeof pw !== "string" || pw.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(expected)); }
  catch (e) { return false; }
}

/* ---------------- passwords (scrypt) ---------------- */
function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("base64url");
  return { salt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash)); }
  catch (e) { return false; }
}

/* ---------------- stateless sessions (HMAC) ---------------- */
function sessionSecret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("SESSION_SECRET (or ADMIN_PASSWORD) env var is required");
  return crypto.createHash("sha256").update("docedit-session:" + s).digest();
}
function signSession(uid, days = 30) {
  const payload = Buffer.from(JSON.stringify({
    uid, exp: Date.now() + days * 86400000
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret())
    .update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", sessionSecret())
    .update(payload).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch (e) { return null; }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.uid || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

/* resolve the requesting user (or null for guests) */
async function sessionUser(req) {
  const token = (req.headers && req.headers["x-session"]) ||
    (req.query && req.query.s) || (req.body && req.body.session);
  const data = verifySession(token);
  if (!data) return null;
  const user = await getJson("user:" + data.uid);
  return user || null;
}

/* ---------------- usernames ---------------- */
function normalizeUsername(u) {
  u = String(u || "").trim().toLowerCase();
  return /^[a-z0-9_.-]{3,32}$/.test(u) ? u : null;
}

/* ---------------- doc access helper ----------------
   Returns { level: "owner"|"edit"|"read"|null } for a session user on a doc. */
function userDocAccess(doc, user) {
  if (!user) return null;
  if (doc.owner && doc.owner === user.id) return "owner";
  const role = doc.sharedWith && doc.sharedWith[user.id];
  if (role) return role; // "read" | "edit"
  return null;
}

module.exports = {
  redis, getJson, setJson, delKey, rid,
  cors, send, preflight, getIp, rateLimit,
  checkPassword, hashPassword, verifyPassword,
  signSession, verifySession, sessionUser,
  normalizeUsername, userDocAccess
};
