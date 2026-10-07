import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, filterTasks, taskList, createPlayback } from '../demo-state.js';

test('attention filter exposes the request and approval updates task status', () => {
  let state = transition(initialState(), { type: 'filter', filter: 'attention' });
  assert.deepEqual(filterTasks(state).map(task => task.id), ['sign']);
  state = transition(state, { type: 'open', id: 'sign' });
  state = transition(state, { type: 'allow' });
  assert.equal(taskList(state).find(task => task.id === 'sign').status, 'running');
  state = transition(state, { type: 'back' });
  assert.equal(filterTasks(state).length, 0);
  state = transition(state, { type: 'filter', filter: 'running' });
  assert.equal(filterTasks(state).length, 3);
});

test('project, localized search and status filters combine; opening a result clears unread', () => {
  let state = { ...initialState(), project: 'agent-bridge', query: 'KIMI' };
  assert.deepEqual(filterTasks(state, { adapter: 'Add Kimi adapter' }).map(task => task.id), ['adapter']);
  state = { ...state, project: 'all', query: '', filter: 'unread' };
  assert.deepEqual(filterTasks(state).map(task => task.id), ['docs']);
  state = transition(state, { type: 'open', id: 'docs' });
  assert.equal(filterTasks(state).length, 0);
});

test('manual steps and scene changes stop playback; final review result stays visible before switching', () => {
  let state = transition(initialState('review'), { type: 'play' });
  for (let step = 1; step <= 4; step++) {
    state = transition(state, { type: 'tick' });
    assert.equal(state.step, step);
    assert.equal(state.playing, true);
  }
  assert.equal(transition(state, { type: 'tick' }).scene, 'hero');
  state = transition(state, { type: 'replay' });
  assert.equal(state.step, 0);
  assert.equal(state.playing, true);
  state = transition(state, { type: 'step', step: 2 });
  assert.equal(state.playing, false);
  state = transition(state, { type: 'scene', scene: 'transfer' });
  assert.equal(state.step, 0);
  assert.equal(state.playing, false);
});

test('handoff keeps the chosen target, supports cancel and prevents premature confirmation', () => {
  let state = initialState('transfer');
  assert.equal(transition(state, { type: 'confirm' }).step, 0);
  state = transition(state, { type: 'step', step: 1 });
  state = transition(state, { type: 'target', target: 'kimi' });
  state = transition(state, { type: 'preview' });
  assert.equal(state.preview, true);
  state = transition(state, { type: 'confirm' });
  assert.equal(state.step, 3);
  assert.equal(state.target, 'kimi');
  assert.equal(state.playing, false);
  state = transition(state, { type: 'step', step: 0 });
  assert.equal(state.preview, false);
  assert.equal(state.step, 0);
});

test('paused or replaced playback invalidates even an already queued callback', () => {
  const queued = [];
  const cancelled = [];
  let ticks = 0;
  const playback = createPlayback(() => ticks++, { setTimer: callback => { queued.push(callback); return queued.length; }, clearTimer: id => cancelled.push(id) });
  playback.sync(true);
  playback.sync(false);
  queued[0]();
  assert.equal(ticks, 0);
  playback.sync(true);
  playback.sync(true);
  queued[1]();
  queued[2]();
  assert.equal(ticks, 1);
  assert.ok(cancelled.includes(1));
});

test('replay restores filters and permissions; conversation can resume the automatic tour', () => {
  const state = transition({ ...initialState(), allowed: true, filter: 'attention', query: 'sign', selected: 'sign' }, { type: 'replay' });
  assert.equal(state.allowed, false);
  assert.equal(state.filter, 'all');
  assert.equal(state.query, '');
  assert.equal(state.selected, null);
  const conversation = transition(initialState('hero'), { type: 'play' });
  assert.equal(conversation.playing, true);
  assert.equal(transition(conversation, { type: 'tick' }).scene, 'tasks');
});


test('automatic playback visits every tab and loops after the conversation', () => {
  let state = transition(initialState(), { type: 'play' });
  const expected = [
    ['tasks', 1], ['tasks', 2],
    ['transfer', 0], ['transfer', 1], ['transfer', 2], ['transfer', 3],
    ['review', 0], ['review', 1], ['review', 2], ['review', 3], ['review', 4],
    ['hero', 0], ['tasks', 0],
  ];
  for (const [scene, step] of expected) {
    state = transition(state, { type: 'tick' });
    assert.equal(state.scene, scene);
    assert.equal(state.step, step);
    assert.equal(state.playing, true);
  }
});

test('manual tab selection owns the scene until Play explicitly resumes the tour', () => {
  let state = transition(initialState(), { type: 'play' });
  state = transition(state, { type: 'scene', scene: 'review' });
  assert.equal(state.playing, false);
  for (let i = 0; i < 20; i++) state = transition(state, { type: 'tick' });
  assert.equal(state.scene, 'review');
  assert.equal(state.step, 0);
  state = transition(state, { type: 'step', step: 4 });
  state = transition(state, { type: 'play' });
  assert.equal(state.step, 4, 'Play resumes the current result without replaying it');
  state = transition(state, { type: 'tick' });
  assert.equal(state.scene, 'hero');
  assert.equal(state.playing, true);
});
