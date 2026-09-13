/**
 * Cloudflare Worker for FreeBuddy Freebie Catalog & Community Reviews API.
 *
 * Provides:
 * - GET /api/providers : Approved runtime providers from D1 (submissions still go through GitHub PR)
 * - GET /api/summary : Aggregated review scores & vote stats for all providers
 * - GET /api/reviews?providerId=xxx : Recent reviews and stats for a specific provider
 * - POST /api/reviews : Submit or update a review (authenticated via FreeBuddy client)
 * - POST /api/votes : Submit daily availability vote (authenticated via FreeBuddy client)
 * - Static Assets fallback for index.html, app.js, styles.css, providers.json, etc.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-FreeBuddy-Device-Id",
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

function verifyClientAuth(request) {
  const deviceId = request.headers.get("x-freebuddy-device-id")?.trim();

  if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized_client",
      message: "缺少客户端设备标识，仅支持在 FreeBuddy 客户端内打分与评价。"
    };
  }

  return { ok: true, deviceId };
}

function findD1Database(env) {
  if (!env || typeof env !== "object") return null;
  const preferredKeys = [
    "DB",
    "db",
    "freebie_db",
    "freebie-db",
    "FREEBIE_DB",
    "d1",
    "D1",
    "database",
    "DATABASE",
    "DB_FREEBIE"
  ];
  for (const k of preferredKeys) {
    if (env[k] && typeof env[k].prepare === "function") {
      return env[k];
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (k !== "ASSETS" && v && typeof v.prepare === "function") {
      return v;
    }
  }
  return null;
}

const PROVIDER_PROTOCOLS = ["openai-chat", "openai-responses", "anthropic", "deepseek"];
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const VERIFIED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LENGTH = 80;
const MAX_URL_LENGTH = 2048;

function parseJsonSafe(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// The static catalog only ships https URLs (providers.schema.json enforces
// `^https://` on every URL field), so runtime rows must not be able to weaken
// that contract and inject a clickable non-https link.
function isSafeHttpsUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

// Icons are either https URLs or lobehub slugs. Anything else (including a
// protocol-relative `//host/x.svg`) is dropped so it can never become an asset URL.
function isSafeIcon(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return isSafeHttpsUrl(trimmed) || /^[a-z0-9][a-z0-9-]*$/i.test(trimmed);
}

function sanitizeModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) return null;
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) return null;
  const clean = { id };
  if (typeof model.name === "string" && model.name.trim()) clean.name = model.name.trim();
  if (Number.isFinite(model.contextWindow) && model.contextWindow > 0) clean.contextWindow = model.contextWindow;
  if (model.supportsVision === true) clean.supportsVision = true;
  return clean;
}

// Explicit application-layer validation for one runtime provider.
// schema.sql CHECK constraints are only a backstop: they are not a JSON Schema
// replacement, and rows can also arrive through manual admin imports that bypass
// the review flow. Every record is re-checked here before it is served.
function validateProvider(provider) {
  const errors = [];
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    return { ok: false, errors: ["not_an_object"] };
  }
  if (typeof provider.id !== "string" || !PROVIDER_ID_PATTERN.test(provider.id)) errors.push("invalid_id");
  if (typeof provider.name !== "string" || !provider.name.trim() || provider.name.length > MAX_NAME_LENGTH) {
    errors.push("invalid_name");
  }
  if (provider.region !== undefined && provider.region !== "cn" && provider.region !== "global") {
    errors.push("invalid_region");
  }
  if (!PROVIDER_PROTOCOLS.includes(provider.protocol)) errors.push("invalid_protocol");
  if (!Array.isArray(provider.models) || provider.models.length === 0) errors.push("empty_models");
  if (!isSafeHttpsUrl(provider.baseUrl)) errors.push("unsafe_base_url");
  if (provider.homepage !== undefined && !isSafeHttpsUrl(provider.homepage)) errors.push("unsafe_homepage");
  if (provider.consoleUrl !== undefined && !isSafeHttpsUrl(provider.consoleUrl)) errors.push("unsafe_consoleUrl");
  if (provider.icon !== undefined && !isSafeIcon(provider.icon)) errors.push("unsafe_icon");
  if (provider.contextWindow !== undefined && !(Number.isFinite(provider.contextWindow) && provider.contextWindow > 0)) {
    errors.push("invalid_contextWindow");
  }
  return { ok: errors.length === 0, errors };
}

// Map a D1 providers row to the camelCase Provider object used by the page.
// Unsafe optional fields (homepage / consoleUrl / icon) are cleared, then the whole
// record must pass validateProvider() or it is dropped, so broken data never reaches
// the renderer.
function toProviderObject(row) {
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const baseUrl = typeof row.base_url === "string" ? row.base_url.trim() : "";

  const provider = { id, name };

  if (isSafeIcon(row.icon)) provider.icon = row.icon.trim();
  if (row.region === "cn" || row.region === "global") provider.region = row.region;
  if (isSafeHttpsUrl(row.homepage)) provider.homepage = row.homepage.trim();
  if (isSafeHttpsUrl(row.console_url)) provider.consoleUrl = row.console_url.trim();

  const freeTierSummary = parseJsonSafe(row.free_tier_summary, null);
  if (freeTierSummary && typeof freeTierSummary === "object" && !Array.isArray(freeTierSummary)) {
    const summary = {};
    for (const [lang, text] of Object.entries(freeTierSummary)) {
      if (typeof text === "string" && text.trim()) summary[lang] = text.trim();
    }
    if (Object.keys(summary).length > 0) provider.freeTierSummary = summary;
  }

  provider.protocol = PROVIDER_PROTOCOLS.includes(row.protocol) ? row.protocol : "openai-chat";

  const protocols = parseJsonSafe(row.protocols, null);
  if (Array.isArray(protocols)) {
    const valid = [...new Set(protocols.filter((p) => PROVIDER_PROTOCOLS.includes(p)))];
    if (valid.length > 0) provider.protocols = valid;
  }

  provider.baseUrl = baseUrl;
  if (typeof row.env_key === "string" && ENV_KEY_PATTERN.test(row.env_key.trim())) {
    provider.envKey = row.env_key.trim();
  }

  const models = parseJsonSafe(row.models, []);
  provider.models = (Array.isArray(models) ? models : []).map(sanitizeModel).filter(Boolean);

  if (Number.isFinite(row.context_window) && row.context_window > 0) provider.contextWindow = row.context_window;
  if (typeof row.verified_at === "string" && VERIFIED_AT_PATTERN.test(row.verified_at.trim())) {
    provider.verifiedAt = row.verified_at.trim();
  }

  // Milliseconds since epoch of the first merge into the runtime catalog (the sync upsert
  // preserves created_at on update). Deliberately the only runtime bookkeeping field that
  // leaves the API: it lets the catalog list the newest provider first without exposing
  // status / submitted_by / updated_at.
  if (Number.isFinite(row.created_at) && row.created_at > 0) provider.createdAt = row.created_at;

  const validation = validateProvider(provider);
  if (!validation.ok) {
    console.warn(
      `[api/providers] dropped invalid runtime provider "${id || "(missing id)"}": ${validation.errors.join(", ")}`
    );
    return null;
  }
  return provider;
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = findD1Database(env);

  // Diagnostic endpoint for verifying bindings
  if (url.pathname === "/api/debug" && request.method === "GET") {
    const keys = env ? Object.keys(env) : [];
    let dbStatus = "none";
    let reviewCount = null;
    let dbError = null;
    if (db) {
      try {
        const row = await db.prepare("SELECT COUNT(*) as c FROM reviews").first();
        dbStatus = "connected";
        reviewCount = row?.c;
      } catch (e) {
        dbStatus = "error";
        dbError = e.message;
      }
    }
    return jsonResponse({
      ok: true,
      envKeys: keys,
      hasDb: !!db,
      dbStatus,
      reviewCount,
      dbError
    });
  }

  // GET /api/providers : approved runtime providers only.
  // Read-only by design: new providers are reviewed via GitHub PR first.
  // Ordered newest-added first (providers.created_at survives re-syncs), which the page
  // re-applies after merging with the reviewed static catalog.
  if (url.pathname === "/api/providers" && request.method === "GET") {
    if (!db) {
      return jsonResponse({ ok: true, providers: [] });
    }
    try {
      const rows = await db
        .prepare(
          `SELECT id, name, icon, region, homepage, console_url, free_tier_summary,
                  protocol, protocols, base_url, env_key, models, context_window, verified_at,
                  created_at
           FROM providers
           WHERE status = 'approved'
           ORDER BY created_at DESC, id ASC`
        )
        .all();

      const providers = [];
      for (const row of rows?.results || []) {
        const provider = toProviderObject(row);
        if (provider) providers.push(provider);
      }

      return jsonResponse({ ok: true, providers });
    } catch (err) {
      // Missing table or broken binding must never take the static catalog down.
      console.warn("[api/providers] query failed:", err.message);
      return jsonResponse({ ok: true, providers: [] });
    }
  }

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
        updatedAt: r.updated_at
      }));

      return jsonResponse({ ok: true, providerId, stats, reviews });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  // POST /api/reviews
  if (url.pathname === "/api/reviews" && request.method === "POST") {
    const auth = verifyClientAuth(request);
    if (!auth.ok) {
      return jsonResponse(auth, auth.status);
    }
    if (!db) {
      const keys = env ? Object.keys(env).filter(k => k !== "ASSETS") : [];
      return jsonResponse({
        ok: false,
        error: "no_db",
        message: `数据库未绑定或变量名未对齐（检测到的变量: [${keys.join(", ") || "无"}]，请在 Cloudflare 绑定 D1 并将变量名设为 DB）`
      }, 503);
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
    const auth = verifyClientAuth(request);
    if (!auth.ok) {
      return jsonResponse(auth, auth.status);
    }
    if (!db) {
      const keys = env ? Object.keys(env).filter(k => k !== "ASSETS") : [];
      return jsonResponse({
        ok: false,
        error: "no_db",
        message: `数据库未绑定或变量名未对齐（检测到的变量: [${keys.join(", ") || "无"}]，请在 Cloudflare 绑定 D1 并将变量名设为 DB）`
      }, 503);
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
