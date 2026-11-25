import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Factory } from '../backend/engine.js';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');

// A DOM/canvas harness exercises rendering and queue timing without browser dependencies.
function createUI() {
  const elements = new Map();
  const timers = new Map();
  const strokes = [];
  let nextTimer = 0;
  let stream;
  const context = {
    scale() {}, setLineDash() {}, beginPath() {}, lineTo() {}, closePath() {}, fill() {},
    moveTo(x, y) { this.origin = { x, y }; },
    stroke() { strokes.push({ color: this.strokeStyle, origin: this.origin }); }
  };
  function element(id) {
    return {
      id, hidden: false, checked: true, value: '', dataset: {},
      style: { setProperty(name, value) { this[name] = value; } },
      classList: { toggle() {} }, setAttribute() {}, matches() { return false; },
      append(child) { elements.set(child.id, child); },
      getBoundingClientRect() {
        if (id === 'agent-popup') return { width: 248, height: 110 };
        if (id.startsWith('marker-')) return { width: 88, height: 91 };
        if (id.startsWith('node-')) return { width: 126, height: 128 };
        return { width: 960, height: 738 };
      },
      getContext() { return context; },
      set innerHTML(value) {
        this.markup = value;
        for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
      },
      get innerHTML() { return this.markup || ''; }
    };
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
  const sandbox = {
    document: {
      getElementById(id) {
        if (id.startsWith('marker-') && !elements.has(id)) return null;
        assert.ok(elements.has(id), 'Missing DOM element ' + id);
        return elements.get(id);
      },
      querySelectorAll() { return []; }, createElement() { return element(''); },
      addEventListener() {}, activeElement: null
    },
    window: { devicePixelRatio: 1, addEventListener() {} },
    EventSource: class { constructor() { stream = this; } },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++nextTimer; }, clearInterval() {},
    Intl, Date, console
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return {
    elements, strokes,
    state(factory) { stream.onmessage({ data: JSON.stringify(factory.state()) }); },
    run(code) { return vm.runInContext(code, sandbox); },
    tick() {
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      callback();
    }
  };
}

test('messages queue without duplication and resets replace old conversations', () => {
  const ui = createUI();
  const factory = new Factory();
  ui.state(factory);
  assert.equal(ui.run('currentMessage().id'), 1);
  const queued = ui.run('liveQueue.length');
  ui.state(factory);
  assert.equal(ui.run('liveQueue.length'), queued);
  ui.tick();
  assert.equal(ui.run('currentMessage().id'), 2);
  factory.scenario('urgent');
  ui.state(factory);
  assert.equal(ui.run('currentMessage().id'), 1);
  assert.equal(ui.elements.get('agent-popup').dataset.message, factory.epoch + '-1');
  ui.run('followLatest()');
  assert.equal(ui.run('liveQueue.length'), 0);
  assert.equal(ui.run('currentMessage().id'), factory.messages.at(-1).id);
});

test('sender popups escape content and red arrows terminate outside horizontal and vertical agent boxes', () => {
  const ui = createUI();
  const factory = new Factory();
  ui.state(factory);
  ui.run("renderPopup({id:999,sender:'Manager',receiver:'HR',type:'INFORM',detail:'<img onerror=bad>'})");
  assert.match(ui.elements.get('agent-popup').innerHTML, /&lt;img onerror=bad&gt;/);
  assert.ok(!ui.elements.get('agent-popup').innerHTML.includes('<img'));
  ui.elements.get('show-connections').checked = false;
  ui.strokes.length = 0;
  ui.run("drawConnections({sender:'HR',receiver:'Coordinator'})");
  assert.equal(ui.strokes.length, 1);
  assert.equal(ui.strokes[0].color, '#dc2626');
  assert.ok(ui.strokes[0].origin.x > 960 * .13 + 63);
  ui.strokes.length = 0;
  ui.run("drawConnections({sender:'Manager',receiver:'HR'})");
  assert.equal(ui.strokes.length, 1);
  assert.ok(ui.strokes[0].origin.y > 738 * .23 + 64);
});

test('all scenarios render illustrated agents and trucks through final delivery', () => {
  const ui = createUI();
  const factory = new Factory();
  for (const name of ['outage','staff','fabric','truck','road','urgent','join','scarcity']) {
    factory.scenario(name);
    ui.state(factory);
    for (const view of ['map','calendar','lab','messages']) ui.run('setView("' + view + '")');
    assert.match(ui.elements.get('map-nodes').innerHTML, /network-art/);
    assert.match(ui.elements.get('marker-TRUCK-1').innerHTML, /network-art/);
    assert.ok(!ui.elements.get('agent-popup').hidden);
  }
  factory.reset();
  for (let i = 0; i < 40; i++) { factory.step(); ui.state(factory); }
  assert.match(ui.elements.get('order-list').innerHTML, /Delivered/);
});
