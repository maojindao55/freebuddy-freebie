(function () {
  "use strict";

  const bridge = window.FreeBuddyBridge;
  const params = new URLSearchParams(location.search);
  const isEmbedded = (bridge && bridge.embedded) || params.get("embed") === "1" || window.parent !== window;
  if (isEmbedded) {
    document.documentElement.classList.add("embedded");
  }

  const STRINGS = {
    "zh-CN": {
      title: "白嫖兄弟",
      subtitle: "免费专区",
      slogan: "不白嫖无兄弟，让穷兄弟也能用得上AI",
      lead:
        "这些服务商提供免费模型或新用户免费额度。点「一键导入」即可在 FreeBuddy 里生成一个 BYOK 自定义 Agent，API Key 只会在 FreeBuddy 的原生窗口里输入，不经过本页面。",
      filterAll: "全部",
      filterCn: "国内直连",
      filterGlobal: "海外",
      disclaimer:
        '免费政策随时变化，以各服务商官网为准。发现过期信息欢迎到 <a href="https://github.com/maojindao55/freebuddy-freebie/pulls" target="_blank" rel="noopener noreferrer">GitHub 提交 PR</a>，或 <a href="https://qm.qq.com/q/Obv3kViheo" target="_blank" rel="noopener noreferrer">加入【FreeBuddy白嫖兄弟群】</a> 交流爆料。',
      statusConnecting: "正在连接 FreeBuddy…",
      statusConnected: "已连接 FreeBuddy，可以一键导入",
      statusStandalone: "在 FreeBuddy 侧栏的「白嫖」页打开本页，即可一键导入",
      regionCn: "国内直连",
      regionGlobal: "海外",
      protocolOpenai: "OpenAI 兼容",
      protocolAnthropic: "Anthropic 兼容",
      protocolDeepseek: "DeepSeek",
      homepage: "官网",
      getKey: "领取 Key",
      import: "一键导入",
      importAgain: "再导入一个",
      importing: "等待 FreeBuddy 确认…",
      imported: "已导入",
      runtimeMissing: "需要先安装 {runtime} CLI，导入时 FreeBuddy 会给出指引",
      verified: "核验于 {date}",
      updated: "目录更新于 {date}",
      count: "{n} 家服务商",
      refresh: "刷新页面",
      importFailed: "导入失败：{error}",
      loadFailed: "目录加载失败，请刷新重试。",
      reviewsCount: "评测详情 ({n})",
      working: "还能用",
      failed: "已失效",
      workingPercent: "{percent}% 可用",
      noFeedback: "暂无反馈",
      clientOnlyTitle: "仅支持在 FreeBuddy 客户端内打分与评价",
      clientOnlyDesc: "所有评价均来自真实的客户端使用者。立即下载 FreeBuddy 体验完整套件与社区评测！",
      downloadClient: "下载 FreeBuddy 客户端",
      verifiedUser: "客户端实测",
      authorPlaceholder: "你的昵称 (选填)",
      contentPlaceholder: "说说你的使用体验、响应速度、真实模型效果或避坑指南...",
      submitReview: "发表评价",
      submitting: "提交中…",
      noReviewsYet: "暂无评价，快来抢先点评！",
      clientOnlyVoteTip: "仅支持在 FreeBuddy 客户端内参与可用度投票",
      reviewFailed: "评价提交失败：{error}",
      voteFailed: "投票失败：{error}",
      supportedModels: "支持模型与特性",
      healthAvailTip: "基于社区近 24 小时反馈统计",
      votePrompt: "您今日实测可用吗？",
      reviewsTitle: "社区真实评测"
    },
    en: {
      title: "Freebie Buddies",
      subtitle: "Free Models",
      slogan: "No freebie, no buddy. Making AI accessible for everyone.",
      lead:
        "These providers offer free models or free credits for new accounts. Click Import to create a BYOK custom agent in FreeBuddy. Your API key is entered in FreeBuddy's native dialog and never touches this page.",
      filterAll: "All",
      filterCn: "China (direct)",
      filterGlobal: "Global",
      disclaimer:
        'Free tiers change often; the provider\'s website is the source of truth. PRs are welcome on <a href="https://github.com/maojindao55/freebuddy-freebie/pulls" target="_blank" rel="noopener noreferrer">GitHub</a>, or join our <a href="https://qm.qq.com/q/Obv3kViheo" target="_blank" rel="noopener noreferrer">QQ Group Chat</a>.',
      statusConnecting: "Connecting to FreeBuddy…",
      statusConnected: "Connected to FreeBuddy — one-click import is ready",
      statusStandalone: "Open this page from the Free Tier entry in FreeBuddy's sidebar to import with one click",
      regionCn: "China",
      regionGlobal: "Global",
      protocolOpenai: "OpenAI-compatible",
      protocolAnthropic: "Anthropic-compatible",
      protocolDeepseek: "DeepSeek",
      homepage: "Website",
      getKey: "Get API key",
      import: "Import",
      importAgain: "Import another",
      importing: "Waiting for FreeBuddy…",
      imported: "Imported",
      runtimeMissing: "Requires the {runtime} CLI; FreeBuddy will guide you during import",
      verified: "Verified {date}",
      updated: "Catalog updated {date}",
      count: "{n} providers",
      refresh: "Refresh page",
      importFailed: "Import failed: {error}",
      loadFailed: "Could not load the catalog. Please refresh.",
      reviewsCount: "Reviews & Details ({n})",
      working: "Working",
      failed: "Broken",
      workingPercent: "{percent}% working",
      noFeedback: "No feedback",
      clientOnlyTitle: "Ratings & reviews only available in FreeBuddy",
      clientOnlyDesc: "All reviews come from verified FreeBuddy client users. Download FreeBuddy to try models and join community feedback!",
      downloadClient: "Download FreeBuddy",
      verifiedUser: "Client Verified",
      authorPlaceholder: "Your nickname (optional)",
      contentPlaceholder: "Share your experience, speed, tips, or caveats...",
      submitReview: "Submit Review",
      submitting: "Submitting…",
      noReviewsYet: "No reviews yet. Be the first to share your experience!",
      clientOnlyVoteTip: "Voting is only available inside the FreeBuddy client",
      reviewFailed: "Failed to submit review: {error}",
      voteFailed: "Failed to vote: {error}",
      supportedModels: "Supported Models & Features",
      healthAvailTip: "Based on community feedback in the last 24 hours",
      votePrompt: "Is it working for you today?",
      reviewsTitle: "Community Reviews"
    }
  };

  const RUNTIME_LABEL = { codex: "Codex", claude: "Claude Code", deepseek: "DeepSeek" };

  const state = {
    locale: normalizeLocale(params.get("lang") || navigator.language),
    theme: params.get("theme") === "dark" ? "dark" : "light",
    region: "all",
    providers: [],
    updatedAt: null,
    connected: false,
    importedProviderIds: new Set(),
    runtimes: null,
    busy: new Set(),
    summary: {},
    activeModalProviderId: null,
    reviewsCache: {},
    submittingVote: new Set(),
    userVotes: (() => {
      try {
        return JSON.parse(localStorage.getItem("fb_user_votes") || "{}");
      } catch {
        return {};
      }
    })()
  };

  function normalizeLocale(tag) {
    return String(tag || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }

  function t(key, vars) {
    const table = STRINGS[state.locale] || STRINGS.en;
    let text = table[key] || STRINGS.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach((name) => {
        text = text.replace(`{${name}}`, String(vars[name]));
      });
    }
    return text;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRelativeTime(ts) {
    const diff = Date.now() - Number(ts);
    if (diff < 60 * 1000) return state.locale === "zh-CN" ? "刚刚" : "just now";
    if (diff < 60 * 60 * 1000)
      return state.locale === "zh-CN"
        ? `${Math.floor(diff / 60000)} 分钟前`
        : `${Math.floor(diff / 60000)}m ago`;
    if (diff < 24 * 60 * 60 * 1000)
      return state.locale === "zh-CN"
        ? `${Math.floor(diff / 3600000)} 小时前`
        : `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 30 * 24 * 60 * 60 * 1000)
      return state.locale === "zh-CN"
        ? `${Math.floor(diff / 86400000)} 天前`
        : `${Math.floor(diff / 86400000)}d ago`;
    return new Date(Number(ts)).toISOString().slice(0, 10);
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
  }

  function applyLocale() {
    document.documentElement.lang = state.locale;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const text = t(el.getAttribute("data-i18n-title"));
      el.setAttribute("title", text);
      el.setAttribute("aria-label", text);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
      el.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", openLink);
      });
    });
  }

  function runtimeKey(protocol) {
    if (protocol === "anthropic") return "claude";
    if (protocol === "deepseek") return "deepseek";
    return "codex";
  }

  function protocolLabel(protocol) {
    if (protocol === "anthropic") return t("protocolAnthropic");
    if (protocol === "deepseek") return t("protocolDeepseek");
    return t("protocolOpenai");
  }

  function summaryFor(provider) {
    const summary = provider.freeTierSummary || {};
    return summary[state.locale] || summary.en || Object.values(summary)[0] || "";
  }

  function getFaviconFallback(provider) {
    if (!provider || !provider.homepage) return "";
    try {
      const domain = new URL(provider.homepage).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return "";
    }
  }

  function resolveIcon(provider) {
    if (provider && provider.icon) {
      if (provider.icon.startsWith("https://") || provider.icon.startsWith("/")) {
        return provider.icon;
      }
      return `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.0/icons/${provider.icon}.svg`;
    }
    return getFaviconFallback(provider);
  }

  function openLink(event) {
    if (!state.connected) return; // standalone: let the browser handle target=_blank
    event.preventDefault();
    bridge.openExternal(event.currentTarget.href);
  }

  function setStatus(text, kind) {
    const el = document.getElementById("host-status");
    el.textContent = text;
    el.dataset.kind = kind || "";
  }

  function renderMeta() {
    const el = document.getElementById("catalog-meta");
    const parts = [t("count", { n: state.providers.length })];
    if (state.updatedAt) parts.push(t("updated", { date: state.updatedAt }));
    el.textContent = parts.join(" · ");
  }

  function updateCardCommunity(node, providerId) {
    const s = state.summary[providerId] || {
      ratingAvg: 0,
      reviewCount: 0,
      workingVotes: 0,
      failedVotes: 0,
      availability: null
    };

    // 1. Rating
    const ratingVal = node.querySelector(".rating-val");
    const ratingCount = node.querySelector(".rating-count");
    if (ratingVal && ratingCount) {
      ratingVal.textContent = s.reviewCount > 0 ? s.ratingAvg.toFixed(1) : "-.-";
      ratingCount.textContent = `(${s.reviewCount})`;
    }

    // 2. Availability
    const availEl = node.querySelector(".community-avail");
    const availText = node.querySelector(".avail-text");
    if (availEl && availText) {
      availEl.classList.remove("good", "warn", "bad");
      if (s.availability !== null && s.availability !== undefined) {
        availText.textContent = t("workingPercent", { percent: s.availability });
        if (s.availability >= 80) availEl.classList.add("good");
        else if (s.availability >= 50) availEl.classList.add("warn");
        else availEl.classList.add("bad");
      } else {
        availText.textContent = t("noFeedback");
      }
    }

    // 3. Vote counts & voted state
    const voteWorkingBtn = node.querySelector(".vote-working");
    const voteFailedBtn = node.querySelector(".vote-failed");
    if (voteWorkingBtn) {
      voteWorkingBtn.querySelector(".vote-count").textContent = String(s.workingVotes || 0);
      voteWorkingBtn.classList.toggle("voted", state.userVotes[providerId] === "working");
    }
    if (voteFailedBtn) {
      voteFailedBtn.querySelector(".vote-count").textContent = String(s.failedVotes || 0);
      voteFailedBtn.classList.toggle("voted", state.userVotes[providerId] === "failed");
    }

    // 4. Detail button label
    const detailLabel = node.querySelector(".detail-btn-label");
    if (detailLabel) {
      detailLabel.textContent = t("reviewsCount", { n: s.reviewCount || 0 });
    }
  }

  function updateAllCardStats() {
    document.querySelectorAll(".card[data-provider-id]").forEach((node) => {
      const pid = node.dataset.providerId;
      if (pid) updateCardCommunity(node, pid);
    });

    if (state.activeModalProviderId) {
      updateModalHealth(state.activeModalProviderId);
    }
  }

  async function handleVote(providerId, voteType) {
    if (!state.connected || !bridge || !bridge.embedded) {
      window.alert(t("clientOnlyVoteTip"));
      return;
    }
    if (state.submittingVote.has(providerId)) return;
    state.submittingVote.add(providerId);

    try {
      const res = await bridge.submitVote({ providerId, vote: voteType });
      if (res && res.ok) {
        state.userVotes[providerId] = voteType;
        try {
          localStorage.setItem("fb_user_votes", JSON.stringify(state.userVotes));
        } catch {
          // ignore
        }
        // Optimistic count bump
        const s = state.summary[providerId] || {
          ratingAvg: 0,
          reviewCount: 0,
          workingVotes: 0,
          failedVotes: 0,
          availability: null
        };
        if (voteType === "working") s.workingVotes += 1;
        else s.failedVotes += 1;
        const total = s.workingVotes + s.failedVotes;
        s.availability = Math.round((s.workingVotes / total) * 100);
        state.summary[providerId] = s;
        updateAllCardStats();
      } else {
        window.alert(t("voteFailed", { error: res?.error || "unknown" }));
      }
    } catch (err) {
      window.alert(t("voteFailed", { error: err?.message || String(err) }));
    } finally {
      state.submittingVote.delete(providerId);
    }
  }

  async function fetchReviews(providerId) {
    try {
      const res = await fetch(`./api/reviews?providerId=${encodeURIComponent(providerId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok) {
        state.reviewsCache[providerId] = data;
        if (data.stats) {
          state.summary[providerId] = data.stats;
          updateAllCardStats();
        }
        if (state.activeModalProviderId === providerId) {
          renderModalReviews(providerId);
        }
      }
    } catch (err) {
      console.warn("[freebie] fetch reviews failed", err);
    }
  }

  /* --- Modal Logic --- */

  function updateModalHealth(providerId) {
    const modal = document.getElementById("detail-modal");
    if (!modal || modal.hidden || state.activeModalProviderId !== providerId) return;

    const s = state.summary[providerId] || {
      ratingAvg: 0,
      reviewCount: 0,
      workingVotes: 0,
      failedVotes: 0,
      availability: null
    };

    // Health Score Num
    const numEl = modal.querySelector(".health-score-num");
    if (numEl) numEl.textContent = s.reviewCount > 0 ? s.ratingAvg.toFixed(1) : "-.-";

    // Stars
    const starsEl = modal.querySelector(".health-score-stars");
    if (starsEl) {
      const full = Math.round(s.ratingAvg) || 0;
      starsEl.textContent = s.reviewCount > 0 ? "★".repeat(full) + "☆".repeat(5 - full) : "☆☆☆☆☆";
    }

    // Count
    const countEl = modal.querySelector(".health-score-count");
    if (countEl) countEl.textContent = String(s.reviewCount || 0);

    // Availability Pill
    const availPill = modal.querySelector(".health-avail-pill");
    const availText = modal.querySelector(".health-avail-pill .avail-text");
    if (availPill && availText) {
      availPill.classList.remove("good", "warn", "bad");
      if (s.availability !== null && s.availability !== undefined) {
        availText.textContent = t("workingPercent", { percent: s.availability });
        if (s.availability >= 80) availPill.classList.add("good");
        else if (s.availability >= 50) availPill.classList.add("warn");
        else availPill.classList.add("bad");
      } else {
        availText.textContent = t("noFeedback");
      }
    }

    // Votes
    const voteWorkingBtn = modal.querySelector(".modal-vote-working");
    const voteFailedBtn = modal.querySelector(".modal-vote-failed");
    if (voteWorkingBtn) {
      voteWorkingBtn.querySelector(".vote-count").textContent = String(s.workingVotes || 0);
      voteWorkingBtn.classList.toggle("voted", state.userVotes[providerId] === "working");
    }
    if (voteFailedBtn) {
      voteFailedBtn.querySelector(".vote-count").textContent = String(s.failedVotes || 0);
      voteFailedBtn.classList.toggle("voted", state.userVotes[providerId] === "failed");
    }

    // Total review count header
    const reviewsCountEl = modal.querySelector(".modal-reviews-count");
    if (reviewsCountEl) reviewsCountEl.textContent = String(s.reviewCount || 0);
  }

  function renderModalReviews(providerId) {
    const modal = document.getElementById("detail-modal");
    if (!modal || modal.hidden) return;

    const inputZone = modal.querySelector(".modal-review-input-zone");
    const listZone = modal.querySelector(".modal-reviews-list");
    const cached = state.reviewsCache[providerId];
    const reviews = cached?.reviews || [];

    // 1. Input zone
    inputZone.innerHTML = "";
    if (!state.connected) {
      const banner = document.createElement("div");
      banner.className = "client-lock-banner";
      banner.innerHTML = `
        <h4 class="lock-title">🔒 ${escapeHtml(t("clientOnlyTitle"))}</h4>
        <p class="lock-desc">${escapeHtml(t("clientOnlyDesc"))}</p>
        <a class="download-link" href="https://github.com/maojindao55/freebuddy/releases" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(t("downloadClient"))} ➔
        </a>
      `;
      inputZone.appendChild(banner);
    } else {
      let selectedRating = 5;
      const form = document.createElement("form");
      form.className = "review-form";
      form.innerHTML = `
        <div class="review-form-header">
          <div class="stars-selector" role="radiogroup" aria-label="Rating">
            ${[1, 2, 3, 4, 5]
              .map(
                (star) =>
                  `<button type="button" class="star-btn ${star <= 5 ? "selected" : ""}" data-star="${star}">★</button>`
              )
              .join("")}
          </div>
          <span class="client-verified-tag">⚡️ FreeBuddy 客户端已认证</span>
        </div>
        <input type="text" class="review-form-author" maxlength="30" placeholder="${escapeHtml(t("authorPlaceholder"))}" />
        <textarea class="review-form-content" required maxlength="300" placeholder="${escapeHtml(t("contentPlaceholder"))}"></textarea>
        <div class="review-form-actions">
          <span class="form-tip">每个设备对单服务商保留一条评测 · 提交后可随时修改</span>
          <button type="submit" class="review-form-submit">${escapeHtml(t("submitReview"))}</button>
        </div>
      `;

      const starBtns = form.querySelectorAll(".star-btn");
      starBtns.forEach((b) => {
        b.addEventListener("click", () => {
          selectedRating = parseInt(b.dataset.star, 10);
          starBtns.forEach((sb) => {
            sb.classList.toggle("selected", parseInt(sb.dataset.star, 10) <= selectedRating);
          });
        });
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const contentInput = form.querySelector(".review-form-content");
        const authorInput = form.querySelector(".review-form-author");
        const submitBtn = form.querySelector(".review-form-submit");
        const content = contentInput.value.trim();
        const author = authorInput.value.trim();

        if (content.length < 2) return;
        submitBtn.disabled = true;
        submitBtn.textContent = t("submitting");

        try {
          const res = await bridge.submitReview({
            providerId,
            rating: selectedRating,
            content,
            author: author || undefined
          });

          if (res && res.ok) {
            contentInput.value = "";
            fetchReviews(providerId);
            loadCommunitySummary();
          } else {
            window.alert(t("reviewFailed", { error: res?.error || "unknown" }));
          }
        } catch (err) {
          window.alert(t("reviewFailed", { error: err?.message || String(err) }));
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = t("submitReview");
        }
      });

      inputZone.appendChild(form);
    }

    // 2. Reviews list
    listZone.innerHTML = "";
    if (reviews.length === 0) {
      const empty = document.createElement("div");
      empty.className = "reviews-empty";
      empty.textContent = cached ? t("noReviewsYet") : "正在加载评价…";
      listZone.appendChild(empty);
    } else {
      reviews.forEach((r) => {
        const item = document.createElement("div");
        item.className = "review-item";
        const starsStr = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        const timeStr = formatRelativeTime(r.createdAt);

        item.innerHTML = `
          <div class="review-item-head">
            <div class="review-item-user">
              <span class="review-item-author">${escapeHtml(r.author || "FreeBuddy 网友")}</span>
              <span class="review-item-badge">${escapeHtml(t("verifiedUser"))}</span>
            </div>
            <div class="review-item-meta">
              <span class="review-item-stars">${starsStr}</span>
              <span class="review-item-time">${timeStr}</span>
            </div>
          </div>
          <p class="review-item-content">${escapeHtml(r.content)}</p>
        `;
        listZone.appendChild(item);
      });
    }
  }

  function openProviderModal(provider) {
    state.activeModalProviderId = provider.id;
    const modal = document.getElementById("detail-modal");
    if (!modal) return;

    // Set URL hash without scrolling
    if (location.hash !== `#${provider.id}`) {
      try {
        history.replaceState(null, "", `#${provider.id}`);
      } catch {
        location.hash = provider.id;
      }
    }

    // Name & Icon
    modal.querySelector(".modal-name").textContent = provider.name;
    const iconEl = modal.querySelector(".modal-icon");
    const primarySrc = resolveIcon(provider);
    if (primarySrc) {
      iconEl.src = primarySrc;
      iconEl.alt = `${provider.name} icon`;
      iconEl.hidden = false;
    } else {
      iconEl.hidden = true;
    }

    // Tags
    const tagsContainer = modal.querySelector(".modal-tags");
    tagsContainer.textContent = "";
    if (provider.region) {
      const tag = document.createElement("span");
      tag.className = `tag region-${provider.region}`;
      tag.textContent = provider.region === "cn" ? t("regionCn") : t("regionGlobal");
      tagsContainer.appendChild(tag);
    }
    const protocols =
      provider.protocols && provider.protocols.length > 0 ? provider.protocols : [provider.protocol];
    protocols.forEach((p) => {
      const proto = document.createElement("span");
      proto.className = "tag protocol";
      proto.textContent = protocolLabel(p);
      tagsContainer.appendChild(proto);
    });

    // Verified date
    const verifiedEl = modal.querySelector(".modal-verified");
    verifiedEl.textContent = provider.verifiedAt ? t("verified", { date: provider.verifiedAt }) : "";

    // Overview & Summary
    modal.querySelector(".modal-summary").textContent = summaryFor(provider);

    // Links
    const homepage = modal.querySelector(".modal-homepage");
    if (provider.homepage) {
      homepage.href = provider.homepage;
      homepage.textContent = t("homepage");
      homepage.hidden = false;
      homepage.onclick = openLink;
    } else homepage.hidden = true;

    const consoleLink = modal.querySelector(".modal-console");
    if (provider.consoleUrl) {
      consoleLink.href = provider.consoleUrl;
      consoleLink.textContent = t("getKey");
      consoleLink.hidden = false;
      consoleLink.onclick = openLink;
    } else consoleLink.hidden = true;

    // Import button
    const importBtn = modal.querySelector(".modal-import-btn");
    const imported = state.importedProviderIds.has(provider.id);
    const busy = state.busy.has(provider.id);
    importBtn.textContent = busy ? t("importing") : imported ? t("importAgain") : t("import");
    importBtn.disabled = !state.connected || busy;
    importBtn.classList.toggle("secondary", imported);
    importBtn.onclick = () => importProvider(provider);

    // Models list
    const modelsList = modal.querySelector(".modal-models");
    modelsList.textContent = "";
    provider.models.forEach((model) => {
      const li = document.createElement("li");
      li.textContent = model.name || model.id;
      li.title = model.id;
      if (model.supportsVision) li.classList.add("vision");
      modelsList.appendChild(li);
    });

    // Health Board
    updateModalHealth(provider.id);

    // Vote buttons in modal
    const voteWorkingBtn = modal.querySelector(".modal-vote-working");
    if (voteWorkingBtn) {
      voteWorkingBtn.onclick = () => handleVote(provider.id, "working");
    }
    const voteFailedBtn = modal.querySelector(".modal-vote-failed");
    if (voteFailedBtn) {
      voteFailedBtn.onclick = () => handleVote(provider.id, "failed");
    }

    // Render reviews & fetch
    renderModalReviews(provider.id);
    fetchReviews(provider.id);

    // Show modal & prevent body scroll
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeProviderModal() {
    const modal = document.getElementById("detail-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    state.activeModalProviderId = null;
    document.body.style.overflow = "";

    // Clear hash without reload
    if (location.hash) {
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch {
        location.hash = "";
      }
    }
  }

  function checkHashForModal() {
    const hash = location.hash.replace(/^#/, "").trim();
    if (!hash || state.providers.length === 0) return;
    const provider = state.providers.find((p) => p.id === hash);
    if (provider) {
      openProviderModal(provider);
    }
  }

  function renderCards() {
    const root = document.getElementById("providers");
    const template = document.getElementById("provider-card");
    root.textContent = "";
    state.providers
      .filter((p) => state.region === "all" || p.region === state.region)
      .forEach((provider) => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.dataset.providerId = provider.id;

        node.querySelector(".card-name").textContent = provider.name;

        const iconEl = node.querySelector(".card-icon");
        if (iconEl) {
          const primarySrc = resolveIcon(provider);
          if (primarySrc) {
            iconEl.src = primarySrc;
            iconEl.alt = `${provider.name} icon`;
            iconEl.hidden = false;
            iconEl.onerror = () => {
              const fallbackSrc = getFaviconFallback(provider);
              if (fallbackSrc && iconEl.src !== fallbackSrc) {
                iconEl.onerror = () => {
                  iconEl.hidden = true;
                };
                iconEl.src = fallbackSrc;
              } else {
                iconEl.hidden = true;
              }
            };
          } else {
            iconEl.hidden = true;
          }
        }

        const tags = node.querySelector(".card-tags");
        if (provider.region) {
          const tag = document.createElement("span");
          tag.className = `tag region-${provider.region}`;
          tag.textContent = provider.region === "cn" ? t("regionCn") : t("regionGlobal");
          tags.appendChild(tag);
        }
        const protocols =
          provider.protocols && provider.protocols.length > 0 ? provider.protocols : [provider.protocol];
        protocols.forEach((p) => {
          const proto = document.createElement("span");
          proto.className = "tag protocol";
          proto.textContent = protocolLabel(p);
          tags.appendChild(proto);
        });

        const imported = state.importedProviderIds.has(provider.id);
        const badge = node.querySelector(".card-imported");
        badge.hidden = !imported;
        badge.textContent = t("imported");

        node.querySelector(".card-summary").textContent = summaryFor(provider);

        const models = node.querySelector(".card-models");
        provider.models.forEach((model) => {
          const li = document.createElement("li");
          li.textContent = model.name || model.id;
          li.title = model.id;
          if (model.supportsVision) li.classList.add("vision");
          models.appendChild(li);
        });

        const homepage = node.querySelector(".card-homepage");
        if (provider.homepage) {
          homepage.href = provider.homepage;
          homepage.textContent = t("homepage");
          homepage.addEventListener("click", openLink);
        } else homepage.remove();

        const consoleLink = node.querySelector(".card-console");
        if (provider.consoleUrl) {
          consoleLink.href = provider.consoleUrl;
          consoleLink.textContent = t("getKey");
          consoleLink.addEventListener("click", openLink);
        } else consoleLink.remove();

        const btn = node.querySelector(".import-btn");
        const busy = state.busy.has(provider.id);
        btn.textContent = busy ? t("importing") : imported ? t("importAgain") : t("import");
        btn.disabled = !state.connected || busy;
        btn.classList.toggle("secondary", imported);
        btn.addEventListener("click", () => importProvider(provider));

        // Community stats on card
        updateCardCommunity(node, provider.id);

        const voteWorkingBtn = node.querySelector(".vote-working");
        if (voteWorkingBtn) {
          voteWorkingBtn.addEventListener("click", () => handleVote(provider.id, "working"));
        }
        const voteFailedBtn = node.querySelector(".vote-failed");
        if (voteFailedBtn) {
          voteFailedBtn.addEventListener("click", () => handleVote(provider.id, "failed"));
        }

        // Open modal button
        const openDetailBtn = node.querySelector(".open-detail-btn");
        if (openDetailBtn) {
          openDetailBtn.addEventListener("click", () => openProviderModal(provider));
        }

        // Clicking card title also opens detail modal
        const cardTitle = node.querySelector(".card-brand");
        if (cardTitle) {
          cardTitle.style.cursor = "pointer";
          cardTitle.addEventListener("click", () => openProviderModal(provider));
        }

        const verified = node.querySelector(".card-verified");
        const notes = [];
        if (provider.verifiedAt) notes.push(t("verified", { date: provider.verifiedAt }));
        const neededRuntimes = [...new Set(protocols.map(runtimeKey))];
        const allMissing = state.runtimes && neededRuntimes.every((r) => state.runtimes[r] === false);
        if (allMissing) {
          notes.push(t("runtimeMissing", { runtime: neededRuntimes.map((r) => RUNTIME_LABEL[r] || r).join(" / ") }));
          node.classList.add("runtime-missing");
        }
        verified.textContent = notes.join(" · ");

        root.appendChild(node);
      });
  }

  async function importProvider(provider) {
    if (!state.connected || state.busy.has(provider.id)) return;
    state.busy.add(provider.id);
    renderCards();
    if (state.activeModalProviderId === provider.id) {
      const modal = document.getElementById("detail-modal");
      const importBtn = modal?.querySelector(".modal-import-btn");
      if (importBtn) {
        importBtn.textContent = t("importing");
        importBtn.disabled = true;
      }
    }
    try {
      const result = await bridge.importAgent(provider);
      if (result && result.ok) {
        state.importedProviderIds.add(provider.id);
      } else if (result && result.error && result.error !== "cancelled") {
        window.alert(t("importFailed", { error: result.error }));
      }
    } catch (err) {
      window.alert(t("importFailed", { error: err && err.message ? err.message : String(err) }));
    } finally {
      state.busy.delete(provider.id);
      renderCards();
      if (state.activeModalProviderId === provider.id) {
        const modal = document.getElementById("detail-modal");
        const importBtn = modal?.querySelector(".modal-import-btn");
        const imported = state.importedProviderIds.has(provider.id);
        if (importBtn) {
          importBtn.textContent = imported ? t("importAgain") : t("import");
          importBtn.disabled = false;
          importBtn.classList.toggle("secondary", imported);
        }
      }
    }
  }

  function applyHostState(info) {
    state.importedProviderIds = new Set(info.importedProviderIds || []);
    state.runtimes = info.runtimes || null;
  }

  async function connectHost() {
    if (!bridge.embedded) {
      setStatus(t("statusStandalone"), "standalone");
      return;
    }
    setStatus(t("statusConnecting"), "connecting");
    try {
      const info = await bridge.connect(4000);
      state.connected = true;
      if (info.locale) state.locale = normalizeLocale(info.locale);
      if (info.theme === "dark" || info.theme === "light") state.theme = info.theme;
      applyHostState(info);
      applyTheme();
      applyLocale();
      setStatus(t("statusConnected"), "connected");
    } catch {
      setStatus(t("statusStandalone"), "standalone");
    }
    renderMeta();
    renderCards();
    if (state.activeModalProviderId) {
      const p = state.providers.find((item) => item.id === state.activeModalProviderId);
      if (p) openProviderModal(p);
    }
  }

  async function loadCommunitySummary() {
    try {
      const res = await fetch("./api/summary");
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.summary) {
        state.summary = data.summary;
        updateAllCardStats();
      }
    } catch {
      // ignore
    }
  }

  async function loadCatalog(bustCache = false) {
    try {
      const url = bustCache ? `./providers.json?t=${Date.now()}` : "./providers.json";
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.providers = Array.isArray(data.providers) ? data.providers.slice().reverse() : [];
      state.updatedAt = data.updatedAt || null;
    } catch (err) {
      console.error("[freebie] catalog load failed", err);
      document.getElementById("providers").innerHTML =
        `<p class="load-error">${t("loadFailed")}</p>`;
      return;
    }
    renderMeta();
    renderCards();
    loadCommunitySummary();
    checkHashForModal();
  }

  function refreshPage() {
    const btn = document.getElementById("refresh-btn");
    if (btn) btn.classList.add("spinning");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_t", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }

  document.querySelectorAll(".filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.region = btn.dataset.region;
      document.querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === btn));
      renderCards();
    });
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshPage);
  }

  // Close modal bindings
  const closeBtn = document.getElementById("modal-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeProviderModal);
  }

  const modalBackdrop = document.getElementById("detail-modal");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeProviderModal();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.activeModalProviderId) {
      closeProviderModal();
    }
  });

  window.addEventListener("hashchange", () => {
    const hash = location.hash.replace(/^#/, "").trim();
    if (hash) {
      const p = state.providers.find((item) => item.id === hash);
      if (p) openProviderModal(p);
    } else if (state.activeModalProviderId) {
      closeProviderModal();
    }
  });

  bridge.onState(applyHostState);
  bridge.onState(renderCards);

  applyTheme();
  applyLocale();
  loadCatalog();
  connectHost();
})();
