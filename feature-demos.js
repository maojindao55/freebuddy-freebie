(() => {
// These demos belong only to the feature cards. The original hero owns its own animation.
const COPY = {
  zh: {
    titles: ['任务面板，一眼看清', '换个 Agent，接着做', '评审发现问题，修好再交付'],
    descriptions: ['把多个 Agent 的任务集中到一个面板。筛选运行中、待处理和未读结果，直接回到需要你关注的会话。', '保留工作目录，整理目标、进度与下一步，把当前任务转交给另一个 Agent，继续推进。', '实现与评审各司其职。发现问题后交回修复，再次评审通过，才进入最终交付。'],
    windows: ['FreeBuddy · 任务面板', 'FreeBuddy · Agent 转接', 'FreeBuddy · 评审修复'],
    pause: '暂停', play: '播放', replay: '重播', sample: '示例演示 · 不连接真实 Agent',
    board: '任务面板', project: '全部项目', filters: ['全部', '运行中', '待处理', '未读'],
    tasks: ['下载区匹配最新版本', '修复 Windows 安装包签名', 'README 中英文同步', '接入 Kimi CLI 适配器'],
    states: ['读取 → 编辑 → 测试', '需要确认运行命令', '已完成 · 有新结果', '正在检查调用事件'],
    boardCaptions: ['所有任务，集中查看', '筛选待处理，找到需要你的任务', '查看请求，确认后继续', '请求已确认，Agent 继续工作'],
    back: '返回任务面板', request: '运行签名校验？', requestDesc: 'Claude Code 准备检查 Windows 安装包，需要你确认这次命令。', allow: '允许并继续', allowed: '已允许，正在继续校验', allowedDesc: '请求已处理，任务回到运行中。', result: '中英文文档已同步', resultDesc: '补齐 3 处缺失段落，术语和链接已校对。', opened: '回到任务会话', openedDesc: '这里显示该 Agent 的最新进度。',
    handoff: '当前会话', implemented: '下载适配已完成', implementedDesc: 'Codex 已实现芯片匹配与 Release 缓存，接着检查异常和边界情况。', transfer: '转接给其他 Agent', target: '接续 Agent', context: '工作目录与任务摘要', preview: '展开任务摘要', hide: '收起任务摘要', brief: '目标：下载区匹配最新 Release。', progress: '进度：芯片匹配与缓存已完成。', next: '下一步：检查 API 限流与降级。', confirm: '确认转接', cancel: '取消', continued: '接续会话已创建', continuedDesc: '接手 Agent 根据摘要继续检查，沿用原工作目录。', handoffCaptions: ['从当前任务发起转接', '选择最适合下一步的 Agent', '带上目标、进度与下一步', '换个 Agent，工作继续'],
    team: '实现 / 独立评审', steps: ['实现', '首次评审', '修复', '重新评审', '交付'],
    reviewTitles: ['实现完成，进入独立评审', '发现一个边界问题', '修复限流降级逻辑', '重新评审修复结果', '评审通过，可以交付'],
    reviewDescriptions: ['Codex 完成实现，Claude Code 接着检查改动。', 'GitHub API 限流时，下载入口缺少兜底。', 'Codex 保留静态下载地址，并补充异常处理。', 'Claude Code 再次确认问题已修复，检查相关边界。', '实现、修复和复审都已完成，保留完整过程。'],
    reviewActions: ['查看评审意见', '交回 Codex 修复', '提交重新评审', '查看评审结论', '重新演示'],
    reviewCaptions: ['独立视角，检查实现', '问题明确，交回修复', '针对评审意见修复', '修完还要再评审', '复审通过，再交付'],
    checks: ['限流时保留下载入口', '缓存过期后正常刷新', 'macOS 双架构匹配正确'], passed: '重新评审通过',
  },
  en: {
    titles: ['Every task, in one view', 'Switch agents. Keep going.', 'Review, fix, then deliver'],
    descriptions: ['Bring every agent’s tasks into one board. Filter running tasks, requests and unread results, then open the conversation that needs your attention.', 'Keep the working directory and pass along the goal, progress and next step. Hand the task to another agent and continue.', 'Separate implementation from review. Return findings for a fix, then review the result again before delivery.'],
    windows: ['FreeBuddy · Task board', 'FreeBuddy · Agent handoff', 'FreeBuddy · Review & fix'],
    pause: 'Pause', play: 'Play', replay: 'Replay', sample: 'Sample demo · No live agents',
    board: 'Task board', project: 'All projects', filters: ['All', 'Running', 'Requests', 'Unread'],
    tasks: ['Match the latest release', 'Fix Windows signing', 'Sync README translations', 'Add the Kimi CLI adapter'],
    states: ['Read → Edit → Test', 'Command approval needed', 'Complete · New result', 'Checking tool events'],
    boardCaptions: ['Every task, in one view', 'Filter requests that need you', 'Review the request and continue', 'Approved. The agent continues.'],
    back: 'Back to task board', request: 'Run signature verification?', requestDesc: 'Claude Code is ready to check the Windows installer and needs approval for this command.', allow: 'Allow and continue', allowed: 'Approved. Verification resumed.', allowedDesc: 'The request is resolved and the task is running again.', result: 'README translations synced', resultDesc: 'Three missing sections filled; terminology and links checked.', opened: 'Open the task conversation', openedDesc: 'See the latest progress from this agent.',
    handoff: 'Current conversation', implemented: 'Release matching implemented', implementedDesc: 'Codex added architecture matching and release caching. Next, check errors and edge cases.', transfer: 'Hand off to another agent', target: 'Continue with', context: 'Working directory & task brief', preview: 'Preview task brief', hide: 'Hide task brief', brief: 'Goal: match the latest GitHub release.', progress: 'Done: architecture matching and caching.', next: 'Next: check rate limits and fallbacks.', confirm: 'Confirm handoff', cancel: 'Cancel', continued: 'Continuation created', continuedDesc: 'The next agent uses the brief and the same working directory to continue the checks.', handoffCaptions: ['Start from the current task', 'Choose an agent for the next step', 'Pass the goal, progress and next step', 'A new agent picks up the task'],
    team: 'Implementation / Independent review', steps: ['Build', 'Review', 'Fix', 'Re-review', 'Deliver'],
    reviewTitles: ['Ready for independent review', 'An edge case needs a fix', 'Fix the rate-limit fallback', 'Review the fix again', 'Approved for delivery'],
    reviewDescriptions: ['Codex finishes implementation. Claude Code checks the changes next.', 'The download link needs a fallback when GitHub rate-limits the request.', 'Codex keeps a static download URL and adds error handling.', 'Claude Code verifies the fix and checks related edge cases.', 'Implementation, fixes and re-review are complete, with the process recorded.'],
    reviewActions: ['View review findings', 'Return to Codex for a fix', 'Submit for re-review', 'View review result', 'Replay workflow'],
    reviewCaptions: ['A separate view checks the work', 'Clear findings go back for a fix', 'Fix the review finding', 'Review the updated result', 'Re-review passed. Ready to deliver.'],
    checks: ['Download fallback under rate limits', 'Refresh after cache expiry', 'Correct macOS architecture matching'], passed: 'Re-review passed',
  },
};
const cards = [...document.querySelectorAll('[data-feature-demo]')];
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const counts = { tasks: 4, handoff: 4, review: 5 };
const agents = { claude: ['Claude Code', 'claude.webp'], kimi: ['Kimi CLI', 'kimi.webp'] };
const text = () => COPY[document.documentElement.lang === 'en' ? 'en' : 'zh'];
const avatar = (file, name = '') => `<img src="/assets/agents/${file}" alt="${name}">`;
const action = (name, label, primary = false) => `<button type="button" class="fd-button${primary ? ' primary' : ''}" data-action="${name}">${label}</button>`;

for (const card of cards) {
  const kind = card.dataset.featureDemo;
  const index = ['tasks', 'handoff', 'review'].indexOf(kind);
  let step = 0, filter = 'all', selected = null, allowed = false, target = 'claude';
  let playing = !calm.matches, visible = false, timer = null;
  const body = card.querySelector('.fd-body');
  const play = card.querySelector('[data-control="play"]');
  const replay = card.querySelector('[data-control="replay"]');
  const footer = card.querySelector('.fd-foot > span');

  function reset() { step = 0; filter = 'all'; selected = null; allowed = false; }
  function setStep(next) {
    step = next;
    if (kind === 'tasks') {
      filter = step === 1 ? 'attention' : 'all';
      selected = step >= 2 ? 1 : null;
      allowed = step === 3;
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!playing || !visible || document.hidden || calm.matches) return;
    timer = setTimeout(() => { setStep((step + 1) % counts[kind]); render(); }, 3400);
  }
  function taskBoard(t) {
    const head = `<div class="fd-head"><img src="/assets/logo-28.png" alt=""><strong>${t.board}</strong><small>${t.project} · 4</small></div>`;
    if (selected !== null) {
      let content;
      if (selected === 1) content = `<div class="fd-panel ${allowed ? 'success' : 'warning'}"><div class="fd-agent">${avatar('claude.webp')}<b>Claude Code</b></div><strong>${allowed ? t.allowed : t.request}</strong><p>${allowed ? t.allowedDesc : t.requestDesc}</p><pre>signtool verify /pa FreeBuddy.exe</pre>${allowed ? '' : `<div class="fd-actions">${action('allow', t.allow, true)}</div>`}</div>`;
      else content = `<div class="fd-panel ${selected === 2 ? 'success' : ''}"><strong>${selected === 2 ? t.result : t.opened}</strong><p>${selected === 2 ? t.resultDesc : t.openedDesc}</p></div>`;
      return head + `<button type="button" class="fd-link" data-action="back">← ${t.back}</button>` + content;
    }
    const filters = ['all', 'running', 'attention', 'unread'];
    const numbers = [4, allowed ? 3 : 2, allowed ? 0 : 1, 1];
    const tabs = `<div class="fd-filters">${filters.map((id, i) => `<button type="button" data-filter="${id}" aria-pressed="${filter === id}">${t.filters[i]}<span>${numbers[i]}</span></button>`).join('')}</div>`;
    const list = [0, 1, 2, 3].filter(i => filter === 'all' || (filter === 'running' && (i === 0 || i === 3 || (i === 1 && allowed))) || (filter === 'attention' && i === 1 && !allowed) || (filter === 'unread' && i === 2));
    const icons = ['openai.webp', 'claude.webp', 'kimi.webp', 'openai.webp'];
    const names = ['Codex', 'Claude Code', 'Kimi CLI', 'Codex'];
    return head + tabs + `<div class="fd-grid">${list.map(i => `<button type="button" class="fd-task ${i === 1 && !allowed ? 'attention' : i === 2 ? 'unread' : ''}" data-task="${i}"><strong>${t.tasks[i]}</strong><span>${avatar(icons[i])}<b>${names[i]}</b><small>${i === 3 ? 'agent-bridge' : 'freebuddy'}</small></span><em>${i === 1 && allowed ? t.states[0] : t.states[i]}</em></button>`).join('')}</div>`;
  }
  function handoff(t) {
    const [name, icon] = agents[target];
    const head = `<div class="fd-head">${avatar('openai.webp')}<strong>${t.handoff}</strong><small>freebuddy</small></div>`;
    if (step === 0) return head + `<div class="fd-panel"><div class="fd-agent">${avatar('openai.webp')}<b>Codex</b></div><strong>${t.implemented}</strong><p>${t.implementedDesc}</p><code class="fd-path">~/www/freebuddy</code><div class="fd-actions">${action('handoff', t.transfer, true)}</div></div>`;
    if (step === 3) return head + `<div class="fd-panel success"><div class="fd-pair">${avatar('openai.webp')}<span>Codex</span><span>→</span>${avatar(icon)}<b>${name}</b></div><strong>${t.continued}</strong><p>${t.continuedDesc}</p><code class="fd-path">~/www/freebuddy</code><p>${t.next}</p></div>`;
    return head + `<div class="fd-panel"><label class="fd-select">${t.target}<select data-target aria-label="${t.target}"><option value="claude"${target === 'claude' ? ' selected' : ''}>Claude Code</option><option value="kimi"${target === 'kimi' ? ' selected' : ''}>Kimi CLI</option></select></label><div class="fd-select">${t.context}<code class="fd-path">~/www/freebuddy</code></div><button type="button" class="fd-link" data-action="preview" aria-expanded="${step === 2}">${step === 2 ? t.hide : t.preview} ${step === 2 ? '−' : '+'}</button>${step === 2 ? `<div class="fd-brief"><p>${t.brief}</p><p>${t.progress}</p><p>${t.next}</p></div>` : ''}<div class="fd-actions">${action('cancel', t.cancel)}${action('confirm', t.confirm, true)}</div></div>`;
  }
  function review(t) {
    const reviewer = step === 1 || step === 3 || step === 4;
    const head = `<div class="fd-head">${avatar(reviewer ? 'claude.webp' : 'openai.webp')}<strong>${reviewer ? 'Claude Code' : 'Codex'}</strong><small>${t.team}</small></div>`;
    const timeline = `<div class="fd-timeline">${t.steps.map((label, i) => `<button type="button" data-step="${i}" class="${i < step ? 'done' : ''}"${i === step ? ' aria-current="step"' : ''}><i>${i < step ? '✓' : i + 1}</i>${label}</button>`).join('')}</div>`;
    let detail = '';
    if (step === 0) detail = '<code class="fd-path">main.js · +48 −12</code>';
    if (step === 1) detail = '<code class="fd-path">loadRelease() · HTTP 403 / 429</code>';
    if (step === 2) detail = '<div class="fd-diff"><span class="del">− link.href = release.url;</span><span class="add">+ link.href = release?.url || fallback;</span></div>';
    if (step === 3 || step === 4) detail = `<div class="fd-brief">${t.checks.map(check => `<p>✓ ${check}</p>`).join('')}</div>`;
    if (step === 4) detail += `<strong style="color:var(--fd-green)">✓ ${t.passed}</strong>`;
    return head + timeline + `<div class="fd-panel ${step === 1 ? 'warning' : step === 4 ? 'success' : ''}"><strong>${t.reviewTitles[step]}</strong><p>${t.reviewDescriptions[step]}</p>${detail}<div class="fd-actions">${action('next', t.reviewActions[step], true)}</div></div>`;
  }
  function render() {
    const t = text();
    const feature = card.closest('.feature');
    feature.querySelector('h3').textContent = t.titles[index];
    feature.querySelector('.feature-text p').textContent = t.descriptions[index];
    card.querySelector('.demo-title').textContent = t.windows[index];
    card.setAttribute('aria-label', t.windows[index]);
    body.innerHTML = kind === 'tasks' ? taskBoard(t) : kind === 'handoff' ? handoff(t) : review(t);
    footer.textContent = (kind === 'tasks' ? t.boardCaptions : kind === 'handoff' ? t.handoffCaptions : t.reviewCaptions)[step];
    play.disabled = calm.matches;
    play.textContent = playing && !calm.matches ? t.pause : t.play;
    play.setAttribute('aria-pressed', String(playing && !calm.matches));
    replay.textContent = t.replay;
    card.querySelector('.fd-sample').textContent = t.sample;
    schedule();
  }
  card.addEventListener('pointerdown', event => {
    if (!event.target.closest('[data-control]')) { playing = false; schedule(); play.textContent = text().play; play.setAttribute('aria-pressed', 'false'); }
  });
  card.addEventListener('focusin', event => {
    if (!event.target.closest('[data-control]')) { playing = false; schedule(); play.textContent = text().play; play.setAttribute('aria-pressed', 'false'); }
  });
  card.addEventListener('click', event => {
    const control = event.target.closest('[data-control]');
    if (control) {
      if (control.dataset.control === 'replay') reset();
      playing = control.dataset.control === 'replay' || !playing;
      render(); return;
    }
    playing = false;
    const f = event.target.closest('[data-filter]');
    const task = event.target.closest('[data-task]');
    const chosenStep = event.target.closest('[data-step]');
    const act = event.target.closest('[data-action]')?.dataset.action;
    if (f) { filter = f.dataset.filter; selected = null; step = filter === 'attention' ? 1 : 0; }
    else if (task) { selected = Number(task.dataset.task); if (selected === 1) step = allowed ? 3 : 2; }
    else if (chosenStep) setStep(Number(chosenStep.dataset.step));
    else if (act === 'allow') { allowed = true; step = 3; }
    else if (act === 'back') { selected = null; filter = 'all'; step = 0; }
    else if (act === 'handoff') step = 1;
    else if (act === 'preview') step = step === 2 ? 1 : 2;
    else if (act === 'cancel') step = 0;
    else if (act === 'confirm') step = 3;
    else if (act === 'next') setStep((step + 1) % counts[kind]);
    else return;
    render();
    if (f) body.querySelector(`[data-filter="${filter}"]`).focus();
    if (chosenStep) body.querySelector(`[data-step="${step}"]`).focus();
  });
  card.addEventListener('change', event => {
    if (event.target.matches('[data-target]') && Object.hasOwn(agents, event.target.value)) { target = event.target.value; playing = false; }
  });
  document.addEventListener('fb:lang', render);
  document.addEventListener('visibilitychange', schedule);
  calm.addEventListener('change', () => { if (calm.matches) playing = false; render(); });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= .35; schedule(); }, { threshold: .35 }).observe(card);
  render();
}

})();
