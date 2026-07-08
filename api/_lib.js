/* DocEdit serverless helpers — zero-dependency Upstash Redis REST client */
"use strict";

const crypto = require("crypto");

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Redis is not configured (set UPSTASH_REDIS_REST_URL / _TOKEN)");
  }
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "content-type": "application/json"
    },
    body: JSON.stringify(cmd)
  });
  const data = await res.json();
  if (data.error) throw new Error("Redis: " + data.error);
  return data.result;
}

async function getJson(key) {
  const v = await redis("GET", key);
  return v ? JSON.parse(v) : null;
}

async function setJson(key, obj) {
  return redis("SET", key, JSON.stringify(obj));
}

async function delKey(key) {
  return redis("DEL", key);
}

function rid(bytes = 16) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function send(res, code, obj) {
  cors(res);
  res.status(code).json(obj);
}

/* returns true if handled (OPTIONS preflight) */
function preflight(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD env var is not set on the server");
  if (typeof pw !== "string" || pw.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

module.exports = { redis, getJson, setJson, delKey, rid, send, preflight, checkPassword };
