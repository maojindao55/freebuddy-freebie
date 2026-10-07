// The tour uses sample data only. No agent, filesystem or permission API is called.
export const SCENES = Object.freeze({ tasks: 3, transfer: 4, review: 5, hero: 1 });
export const TASKS = Object.freeze([
  { id: 'download', agent: 'codex', project: 'freebuddy', status: 'running', unread: false },
  { id: 'sign', agent: 'claude', project: 'freebuddy', status: 'attention', unread: false },
  { id: 'docs', agent: 'kimi', project: 'freebuddy', status: 'completed', unread: true },
  { id: 'adapter', agent: 'codex', project: 'agent-bridge', status: 'running', unread: false },
]);
export function initialState(scene = 'tasks') {
  return { scene, step: 0, playing: false, filter: 'all', project: 'all', query: '', selected: null, allowed: false, read: [], target: 'claude', preview: false };
}
export function taskList(state) {
  return TASKS.map(task => ({ ...task, status: task.id === 'sign' && state.allowed ? 'running' : task.status, unread: task.unread && !state.read.includes(task.id) }));
}
export function filterTasks(state, titles = {}) {
  return taskList(state).filter(task =>
    (state.project === 'all' || task.project === state.project) &&
    (state.filter === 'all' || (state.filter === 'unread' ? task.unread : task.status === state.filter)) &&
    `${titles[task.id] || task.id} ${task.project} ${task.agent}`.toLowerCase().includes(state.query.trim().toLowerCase()));
}
function atStep(state, step) {
  const last = SCENES[state.scene] - 1;
  const next = { ...state, step: Math.max(0, Math.min(last, step)) };
  if (state.scene === 'tasks') Object.assign(next, { filter: step === 0 ? 'all' : 'attention', selected: step === 2 ? 'sign' : null, query: '', project: 'all', allowed: false });
  if (state.scene === 'transfer') next.preview = step >= 2;
  return next;
}
export function transition(state, action) {
  switch (action.type) {
    case 'scene': return Object.hasOwn(SCENES, action.scene) ? initialState(action.scene) : state;
    case 'step': return atStep({ ...state, playing: false }, action.step);
    case 'tick': {
      if (!state.playing) return state;
      if (state.step < SCENES[state.scene] - 1) return atStep(state, state.step + 1);
      // Hold the final step for a full interval, then continue through the tabs.
      const order = Object.keys(SCENES);
      const scene = order[(order.indexOf(state.scene) + 1) % order.length];
      return { ...initialState(scene), playing: true };
    }
    case 'play': return { ...state, playing: true };
    case 'pause': return { ...state, playing: false };
    case 'replay': return { ...initialState(state.scene), playing: true };
    case 'filter': return { ...state, filter: action.filter, step: action.filter === 'attention' ? 1 : 0, selected: null, playing: false };
    case 'project': return { ...state, project: action.project, selected: null, playing: false };
    case 'query': return { ...state, query: action.query, selected: null, playing: false };
    case 'open': return TASKS.some(task => task.id === action.id) ? { ...state, selected: action.id, step: action.id === 'sign' ? 2 : state.step, read: [...new Set([...state.read, action.id])], playing: false } : state;
    case 'back': return { ...state, step: state.filter === 'attention' ? 1 : 0, selected: null, playing: false };
    case 'allow': return state.selected === 'sign' ? { ...state, allowed: true, playing: false } : state;
    case 'target': return ['claude', 'kimi'].includes(action.target) ? { ...state, target: action.target, playing: false } : state;
    case 'preview': return { ...state, step: state.preview ? 1 : 2, preview: !state.preview, playing: false };
    case 'confirm': return state.scene === 'transfer' && state.step > 0 && ['claude', 'kimi'].includes(state.target) ? { ...state, step: 3, playing: false } : state;
    default: return state;
  }
}
// Keep exactly one timer, and invalidate queued callbacks on pause/scene changes.
export function createPlayback(advance, { setTimer = setTimeout, clearTimer = clearTimeout, delay = 4200 } = {}) {
  let timer, generation = 0;
  return {
    sync(active) {
      generation++;
      clearTimer(timer);
      const current = generation;
      if (active) timer = setTimer(() => { if (current === generation) advance(); }, delay);
    },
  };
}
