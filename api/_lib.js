/* DocEdit serverless helpers — zero-dependency Upstash Redis REST client */
"use strict";

const crypto = require("crypto");

/* Supports BOTH storage styles:
   1) Upstash REST  — UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/_TOKEN
   2) Any Redis TCP — REDIS_URL (redis:// or rediss://), e.g. Vercel Marketplace "Redis" */
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
