import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Factory } from '../backend/engine.js';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = (await readFile(new URL('./app.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const routing = (await readFile(new URL('./routing.js', import.meta.url), 'utf8')).replace('export function routeMessage', 'function routeMessage');

const roads = (await readFile(new URL('./roads.js', import.meta.url), 'utf8')).replace(/export /g, '');

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
      querySelectorAll() { return [...elements.values()].filter(item => item.dataset.visit); },
      remove() { elements.delete(this.id); },
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() {
        if (this.id === 'map-controls') return { width: 440, height: 78 };
        if (this.id === 'agent-popup') return { width: 248, height: 110 };
        if (this.id.startsWith('marker-')) return { width: 88, height: 91 };
        if (this.id.startsWith('node-')) return { width: 126, height: 128 };
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
        if ((id.startsWith('marker-') || id.startsWith('node-VISIT-')) && !elements.has(id)) return null;
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
  vm.runInContext(routing, sandbox);
  vm.runInContext(roads, sandbox);
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

test('sender popups escape content and active arrows use message colors outside agent boxes', () => {
  const ui = createUI();
  const factory = new Factory();
  ui.state(factory);
  ui.run("renderPopup({id:999,sender:'Manager',receiver:'HR',type:'INFORM',detail:'<img onerror=bad>'})");
  assert.match(ui.elements.get('agent-popup').innerHTML, /&lt;img onerror=bad&gt;/);
  assert.ok(!ui.elements.get('agent-popup').innerHTML.includes('<img'));
  ui.elements.get('agent-popup').hidden = true;
  ui.run('state.visits = []');
  ui.strokes.length = 0;
  ui.run("drawConnections({sender:'HR',receiver:'Coordinator',type:'CFP'})");
  assert.equal(ui.strokes.length, 1);
  assert.equal(ui.strokes[0].color, '#2563eb');
  assert.ok(ui.strokes[0].origin.x >= 960 * .13 + 63 || ui.strokes[0].origin.y <= 738 * .49 - 64 || ui.strokes[0].origin.y >= 738 * .49 + 64);
  ui.strokes.length = 0;
  ui.run("drawConnections({sender:'Manager',receiver:'HR',type:'PROPOSE'})");
  assert.equal(ui.strokes.length, 1);
  assert.equal(ui.strokes[0].color,'#7c3aed');
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

test('all agent profiles expose traits, PEAS, environment and actual percept history', () => {
  const ui = createUI();
  const factory = new Factory();
  ui.state(factory);
  for (const agent of ui.run('allAgents()')) {
    ui.run('selected=' + JSON.stringify(agent.id) + '; renderAgentProfile()');
    const profile = ui.elements.get('agent-profile').innerHTML;
    for (const field of ['Situatedness','Autonomy','Adaptivity','Sociability','Rationality','Omniscience','Actuators','Available actions','Task knowledge','evaluation criteria','Percept sequence','Fully observable','Deterministic','Sequential','Dynamic','Discrete']) {
      assert.ok(profile.includes(field),agent.id+' missing '+field);
    }
  }
  ui.run("selected='Monitor'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Simple reflex agent/);
  ui.run("selected='Logistics'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Utility-based agent/);
  ui.run("selected='Stores'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Model-based reflex agent/);
  ui.run("selected='CUT'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Goal-based agent/);
});

test('customer markers move to reception and disappear after leaving while their order stays visible', () => {
  const ui = createUI();
  const factory = new Factory();
  const visit = factory.queueCustomer({name:'Visitor garments',customer:'Walk-in customer',quantity:40,priority:2,deadline:30});
  ui.state(factory);
  const initial = ui.elements.get('node-'+visit.id).style.top;
  factory.step();
  ui.state(factory);
  assert.notEqual(ui.elements.get('node-'+visit.id).style.top,initial);
  factory.step();
  ui.state(factory);
  assert.match(ui.elements.get('node-'+visit.id).innerHTML,/Order ORD-104 submitted/);
  for(let i=0;i<3;i++){factory.step();ui.state(factory);}
  assert.equal(ui.elements.get('node-'+visit.id).style.top,'94%');
  assert.equal(ui.elements.get('node-'+visit.id).style.opacity,'0');
  assert.match(ui.elements.get('order-list').innerHTML,/Visitor garments/);
});

test('idle communications draw no connections and live queue expiry hides the map popup', () => {
  const ui = createUI();
  ui.state(new Factory());
  ui.strokes.length=0;
  ui.run('drawConnections()');
  assert.equal(ui.strokes.length,0);
  ui.run('followLatest()');
  ui.tick();
  assert.equal(ui.run('communicationActive'),false);
  assert.equal(ui.elements.get('agent-popup').hidden,true);
  ui.strokes.length=0;
  ui.run('drawConnections(currentMapMessage())');
  assert.equal(ui.strokes.length,0);
});

test('clicking each customer opens a prefilled order form and visiting customers retain their own name', () => {
  const ui = createUI();
  const factory = new Factory();
  ui.state(factory);
  assert.ok(!html.includes('inspector-panel'));
  for (const location of factory.state().locations) {
    ui.run('selectMapAgent(' + JSON.stringify('CUSTOMER-' + location.id) + ')');
    assert.equal(ui.elements.get('order-dialog').open,true);
    assert.equal(ui.elements.get('order-customer').value,location.name);
    assert.equal(ui.elements.get('order-destination').value,location.id);
    assert.equal(ui.elements.get('customer-profile').hidden,false);
  }
  const visit = factory.queueCustomer({name:'New uniforms',customer:'Custom school name',quantity:20,priority:1,deadline:30,destination:'sports'});
  ui.state(factory);
  ui.run('selectMapAgent(' + JSON.stringify(visit.id) + ')');
  assert.equal(ui.elements.get('order-customer').value,'Custom school name');
  assert.equal(ui.elements.get('order-destination').value,'sports');
  ui.elements.get('customer-profile').onclick();
  assert.equal(ui.elements.get('order-dialog').open,false);
  assert.equal(ui.elements.get('agent-dialog').open,true);
  ui.run('openOrder()');
  assert.equal(ui.elements.get('order-customer').value,'');
  assert.equal(ui.elements.get('agent-dialog').open,false);
});

test('resource controls remain available in popup profiles after side panel removal', () => {
  const ui = createUI();
  ui.state(new Factory());
  for (const [agent,control] of [['HR','apply-workers'],['Stores','apply-restock'],['SEW-A','Pause station'],['TRUCK-1','Pause new trips'],['Calendar','Open all orders calendar']]) {
    ui.run('selectMapAgent('+JSON.stringify(agent)+')');
    assert.equal(ui.elements.get('agent-dialog').open,true);
    assert.ok(ui.elements.get('profile-controls').innerHTML.includes(control),agent+' lost its controls');
  }
});

test('rapid clock steps resume truck animation from its displayed road position', () => {
  const ui=createUI();
  const factory=new Factory();
  const delivery=factory.deliveries[0];
  while(factory.time<delivery.start) factory.step();
  ui.state(factory);
  ui.run('window.requestAnimationFrame = () => 1');
  const marker=ui.elements.get('marker-'+delivery.truck);
  const animations=[];
  marker.animate=(frames)=>{
    const animation={frames,currentTime:500,playState:'running',cancel(){this.playState='idle';}};
    animations.push(animation);
    return animation;
  };
  factory.step();
  ui.state(factory);
  factory.step();
  ui.state(factory);
  assert.equal(animations.length,2);
  assert.equal(animations[0].playState,'idle');
  const expected=ui.run('truckPositionAt('+JSON.stringify(delivery.truck)+',state.deliveries,state.locations,'+(delivery.start+.5)+',960,738)');
  assert.ok(Math.abs(parseFloat(animations[1].frames[0].left)-expected.x)<.00001);
  assert.ok(Math.abs(parseFloat(animations[1].frames[0].top)-expected.y)<.00001);
});

test('step mode freezes automatic message playback and navigates one message at a time', () => {
  const ui=createUI();
  ui.state(new Factory());
  ui.run('freezeCommunication()');
  assert.equal(ui.run('followLive'),false);
  assert.equal(ui.run('messageTimer'),undefined);
  assert.equal(ui.run('currentMessage().id'),1);
  ui.elements.get('map-next').onclick();
  assert.equal(ui.run('currentMessage().id'),2);
  ui.elements.get('map-previous').onclick();
  assert.equal(ui.run('currentMessage().id'),1);
  assert.equal(ui.elements.get('map-run-status').textContent,'Step mode');
});

test('internal order agents are drawn in the company workspace and customer relays identify their manager', () => {
  const ui=createUI();
  const factory=new Factory();
  ui.state(factory);
  assert.equal(ui.run("visualAgentId('ORD-101')"),'Coordinator');
  assert.equal(ui.run("visualAgentId('CUSTOMER-school')"),'CUSTOMER-school');
  const relay=factory.messages.find(message=>message.forwardedFrom==='Calendar');
  ui.run('renderPopup('+JSON.stringify(relay)+')');
  assert.match(ui.elements.get('agent-popup').innerHTML,/Manager/);
  assert.match(ui.elements.get('agent-popup').innerHTML,/Relayed by manager from Calendar/);
  ui.run("selected='CUSTOMER-school'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Communication partners include Manager\./);
});

test('random traffic status, priorities and planning order are visible on the map', () => {
  const ui=createUI();
  const factory=new Factory();
  factory.setRandomTraffic(true,12345);
  for(let i=0;i<18;i++)factory.step();
  ui.state(factory);
  assert.equal(ui.elements.get('random-customers').checked,true);
  assert.match(ui.elements.get('random-traffic-status').textContent,/Next visitor/);
  const queue=ui.elements.get('planning-queue').innerHTML;
  assert.match(queue,/Urgent/);
  assert.match(queue,/High/);
  assert.match(queue,/Normal/);
  ui.run("selected='Manager'; renderAgentProfile()");
  assert.match(ui.elements.get('agent-profile').innerHTML,/Stochastic customer arrivals/);
});

test('manual clock steps display current events and clear stale communication on an empty step', () => {
  const ui=createUI();
  const factory=new Factory();
  ui.state(factory);
  ui.run('freezeCommunication()');
  const previousId=factory.messages.at(-1).id;
  factory.step(.25);
  ui.state(factory);
  ui.run('showManualStepEvents('+previousId+')');
  assert.ok(ui.run('currentMessage().id')>previousId);
  assert.equal(ui.run('currentMessage().sender'),'Stores');
  const nextId=factory.messages.at(-1).id;
  factory.step(.25);
  ui.state(factory);
  ui.run('showManualStepEvents('+nextId+')');
  assert.equal(ui.run('communicationActive'),false);
  assert.equal(ui.elements.get('agent-popup').hidden,true);
});

test('customer communication bubbles track the visiting customer while they leave reception', () => {
  const ui=createUI();
  const factory=new Factory();
  ui.state(factory);
  factory.step();
  ui.state(factory);
  const departure=factory.messages.find(message=>message.orderId==='ORD-101' && message.detail.includes('leaves reception'));
  assert.equal(ui.run('messageAgentId('+JSON.stringify(departure.sender)+','+JSON.stringify(departure)+')'),'VISIT-1');
  ui.run('renderPopup('+JSON.stringify(departure)+')');
  const top=ui.elements.get('agent-popup').style.top;
  factory.step(.25);
  ui.state(factory);
  ui.run('renderPopup('+JSON.stringify(departure)+')');
  assert.notEqual(ui.elements.get('agent-popup').style.top,top);
  assert.match(ui.elements.get('agent-popup').innerHTML,/Recorded H01/);
});
