import { SCENES, initialState, taskList, filterTasks, transition, createPlayback } from './demo-state.js?v=1009';

const root = document.querySelector('#demo');
const app = root.querySelector('[data-view="tour"]');
const hero = root.querySelector('[data-view="hero"]');
const tabs = [...root.querySelectorAll('[data-scene]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const agents = {
  codex: { name: 'Codex', image: 'openai.webp' },
  claude: { name: 'Claude Code', image: 'claude.webp' },
  kimi: { name: 'Kimi CLI', image: 'kimi.webp' },
};
const COPY = {
  zh: {
    scenes: { tasks: '任务面板', transfer: 'Agent 转接', review: '评审修复', hero: '自由对话' },
    sceneLabel: '演示场景', demoLabel: 'FreeBuddy 交互演示', previous: '上一步', next: '下一步', play: '播放', pause: '暂停', replay: '重播', progress: '演示进度', playHint: '继续自动轮播所有场景', pauseHint: '暂停自动轮播',
    disclaimer: '交互演示 · 示例数据，不连接真实 Agent',
    new: '新会话', allProjects: '所有项目', search: '搜索任务、项目或 Agent', empty: '没有匹配的任务', clear: '清除筛选', back: '返回任务面板', open: '查看会话', request: '查看请求',
    filters: { all: '全部', running: '运行中', attention: '待处理', unread: '未读' },
    statuses: { running: '运行中', attention: '等待确认', completed: '已完成' },
    titles: { download: '下载区匹配最新版本', sign: '修复 Windows 安装包签名', docs: 'README 中英文同步', adapter: '接入 Kimi CLI 适配器' },
    summaries: { download: '读取 Release 信息，按平台和芯片匹配安装包。', sign: '准备重新运行打包脚本，需要你确认命令。', docs: '补齐 3 处缺失段落，术语和链接已同步。', adapter: '正在校验流式消息解析和工具调用事件。' },
    recent: '刚刚更新', permission: 'Agent 正在等待你的确认', permissionNote: '将重新运行 Windows 打包命令。确认后，任务继续执行。', allow: '允许本次', allowed: '已确认，Agent 继续运行', continuing: '正在重新打包，生成 Windows x64 安装包。', unread: '有新结果',
    source: '下载区匹配最新版本', sourceDone: '实现已完成', sourceText: '已按平台和芯片匹配下载文件，并保留直链兜底。请让另一个 Agent 检查缓存失效和异常回退。', transfer: '转交上下文', target: '目标 Agent', model: '模型', defaultModel: 'Agent 默认模型', workspace: '沿用工作目录', preview: '查看交接摘要', hidePreview: '收起交接摘要', brief: '交接摘要', goal: '任务目标', goalText: '匹配最新 Release，兼容 macOS / Windows / Linux。', changes: '已有改动', changesText: 'main.js · 平台匹配、缓存与兜底链接。', followup: '下一步', followupText: '检查缓存过期、请求失败和缺失安装包的回退。', cancel: '取消', confirm: '确认转接', transferred: '已创建接续会话', continuation: '已收到任务目标、已有改动和下一步。我会沿用工作目录，检查缓存失效与回退逻辑。', sourceKept: '原会话保留，交接摘要随新会话带入。',
    workflow: '下载适配 · 交付团队', team: 'Codex 实现 / Claude Code 评审', needsFix: '需要修复', inProgress: '运行中', approved: '复审通过', waiting: '等待', finished: '完成',
    reviewSteps: ['实现', '首次评审', '修复', '重新评审', '交付'],
    reviewTitles: ['实现完成，进入独立评审', '发现问题，交回实现者', 'Codex 按评审意见修复', '同一个问题，再检查一次', '复审通过，继续交付'],
    reviewText: ['Codex 完成平台适配。Claude Code 接着检查实现和边界情况。', '缓存过期后请求失败，旧版本链接没有作为兜底返回。网络异常时下载入口会不可用。', '保留已有缓存作为回退，并新增请求失败和空产物列表测试。', 'Claude Code 对照原评审意见检查修复，重新验证异常回退。', '原问题已解决；异常场景测试 24 / 24 通过，评审结论为通过。'],
    reviewActions: ['查看评审意见', '交回 Codex 修复', '重新评审', '查看复审结果'],
    finding: 'P1 · 缓存失效后缺少回退', evidence: 'main.js · loadRelease()', check1: '缓存过期 + API 请求失败', check2: 'Release 缺少当前平台安装包', check3: '原评审问题已解决',
    captions: {
      tasks: [['所有任务，一眼看清', '多个 Agent 的进度、活动和新结果集中显示。试试筛选或打开卡片。'], ['先看需要你处理的任务', '筛选“待处理”，迅速找到正在等待确认的 Agent。'], ['从任务卡片直接接手', '查看请求并确认，Agent 就能继续工作。']],
      transfer: [['换个 Agent，接着做', '已有实现交给另一位 Agent 检查，无需重新描述整件事。'], ['选择接手的 Agent', '工作目录沿用原会话，目标 Agent 可自由选择。'], ['交接前，先看摘要', '任务目标、已有改动和下一步一起带入接续会话。'], ['上下文到位，继续工作', '新 Agent 接着处理，原会话保留，方便回看。']],
      review: [['实现只是第一步', '实现与评审分工，改动还要经过独立检查。'], ['评审发现问题', '明确的问题会交回实现者修复。'], ['带着评审意见修复', '实现者补上回退逻辑和相应测试。'], ['修复后再次评审', '对照原问题复查，通过前继续留在评审循环。'], ['通过后，再继续交付', '评审结论和验证结果一起留下。']],
      hero: [['自己试一下', '点击“新会话”，选择 Agent、填入示例任务；“团队执行”可打开评审场景。']],
    },
  },
  en: {
    scenes: { tasks: 'Task board', transfer: 'Agent handoff', review: 'Review & fix', hero: 'Conversation' },
    sceneLabel: 'Demo scenarios', demoLabel: 'FreeBuddy interactive demo', previous: 'Previous', next: 'Next', play: 'Play', pause: 'Pause', replay: 'Replay', progress: 'Demo progress', playHint: 'Resume automatic playback across all scenarios', pauseHint: 'Pause automatic playback',
    disclaimer: 'Interactive demo · Sample data, no live agents',
    new: 'New session', allProjects: 'All projects', search: 'Search tasks, projects or agents', empty: 'No matching tasks', clear: 'Clear filters', back: 'Back to task board', open: 'View conversation', request: 'View request',
    filters: { all: 'All', running: 'Running', attention: 'Needs attention', unread: 'Unread' },
    statuses: { running: 'Running', attention: 'Needs input', completed: 'Completed' },
    titles: { download: 'Match the latest download', sign: 'Fix Windows package signing', docs: 'Sync bilingual README', adapter: 'Add the Kimi CLI adapter' },
    summaries: { download: 'Read the release and match installers by platform and chip.', sign: 'Ready to rerun the packaging script. Your confirmation is needed.', docs: 'Three missing sections added; terminology and links synced.', adapter: 'Checking streamed messages and tool-call events.' },
    recent: 'Updated just now', permission: 'The agent needs your confirmation', permissionNote: 'Rerun the Windows packaging command. Confirm to let the task continue.', allow: 'Allow once', allowed: 'Confirmed. The agent is continuing.', continuing: 'Rebuilding the Windows x64 installer.', unread: 'New result',
    source: 'Match the latest download', sourceDone: 'Implementation complete', sourceText: 'Platform and chip matching is ready, with direct download fallbacks. Ask another agent to check cache expiry and error handling.', transfer: 'Hand off context', target: 'Target agent', model: 'Model', defaultModel: 'Agent default model', workspace: 'Keep the workspace', preview: 'Preview handoff brief', hidePreview: 'Hide handoff brief', brief: 'Handoff brief', goal: 'Goal', goalText: 'Match the latest release on macOS, Windows and Linux.', changes: 'Changes so far', changesText: 'main.js · Platform matching, caching and fallback links.', followup: 'Next steps', followupText: 'Check cache expiry, request failures and missing installers.', cancel: 'Cancel', confirm: 'Confirm handoff', transferred: 'Continuation session created', continuation: 'I have the goal, changes and next steps. I will keep the workspace and check cache expiry and fallback handling.', sourceKept: 'The original session stays available. The brief goes into the new session.',
    workflow: 'Download support · Delivery team', team: 'Codex implements / Claude Code reviews', needsFix: 'Changes requested', inProgress: 'Running', approved: 'Review passed', waiting: 'Waiting', finished: 'Done',
    reviewSteps: ['Implement', 'First review', 'Fix', 'Re-review', 'Deliver'],
    reviewTitles: ['Ready for an independent review', 'A finding goes back to the implementer', 'Codex fixes the review finding', 'Check the same issue again', 'Review passed. Ready to deliver.'],
    reviewText: ['Codex finishes platform matching. Claude Code reviews the code and edge cases.', 'When a refresh fails after cache expiry, the old download link is not returned. The download action fails during a network outage.', 'Keep the cached release as a fallback. Add tests for failed requests and missing installers.', 'Claude Code checks the fix against the original finding and verifies error handling again.', 'The finding is resolved. All 24 edge-case tests pass and the review approves the change.'],
    reviewActions: ['See review finding', 'Return to Codex', 'Run another review', 'See review result'],
    finding: 'P1 · Missing fallback after cache expiry', evidence: 'main.js · loadRelease()', check1: 'Expired cache + failed API request', check2: 'No installer for the current platform', check3: 'Original review finding resolved',
    captions: {
      tasks: [['Every task at a glance', 'See agent progress, recent activity and new results. Try a filter or open a card.'], ['Find tasks that need you', 'Filter for attention to find the agent waiting for confirmation.'], ['Act straight from a task card', 'Check the request and confirm to let the agent continue.']],
      transfer: [['Another agent, the same task', 'Hand the implementation to another agent without explaining everything again.'], ['Choose who takes over', 'Keep the workspace and choose the next agent.'], ['Check the brief before handing off', 'The goal, existing changes and next steps go into the continuation session.'], ['Context in place. Work continues.', 'The new agent continues and the original session stays available.']],
      review: [['Implementation is the first step', 'Separate implementation and review so changes get an independent check.'], ['Review finds an issue', 'An actionable finding goes back to the implementer.'], ['Fix with the finding in context', 'The implementer adds fallback handling and regression tests.'], ['Review the fix again', 'Check the original finding again before approving the change.'], ['Approval comes before delivery', 'Keep the review verdict and verification results together.']],
      hero: [['Try it yourself', 'Open a new session, choose an agent and use the sample task. Team execution opens the review scenario.']],
    },
  },
};
let state = initialState();
let visible = false;
const text = () => COPY[document.documentElement.lang.startsWith('en') ? 'en' : 'zh'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avatar = key => `<img class="tour-avatar" src="/assets/agents/${agents[key].image}" alt="">`;
const button = (action, label, primary = false) => `<button type="button" data-action="${action}" class="tour-action${primary ? ' primary' : ''}">${label}</button>`;
const playback = createPlayback(() => dispatch({ type: 'tick' }));
function syncPlayback() { playback.sync(state.playing && visible && !document.hidden); }
function dispatch(action) {
  state = transition(state, action);
  if (action.type === 'replay' && state.scene === 'hero') document.dispatchEvent(new Event('fb:conversation-reset'));
  render(); syncPlayback();
}
function taskCard(task, t) {
  return `<article class="tour-task-card">
    <header><button type="button" data-open="${task.id}" class="tour-task-title">${t.titles[task.id]}</button><span class="tour-status ${task.status}">${t.statuses[task.status]}</span></header>
    <div class="tour-identity">${avatar(task.agent)}<b>${agents[task.agent].name}</b><span>${task.project}</span>${task.unread ? `<span class="tour-new-result">${t.unread}</span>` : ''}</div>
    <p>${task.id === 'sign' && state.allowed ? t.allowed : t.summaries[task.id]}</p>
    ${task.status === 'running' ? '<div class="tour-activity"><code>Read → Edit → Test</code><span class="fb-run" aria-hidden="true"></span></div>' : ''}
    <footer><small>${t.recent}</small><button type="button" data-open="${task.id}">${task.status === 'attention' ? t.request : t.open} <span aria-hidden="true">→</span></button></footer>
  </article>`;
}
function board(t) {
  const tasks = taskList(state);
  const task = tasks.find(task => task.id === state.selected);
  if (task) return `<header class="tour-app-header">${button('back', `← ${t.back}`)}<span class="tour-status ${task.status}">${t.statuses[task.status]}</span></header>
    <div class="tour-task-conversation"><h3>${t.titles[task.id]}</h3><div class="tour-identity">${avatar(task.agent)}<b>${agents[task.agent].name}</b><code>~/www/${task.project}</code></div>
      <div class="tour-message">${task.id === 'sign' && state.allowed ? t.continuing : t.summaries[task.id]}</div>
      ${task.id === 'sign' ? `<section class="tour-request ${state.allowed ? 'resolved' : ''}"><strong>${state.allowed ? t.allowed : t.permission}</strong><code>npm run build:win</code><p>${state.allowed ? t.continuing : t.permissionNote}</p>${state.allowed ? '' : button('allow', t.allow, true)}</section>` : `<div class="tour-message"><code>${({ download: 'main.js · loadRelease()', docs: 'README.md · README.zh-CN.md', adapter: 'src/adapters/kimi.ts' })[task.id]}</code><p>${t.statuses[task.status]}</p></div>`}
    </div>`;
  const counts = Object.fromEntries(['all', 'running', 'attention', 'unread'].map(key => [key, tasks.filter(task => key === 'all' || (key === 'unread' ? task.unread : task.status === key)).length]));
  const shown = filterTasks(state, t.titles);
  return `<header class="tour-app-header"><div class="tour-brand"><img src="/assets/logo-28.png" alt="" width="28" height="28"><b>FreeBuddy</b><span>${t.scenes.tasks}</span><small>${tasks.length}</small></div>${button('new', `+ ${t.new}`, true)}</header>
    <div class="tour-board-controls"><label><span class="sr-only">${t.allProjects}</span><select data-field="project"><option value="all">${t.allProjects}</option>${['freebuddy', 'agent-bridge'].map(project => `<option${state.project === project ? ' selected' : ''}>${project}</option>`).join('')}</select></label><input data-field="query" type="search" value="${escape(state.query)}" placeholder="${t.search}" aria-label="${t.search}"></div>
    <div class="tour-filters" aria-label="${t.scenes.tasks}">${Object.entries(t.filters).map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${state.filter === key}">${label} <span>${counts[key]}</span></button>`).join('')}</div>
    <div class="tour-board-grid">${shown.length ? shown.map(task => taskCard(task, t)).join('') : `<div class="tour-empty"><p>${t.empty}</p>${button('clear', t.clear)}</div>`}</div>`;
}
function transfer(t) {
  const complete = state.step === 3;
  const target = agents[state.target];
  const brief = `<dl class="tour-brief">${[[t.goal, t.goalText], [t.changes, t.changesText], [t.followup, t.followupText]].map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  return `<header class="tour-app-header"><strong>${t.source}</strong><span class="tour-status completed">${t.sourceDone}</span></header>
    <div class="tour-handoff-layout"><div class="tour-handoff-chat"><div class="tour-identity">${avatar('codex')}<b>Codex</b><small>freebuddy</small></div><div class="tour-message"><p>${t.sourceText}</p><code>main.js <em>+48 −12</em></code></div>
      ${complete ? `<div class="tour-context-note">${t.transferred} · Codex → ${target.name}</div><div class="tour-identity">${avatar(state.target)}<b>${target.name}</b></div><div class="tour-message continuation">${t.continuation}</div>` : button('handoff', t.transfer, true)}
    </div><section class="tour-handoff-panel" aria-label="${t.transfer}">
    <h3>${complete ? t.transferred : t.transfer}</h3>
    ${state.step === 0 ? `<p>${t.sourceKept}</p><div class="tour-agent-pair">${avatar('codex')}<span aria-hidden="true">→</span>${avatar('claude')}${avatar('kimi')}</div>` : complete ? `<div class="tour-success">${avatar(state.target)}<strong>${target.name}</strong></div><p>${t.sourceKept}</p>${brief}` : `<label>${t.target}<select data-field="target"><option value="claude"${state.target === 'claude' ? ' selected' : ''}>Claude Code</option><option value="kimi"${state.target === 'kimi' ? ' selected' : ''}>Kimi CLI</option></select></label><label>${t.model}<input value="${t.defaultModel}" readonly></label><label>${t.workspace}<input value="~/www/freebuddy" readonly></label><button type="button" class="tour-preview" data-action="preview" aria-expanded="${state.preview}">${state.preview ? t.hidePreview : t.preview}</button>${state.preview ? brief : ''}<div class="tour-dialog-actions">${button('cancel', t.cancel)}${button('confirm', t.confirm, true)}</div>`}
    </section></div>`;
}
function review(t) {
  const step = state.step;
  const reviewer = step === 4 || step % 2 ? 'claude' : 'codex';
  const status = step === 1 ? t.needsFix : step === 4 ? t.approved : t.inProgress;
  return `<header class="tour-app-header"><strong>${t.workflow}</strong><span class="tour-status ${step === 1 ? 'attention' : step === 4 ? 'completed' : 'running'}">${status}</span></header>
    <div class="tour-review-layout"><nav class="tour-workflow" aria-label="${t.scenes.review}"><p>${t.team}</p>${t.reviewSteps.map((label, index) => `<button type="button" data-step="${index}" class="${index === step ? 'current' : ''}"${index === step ? ' aria-current="step"' : ''}><span class="tour-step-number">${index + 1}</span><span><b>${label}</b><small>${index < 4 ? agents[index % 2 ? 'claude' : 'codex'].name : 'FreeBuddy'}</small></span><em>${index < step ? t.finished : index > step ? t.waiting : index === 1 ? t.needsFix : index === 4 ? t.finished : t.inProgress}</em></button>`).join('')}</nav>
    <section class="tour-review-content"><div class="tour-identity">${avatar(reviewer)}<b>${agents[reviewer].name}</b><span>${step + 1} / 5</span></div><h3>${t.reviewTitles[step]}</h3><p>${t.reviewText[step]}</p>
    ${step === 1 ? `<div class="tour-finding"><span class="tour-status attention">${t.needsFix}</span><strong>${t.finding}</strong><code>${t.evidence}</code></div>` : step === 2 ? `<div class="tour-diff"><div><code>main.js</code><span>+2 −1</span></div><pre><span class="del">− return null;</span>\n<span class="add">+ return cachedRelease</span>\n<span class="add">+   ?? pinnedRelease;</span></pre></div><code class="tour-test-result">release-fallback.test.js · 24 / 24</code>` : step >= 3 ? `<div class="tour-checks">${[t.check1, t.check2, t.check3].map(label => `<div>${step === 4 ? '<span class="tour-checkmark" aria-hidden="true">✓</span>' : '<span class="fb-run" aria-hidden="true"></span>'}<span>${label}</span></div>`).join('')}</div>${step === 4 ? `<div class="tour-verdict">${t.approved} <code>24 / 24</code></div>` : ''}` : `<div class="tour-diff"><div><code>main.js</code><span>+48 −12</span></div><pre>loadRelease()\nmatchPlatformAssets()\ncacheRelease()</pre></div>`}
    ${step < 4 ? button('review-next', t.reviewActions[step], true) : ''}</section></div>`;
}
function render() {
  const t = text();
  root.setAttribute('aria-label', t.demoLabel);
  root.querySelector('.tour-tabs').setAttribute('aria-label', t.sceneLabel);
  tabs.forEach(tab => { const active = tab.dataset.scene === state.scene; tab.textContent = t.scenes[tab.dataset.scene]; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  const active = state.scene === 'hero' ? hero : app;
  [app, hero].forEach(panel => { panel.hidden = panel !== active; panel.removeAttribute('id'); panel.removeAttribute('role'); panel.removeAttribute('aria-labelledby'); });
  active.id = 'tour-panel'; active.setAttribute('role', 'tabpanel'); active.setAttribute('aria-labelledby', `tour-tab-${state.scene}`);
  if (active === app) app.innerHTML = state.scene === 'tasks' ? board(t) : state.scene === 'transfer' ? transfer(t) : review(t);
  const [title, description] = t.captions[state.scene][state.step];
  root.querySelector('.tour-caption').innerHTML = `<div><span>${t.scenes[state.scene]}</span><strong>${title}</strong></div><p>${description}</p>`;
  root.querySelector('.tour-disclaimer').textContent = t.disclaimer;
  const last = SCENES[state.scene] - 1;
  for (const [key, label] of Object.entries({ previous: t.previous, next: t.next, play: state.playing ? t.pause : t.play, replay: t.replay })) root.querySelector(`[data-tour="${key}"]`).textContent = label;
  root.querySelector('[data-tour="previous"]').disabled = state.step === 0;
  root.querySelector('[data-tour="next"]').disabled = state.step === last;
  root.querySelector('[data-tour="play"]').title = state.playing ? t.pauseHint : t.playHint;
  root.querySelector('[data-tour="play"]').setAttribute('aria-pressed', String(state.playing));
  root.querySelector('.tour-position').textContent = `${state.step + 1} / ${last + 1}`;
  root.querySelector('.tour-position').setAttribute('aria-label', t.progress);
}
root.addEventListener('click', event => {
  const scene = event.target.closest('[data-scene]');
  if (scene) { dispatch(scene.dataset.scene === state.scene ? { type: 'pause' } : { type: 'scene', scene: scene.dataset.scene }); return; }
  const control = event.target.closest('[data-tour]')?.dataset.tour;
  if (control) { dispatch(control === 'previous' || control === 'next' ? { type: 'step', step: state.step + (control === 'next' ? 1 : -1) } : { type: control === 'play' ? state.playing ? 'pause' : 'play' : 'replay' }); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) { dispatch({ type: 'filter', filter: filter.dataset.filter }); app.querySelector(`[data-filter="${filter.dataset.filter}"]`)?.focus(); return; }
  const open = event.target.closest('[data-open]');
  if (open) { dispatch({ type: 'open', id: open.dataset.open }); app.querySelector('[data-action="back"]')?.focus(); return; }
  const step = event.target.closest('[data-step]');
  if (step) { dispatch({ type: 'step', step: Number(step.dataset.step) }); app.querySelector(`[data-step="${step.dataset.step}"]`)?.focus(); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new') { dispatch({ type: 'scene', scene: 'hero' }); hero.querySelector('.fb-nav-item').click(); }
  else if (action === 'clear') dispatch({ type: 'scene', scene: 'tasks' });
  else if (action === 'handoff') { dispatch({ type: 'step', step: 1 }); app.querySelector('[data-field="target"]')?.focus(); }
  else if (action === 'cancel') { dispatch({ type: 'step', step: 0 }); app.querySelector('[data-action="handoff"]')?.focus(); }
  else if (action === 'review-next') { dispatch({ type: 'step', step: state.step + 1 }); app.querySelector('[data-action="review-next"]')?.focus(); }
  else if (action) {
    dispatch({ type: action });
    const focus = app.querySelector(action === 'allow' ? '[data-action="back"]' : action === 'back' ? '[data-filter][aria-pressed="true"]' : action === 'confirm' ? 'h3' : `[data-action="${action}"]`);
    if (focus) { if (action === 'confirm') focus.tabIndex = -1; focus.focus(); }
  }
});
root.addEventListener('input', event => {
  if (event.target.dataset.field !== 'query') return;
  const query = event.target.value;
  const start = event.target.selectionStart, end = event.target.selectionEnd;
  dispatch({ type: 'query', query });
  const input = app.querySelector('[data-field="query"]'); input.focus(); input.setSelectionRange(start, end);
});
root.addEventListener('change', event => {
  const field = event.target.dataset.field;
  if (field === 'project' || field === 'target') { dispatch({ type: field, [field]: event.target.value }); app.querySelector(`[data-field="${field}"]`)?.focus(); }
});
function pauseInPlace() {
  state = transition(state, { type: 'pause' }); syncPlayback();
  root.querySelector('[data-tour="play"]').textContent = text().play;
  root.querySelector('[data-tour="play"]').setAttribute('aria-pressed', 'false');
  root.querySelector('[data-tour="play"]').title = text().playHint;
}
root.addEventListener('pointerdown', event => {
  // Manual interaction keeps control until Play is explicitly pressed again.
  if (!event.target.closest('[data-tour]') && state.playing) pauseInPlace();
});
root.addEventListener('focusin', event => {
  if (state.playing && !event.target.closest('[data-tour]')) pauseInPlace();
});
root.querySelector('.tour-tabs').addEventListener('keydown', event => {
  const index = tabs.indexOf(document.activeElement);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  dispatch({ type: 'scene', scene: tabs[next].dataset.scene }); tabs[next].focus();
});
root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.scene === 'transfer' && state.step > 0 && state.step < 3) { dispatch({ type: 'step', step: 0 }); app.querySelector('[data-action="handoff"]')?.focus(); }
});
document.addEventListener('fb:scene', event => dispatch({ type: 'scene', scene: event.detail }));
document.addEventListener('fb:lang', () => { render(); syncPlayback(); });
document.addEventListener('visibilitychange', syncPlayback);
reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) dispatch({ type: 'pause' }); });
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRect.height >= 180; syncPlayback(); }, { threshold: [0, .2, .4, .6, .8, 1] }).observe(root);
render();
// Automatically tour every tab until the user takes over. Only Play/Replay resumes it.
if (!reduceMotion.matches) dispatch({ type: 'play' });
