/**
 * Cloudflare Worker for FreeBuddy Freebie Catalog & Community Reviews API.
 *
 * Provides:
 * - GET /api/summary : Aggregated review scores & vote stats for all providers
 * - GET /api/reviews?providerId=xxx : Recent reviews and stats for a specific provider
 * - POST /api/reviews : Submit or update a review (authenticated via FreeBuddy client)
 * - POST /api/votes : Submit daily availability vote (authenticated via FreeBuddy client)
 * - Static Assets fallback for index.html, app.js, styles.css, providers.json, etc.
 */

const DEFAULT_CLIENT_AUTH_SECRET = "fb_sec_v1_8f9c2d1b4e6a0375";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-FreeBuddy-Device-Id, X-FreeBuddy-Timestamp, X-FreeBuddy-Signature",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

async function computeHmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyClientAuth(request, env) {
  const deviceId = request.headers.get("x-freebuddy-device-id");
  const timestamp = request.headers.get("x-freebuddy-timestamp");
  const signature = request.headers.get("x-freebuddy-signature");

  if (!deviceId || !timestamp || !signature) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized_client",
      message: "缺少客户端认证标识，仅支持在 FreeBuddy 客户端内打分与评价。"
    };
  }

  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 10 * 60 * 1000) {
    return {
      ok: false,
      status: 401,
      error: "expired_timestamp",
      message: "认证时间戳已失效，请重试。"
    };
  }

  const url = new URL(request.url);
  const payload = `${request.method.toUpperCase()}:${url.pathname}:${deviceId}:${timestamp}`;
  const secret = env?.CLIENT_SECRET || DEFAULT_CLIENT_AUTH_SECRET;
  const expectedSig = await computeHmacSha256(secret, payload);

  if (expectedSig !== signature.toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: "forbidden_client",
      message: "签名无效，仅支持在 FreeBuddy 客户端内打分与评价。"
    };
  }

  return { ok: true, deviceId };
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = env?.DB;

  // GET /api/summary
  if (url.pathname === "/api/summary" && request.method === "GET") {
    if (!db) {
      return jsonResponse({ ok: true, summary: {} });
    }
    try {
      const reviewRows = await db
        .prepare(
          "SELECT provider_id, COUNT(*) as review_count, AVG(rating) as avg_rating FROM reviews GROUP BY provider_id"
        )
        .all();

      const voteRows = await db
        .prepare(
          "SELECT provider_id, SUM(CASE WHEN vote_type = 'working' THEN 1 ELSE 0 END) as working_votes, SUM(CASE WHEN vote_type = 'failed' THEN 1 ELSE 0 END) as failed_votes FROM votes GROUP BY provider_id"
        )
        .all();

      const summary = {};

      for (const row of reviewRows?.results || []) {
        const pid = row.provider_id;
        summary[pid] = summary[pid] || {
          ratingAvg: 0,
          reviewCount: 0,
          workingVotes: 0,
          failedVotes: 0,
          availability: null
        };
        summary[pid].reviewCount = Number(row.review_count) || 0;
        summary[pid].ratingAvg = Math.round((Number(row.avg_rating) || 0) * 10) / 10;
      }

      for (const row of voteRows?.results || []) {
        const pid = row.provider_id;
        summary[pid] = summary[pid] || {
          ratingAvg: 0,
          reviewCount: 0,
          workingVotes: 0,
          failedVotes: 0,
          availability: null
        };
        const working = Number(row.working_votes) || 0;
        const failed = Number(row.failed_votes) || 0;
        summary[pid].workingVotes = working;
        summary[pid].failedVotes = failed;
        const total = working + failed;
        summary[pid].availability = total > 0 ? Math.round((working / total) * 100) : null;
      }

      return jsonResponse({ ok: true, summary });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  // GET /api/reviews?providerId=xxx
  if (url.pathname === "/api/reviews" && request.method === "GET") {
    const providerId = url.searchParams.get("providerId")?.trim();
    if (!providerId) {
      return jsonResponse({ ok: false, error: "missing_provider_id" }, 400);
    }
    if (!db) {
      return jsonResponse({
        ok: true,
        providerId,
        stats: { ratingAvg: 0, reviewCount: 0, workingVotes: 0, failedVotes: 0, availability: null },
        reviews: []
      });
    }
    try {
      const statsReview = await db
        .prepare("SELECT COUNT(*) as review_count, AVG(rating) as avg_rating FROM reviews WHERE provider_id = ?")
        .bind(providerId)
        .first();

      const statsVote = await db
        .prepare(
          "SELECT SUM(CASE WHEN vote_type = 'working' THEN 1 ELSE 0 END) as working_votes, SUM(CASE WHEN vote_type = 'failed' THEN 1 ELSE 0 END) as failed_votes FROM votes WHERE provider_id = ?"
        )
        .bind(providerId)
        .first();

      const list = await db
        .prepare(
          "SELECT id, author, rating, content, created_at, updated_at FROM reviews WHERE provider_id = ? ORDER BY created_at DESC LIMIT 50"
        )
        .bind(providerId)
        .all();

      const working = Number(statsVote?.working_votes) || 0;
      const failed = Number(statsVote?.failed_votes) || 0;
      const totalVotes = working + failed;

      const stats = {
        ratingAvg: Math.round((Number(statsReview?.avg_rating) || 0) * 10) / 10,
        reviewCount: Number(statsReview?.review_count) || 0,
        workingVotes: working,
        failedVotes: failed,
        availability: totalVotes > 0 ? Math.round((working / totalVotes) * 100) : null
      };

      const reviews = (list?.results || []).map((r) => ({
        id: r.id,
        author: r.author,
        rating: r.rating,
        content: r.content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        isVerifiedClient: true
      }));

      return jsonResponse({ ok: true, providerId, stats, reviews });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  // POST /api/reviews
  if (url.pathname === "/api/reviews" && request.method === "POST") {
    const auth = await verifyClientAuth(request, env);
    if (!auth.ok) {
      return jsonResponse(auth, auth.status);
    }
    if (!db) {
      return jsonResponse({ ok: false, error: "no_db", message: "数据库未配置，请在 Cloudflare 绑定 D1" }, 503);
    }

    try {
      const body = await request.json();
      const providerId = String(body?.providerId || "").trim();
      const rating = parseInt(body?.rating, 10);
      const content = String(body?.content || "").trim();
      const author = String(body?.author || "").trim() || "FreeBuddy 网友";

      if (!providerId || providerId.length > 64) {
        return jsonResponse({ ok: false, error: "invalid_provider_id" }, 400);
      }
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return jsonResponse({ ok: false, error: "invalid_rating", message: "评分必须在 1 到 5 星之间" }, 400);
      }
      if (!content || content.length < 2 || content.length > 300) {
        return jsonResponse({ ok: false, error: "invalid_content", message: "评价内容需在 2 到 300 字之间" }, 400);
      }

      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO reviews (provider_id, device_id, author, rating, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, device_id) DO UPDATE SET
             author = excluded.author,
             rating = excluded.rating,
             content = excluded.content,
             updated_at = excluded.updated_at`
        )
        .bind(providerId, auth.deviceId, author.slice(0, 32), rating, content, now, now)
        .run();

      return jsonResponse({ ok: true, message: "评价已发布" });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  // POST /api/votes
  if (url.pathname === "/api/votes" && request.method === "POST") {
    const auth = await verifyClientAuth(request, env);
    if (!auth.ok) {
      return jsonResponse(auth, auth.status);
    }
    if (!db) {
      return jsonResponse({ ok: false, error: "no_db", message: "数据库未配置，请在 Cloudflare 绑定 D1" }, 503);
    }

    try {
      const body = await request.json();
      const providerId = String(body?.providerId || "").trim();
      const vote = String(body?.vote || "").trim();

      if (!providerId || providerId.length > 64) {
        return jsonResponse({ ok: false, error: "invalid_provider_id" }, 400);
      }
      if (vote !== "working" && vote !== "failed") {
        return jsonResponse({ ok: false, error: "invalid_vote_type", message: "投票类型必须为 working 或 failed" }, 400);
      }

      const voteDate = new Date().toISOString().slice(0, 10);
      const now = Date.now();

      await db
        .prepare(
          `INSERT INTO votes (provider_id, device_id, vote_type, vote_date, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, device_id, vote_date) DO UPDATE SET
             vote_type = excluded.vote_type,
             created_at = excluded.created_at`
        )
        .bind(providerId, auth.deviceId, vote, voteDate, now)
        .run();

      return jsonResponse({ ok: true, message: "投票已记录" });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  return jsonResponse({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    // Delegate all static assets to Cloudflare Assets
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
