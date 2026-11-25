let state;
let selected = 'Manager';
let filter = null;
let calendarDay = 0;
let replayIndex = 0;
let replayTimer;
let followLive = true;
let liveMessage;
let liveQueue = [];
let lastMessageId = 0;
let messageTimer;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const artwork = {
  Manager: 1, HR: 2, Stores: 3, Coordinator: 4, Calendar: 5,
  Logistics: 6, Monitor: 7, CUT: 8, 'SEW-A': 9, 'SEW-B': 9, 'SEW-C': 9, FIN: 10
};
const connections = [
  ['Manager','Coordinator'], ['HR','Coordinator'], ['Stores','CUT'],
  ['Coordinator','CUT'], ['Coordinator','SEW-A'], ['Coordinator','SEW-B'],
  ['CUT','SEW-A'], ['SEW-A','FIN'], ['SEW-B','FIN'],
  ['FIN','Stores'], ['Stores','Logistics'], ['Logistics','TRUCK-1'],
  ['Logistics','TRUCK-2'], ['Coordinator','Calendar'], ['Monitor','Logistics'],
  ['CUSTOMER-school','Manager'], ['Calendar','CUSTOMER-school'],
  ['Calendar','CUSTOMER-sports'], ['Calendar','CUSTOMER-workwear']
];
const scenarios = [
  ['visit', 'Customer reception visit', 'A customer arrives, submits an order and leaves. Advance simulation time to follow the visit.'],
  ['outage', 'Production line outage', 'Sewing A pauses. Orders negotiate with the remaining line.'],
  ['staff', 'Worker absence', 'HR has six workers. Reduced staffing slows future production.'],
  ['fabric', 'Fabric shortage', 'A large customer order waits until you restock stores.'],
  ['truck', 'Fleet unavailable', 'Both trucks pause. Production proceeds and finished goods wait.'],
  ['road', 'Road disruption', 'Future truck journeys take twice as long.'],
  ['urgent', 'Urgent customer order', 'Managers insert a high priority order into the shared calendar.'],
  ['join', 'New production line', 'Sewing C joins with three workers and advertises capacity.'],
  ['scarcity', 'Sewing capacity lost', 'Both sewing lines pause. Restore one to resume planning.']
];

function dateAt(hour) {
  const date = new Date(Date.UTC(2026, 10, 25, 8) + hour * 3600000);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
function timeAt(hour) { return 'H' + String(hour).padStart(2, '0'); }
function productionEnd(order) { return state.bookings.find(b => b.orderId === order.id && b.stage === 'finishing')?.end; }
function deliveryFor(order) { return state.deliveries.find(d => d.orderId === order.id); }
function currentMessage() { return followLive ? liveMessage || state.messages.at(-1) : state.messages[replayIndex]; }

function acceptState(snapshot) {
  const reset = !state || snapshot.epoch !== state.epoch || snapshot.time < state.time || snapshot.round < state.round || (snapshot.messages.at(-1)?.id || 0) < lastMessageId;
  if (reset) {
    stopReplay();
    followLive = true;
    replayIndex = 0;
    $('map-visitors').innerHTML = '';
    clearTimeout(messageTimer);
    messageTimer = undefined;
    liveQueue = [];
    liveMessage = undefined;
    lastMessageId = 0;
  }
  state = snapshot;
  const fresh = state.messages.filter(message => message.id > lastMessageId);
  liveQueue.push(...fresh);
  lastMessageId = state.messages.at(-1)?.id || 0;
  if (!messageTimer && followLive) showNextLiveMessage();
  render();
}

function showNextLiveMessage() {
  clearTimeout(messageTimer);
  messageTimer = undefined;
  if (!followLive || !liveQueue.length) return;
  liveMessage = liveQueue.shift();
  renderReplay();
  messageTimer = setTimeout(showNextLiveMessage, 2600);
}

function followLatest() {
  stopReplay();
  clearTimeout(messageTimer);
  messageTimer = undefined;
  liveQueue = [];
  liveMessage = state.messages.at(-1);
  followLive = true;
  renderReplay();
}

function art(index, className = '') {
  return '<span class="network-art ' + className + '" style="background-position:' + (index % 4 * 100 / 3) + '% ' + (Math.floor(index / 4) * 50) + '%" aria-hidden="true"></span>';
}

function visualAgentId(id) {
  const order = state.orders.find(order => order.id === id);
  if (order) return 'CUSTOMER-' + order.destination;
  return id === 'Fleet' ? 'Logistics' : id;
}

function messageText(message) {
  const order = state.orders.find(order => order.id === message.orderId);
  const quantity = order?.quantity;
  if (message.type === 'CFP') return message.sender === 'Logistics'
    ? 'Who can deliver ' + quantity + ' garments to ' + order.customer + '?'
    : 'Can you handle ' + quantity + ' garments for this order?';
  if (message.type === 'PROPOSE') return message.sender.startsWith('TRUCK')
    ? 'I can make this delivery. ' + message.detail
    : 'I have a free production slot. ' + message.detail;
  if (message.type === 'ACCEPT') return 'Your offer is selected. ' + message.detail;
  if (message.type === 'RESERVE') return 'Fabric is set aside for your order.';
  if (message.type === 'REFUSE') return 'I cannot take this job. ' + message.detail;
  if (message.type === 'WAIT') return 'This order needs to wait. ' + message.detail;
  if (message.type === 'REGISTER') return 'I have joined the factory and can take work.';
  return message.detail;
}

async function action(type, extra = {}) {
  try {
    const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Action failed');
    $('error').hidden = true;
    acceptState(result);
    return true;
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
    return false;
  }
}

function setView(name) {
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  for (const id of ['map', 'calendar', 'lab', 'messages']) $('view-' + id).hidden = id !== name;
  if (state) render();
}

function coreAgents() {
  return [
    { id: 'Manager', name: 'Operations manager', role: 'Management agent', x: 13, y: 23, status: 'Coordinating', goal: 'Fulfil customer delivery deadlines', beliefs: 'Customer priorities, resource availability and delivery commitments', intentions: 'Approve orders and request a feasible end-to-end plan', sensors: 'Order requests and exception alerts', actuators: 'Planning requests and priority policy' },
    { id: 'HR', name: 'Human resources', role: 'Workforce agent', x: 13, y: 49, status: state.workers + ' workers present', goal: 'Staff production with the available workforce', beliefs: 'Worker attendance and staffing needs for each line', intentions: 'Protect active work, then allocate staff to available stations', sensors: 'Attendance and current operations', actuators: 'Worker allocations that determine effective production rates' },
    { id: 'Stores', name: 'Stores & warehouse', role: 'Inventory agent', x: 13, y: 75, status: state.stock - state.reserved + ' m unreserved', goal: 'Supply fabric and hold finished goods until dispatch', beliefs: state.stock + ' m on hand, ' + state.reserved + ' m reserved', intentions: 'Reserve fabric only for feasible production routes and issue it at cutting', sensors: 'Stock receipts, reservations and finishing reports', actuators: 'Material reservations, fabric issues and truck loading' },
    { id: 'Coordinator', name: 'Production manager', role: 'Coordination agent', x: 34, y: 49, status: 'Plan round ' + state.round, goal: 'Allocate feasible production routes by order priority', beliefs: 'Station offers, stage dependencies and occupied time slots', intentions: 'Commit the earliest finishing complete route without overlaps', sensors: 'Capacity proposals and resource alerts', actuators: 'Accepted reservations and replanning' },
    { id: 'Calendar', name: 'Order calendar', role: 'Calendar agent', x: 34, y: 75, status: state.orders.length + ' orders tracked', goal: 'Publish production and delivery commitments', beliefs: 'Production reservations and confirmed truck arrivals', intentions: 'Tell customers their revised arrival time', sensors: 'Committed routes and delivery bids', actuators: 'Calendar entries and customer confirmations' },
    { id: 'Logistics', name: 'Dispatch depot', role: 'Logistics agent', x: 67, y: 49, status: state.trucks.filter(t => t.available).length + ' trucks available', goal: 'Deliver finished garments with available trucks', beliefs: 'Truck capacities, return times and road travel times', intentions: 'Compare bids and accept the earliest final delivery', sensors: 'Production completion times and truck offers', actuators: 'Dispatch reservations and delivery assignments' },
    { id: 'Monitor', name: 'Network monitor', role: 'Monitoring agent', x: 51, y: 92, status: state.roadDelayed ? 'Road delay active' : 'Roads normal', goal: 'Report changes in the operating environment', beliefs: 'Station availability and road condition', intentions: 'Notify managers when future plans need revision', sensors: 'Disruption controls', actuators: 'Alerts that trigger replanning' }
  ];
}

function allAgents() {
  const core = coreAgents();
  const stations = state.stations.map(s => ({
    ...s, role: 'Production resource agent',
    status: !s.available ? 'Paused' : s.assigned + '/' + s.required + ' workers',
    goal: 'Complete ' + s.stage + ' work within reserved capacity',
    beliefs: 'Own calendar and effective rate ' + Math.round(s.rate * s.assigned / s.required) + ' garments/hour',
    intentions: 'Propose earliest free slots and honour accepted work',
    sensors: 'Capacity requests and HR allocations', actuators: 'Slot proposals, refusals and stage completion reports'
  }));
  const customers = state.locations.map(l => ({
    ...l, id: 'CUSTOMER-' + l.id, role: 'Customer agent',
    status: state.orders.filter(o => o.destination === l.id).length + ' orders',
    goal: 'Receive garments by the requested deadline', beliefs: 'Order quantity, priority and confirmed delivery time',
    intentions: 'Place an order and receive delivery updates', sensors: 'Calendar confirmations and delivery receipts', actuators: 'Customer order requests'
  }));
  const trucks = state.trucks.map(t => ({
    ...t, role: 'Delivery resource agent', status: t.available ? 'Available for bids' : 'Paused for future trips',
    goal: 'Deliver garments and return before the next assignment',
    beliefs: 'Capacity ' + t.capacity + ', route travel time and own dispatch calendar',
    intentions: 'Bid for the earliest feasible arrival without overlapping journeys',
    sensors: 'Delivery CFPs and road conditions', actuators: 'Delivery bids, vehicle journeys and receipt reports'
  }));
  const orders = state.orders.map(o => ({
    ...o, role: 'Order agent', status: o.status,
    goal: 'Deliver ' + o.quantity + ' garments by ' + timeAt(o.deadline),
    beliefs: 'Material availability, station offers and stage dependencies',
    intentions: 'Choose the earliest complete production route, then obtain a delivery',
    sensors: 'Station proposals and resource status', actuators: 'Capacity requests and accepted production slots'
  }));
  const visitors = (state.visits || []).map(visit => ({
    id: visit.id, name: visit.customer, role: 'Visiting customer agent', status: visit.phase,
    goal: 'Submit ' + visit.order.quantity + ' garments for delivery by ' + timeAt(visit.order.deadline),
    beliefs: 'Visit schedule, own order request and factory acknowledgement',
    intentions: 'Walk to reception, place the order, then return through the entrance',
    sensors: 'Simulation clock and order acknowledgement', actuators: 'Walking, order submission and departure'
  }));
  return [...core, ...stations, ...customers, ...trucks, ...orders, ...visitors];
}

function render() {
  if (!state) return;
  replayIndex = Math.min(replayIndex, Math.max(0, state.messages.length - 1));
  if (!allAgents().some(a => a.id === selected)) selected = 'Manager';
  $('clock').textContent = 'Hour ' + String(state.time).padStart(2, '0');
  $('date').textContent = dateAt(state.time) + ' (simulated)';
  $('status').textContent = state.running ? 'Simulation running' : 'Simulation paused';
  $('play').textContent = state.running ? 'Pause simulation' : 'Run simulation';
  const delivered = state.orders.filter(o => o.status === 'Delivered').length;
  const onTime = state.orders.filter(o => deliveryFor(o)?.end <= o.deadline).length;
  const transit = state.orders.filter(o => o.status === 'In transit').length;
  const metrics = [
    ['Customer orders', state.orders.length, delivered + ' delivered'],
    ['On-time delivery plans', onTime + ' / ' + state.orders.length, 'Final customer arrival'],
    ['Fabric available', state.stock - state.reserved + ' m', state.reserved + ' m reserved'],
    ['Workforce', state.workers, state.stations.reduce((sum, s) => sum + s.assigned, 0) + ' workers allocated'],
    ['In transit', transit, state.trucks.filter(t => t.available).length + ' trucks available for bids']
  ];
  $('metrics').innerHTML = metrics.map(([label, value, hint]) => '<div class="metric"><small>' + label + '</small><strong>' + value + '</strong><span>' + hint + '</span></div>').join('');
  renderMap();
  renderOrders();
  renderInspector();
  renderCalendar();
  renderMessages();
  renderEvidence();
  if ($('agent-dialog').open) renderAgentProfile();
}

function customerPosition(visit) {
  const offset = ((Number(visit.id.split('-')[1]) - 1) % 3) * 17;
  const gate = { x: 3, y: 94 };
  const reception = { x: 3, y: 40 + offset };
  let progress;
  if (state.time < visit.arriveAt) progress = Math.max(0, Math.min(1, (state.time - visit.start) / (visit.arriveAt - visit.start)));
  else if (state.time >= visit.departAt) progress = Math.max(0, 1 - (state.time - visit.departAt) / (visit.end - visit.departAt));
  else progress = 1;
  return { x: gate.x, y: gate.y + (reception.y - gate.y) * progress };
}

function renderVisitors() {
  const active = (state.visits || []).filter(visit => visit.phase !== 'Left');
  // Preserve markers across snapshots so transitions follow the same visible customer.
  for (const node of $('map-visitors').querySelectorAll('[data-visit]')) {
    if (active.some(visit => visit.id === node.dataset.visit)) {
      node.style.opacity = '';
      node.style.pointerEvents = '';
      delete node.dataset.exiting;
      continue;
    }
    if (node.dataset.exiting) continue;
    node.dataset.exiting = 'true';
    node.style.left = '3%';
    node.style.top = '94%';
    node.style.opacity = '0';
    node.style.pointerEvents = 'none';
    const epoch = state.epoch;
    setTimeout(() => {
      if (state.epoch === epoch && node.dataset.exiting) node.remove();
    }, 1100);
  }
  const speakingVisit = active.find(visit => visit.phase === 'Placing order');
  for (const visit of active) {
    let marker = document.getElementById('node-' + visit.id);
    if (!marker) {
      marker = document.createElement('button');
      marker.id = 'node-' + visit.id;
      marker.dataset.visit = visit.id;
      marker.dataset.agent = visit.id;
      $('map-visitors').append(marker);
    }
    const position = customerPosition(visit);
    marker.className = 'customer-marker ' + (visit.phase === 'Arriving' || visit.phase === 'Leaving' ? 'walking' : '') + (visit.phase === 'Leaving' ? ' leaving' : '');
    marker.style.left = position.x + '%';
    marker.style.top = position.y + '%';
    marker.innerHTML = '<img src="/assets/customer-visitor.png" alt="" draggable="false"><strong>' + escape(visit.customer) + '</strong><small>' + escape(visit.phase) + '</small>' + (visit.id === speakingVisit?.id ? '<span class="visit-speech">Please make ' + visit.order.quantity + ' garments.<br>Order ' + escape(visit.orderId) + ' submitted.</span>' : '');
    marker.setAttribute('aria-label', visit.customer + ', ' + visit.phase + '. Open agent details');
  }
  $('visit-status').innerHTML = '<strong>Reception visits</strong>' + (active.length ? active.map(visit => '<button data-agent="' + visit.id + '">' + escape(visit.customer) + ' | ' + escape(visit.phase) + ' | ' + (visit.orderId ? escape(visit.orderId) : 'Submit at ' + timeAt(visit.arriveAt)) + '</button>').join('') : '<p>Customers have left. Their orders continue through production and delivery.</p>');
}

function agentPosition(id) {
  const visit = state.visits?.find(visit => visit.id === id);
  if (visit) return customerPosition(visit);
  id = visualAgentId(id);
  if (state.trucks.some(t => t.id === id)) return truckPosition(id);
  return allAgents().find(a => a.id === id) || { x: 34, y: 49 };
}

function truckPosition(id) {
  const base = { x: 74, y: id === 'TRUCK-1' ? 64 : 80 };
  const delivery = state.deliveries.find(d => d.truck === id && d.start <= state.time && d.returnEnd > state.time);
  if (!delivery) return base;
  const destination = state.locations.find(l => l.id === delivery.destination);
  const elapsed = state.time - delivery.start;
  const leg = Math.floor(elapsed / delivery.travel);
  const legProgress = (elapsed % delivery.travel) / delivery.travel;
  const progress = leg % 2 === 0 ? legProgress : 1 - legProgress;
  // Orthogonal route follows the depot road to the customer column.
  const middle = 78;
  if (progress < .35) return { x: base.x + (middle - base.x) * progress / .35, y: base.y };
  if (progress < .7) return { x: middle, y: base.y + (destination.y - base.y) * (progress - .35) / .35 };
  return { x: middle + (destination.x - middle) * (progress - .7) / .3, y: destination.y };
}

function renderMap() {
  const message = currentMessage();
  $('map-message-position').textContent = followLive
    ? 'Showing ' + timeAt(message?.time ?? state.time) + (liveQueue.length ? ' | ' + liveQueue.length + ' queued' : ' | latest event')
    : 'Message ' + (replayIndex + 1) + ' / ' + state.messages.length;
  $('map-previous').disabled = !state.messages.length || (!followLive && replayIndex === 0);
  $('map-next').disabled = followLive || replayIndex >= state.messages.length - 1;
  const agents = allAgents().filter(a => a.x !== undefined && !a.id.startsWith('ORD'));
  $('map-nodes').innerHTML = agents.map(agent => {
    const working = state.bookings.some(b => b.station === agent.id && b.start <= state.time && b.end > state.time);
    const paused = agent.available === false || (agent.required && !agent.assigned);
    const speaking = message && visualAgentId(message.sender) === agent.id;
    const receiving = message && visualAgentId(message.receiver) === agent.id;
    const index = artwork[agent.id] ?? 11;
    return '<button id="node-' + agent.id + '" class="map-node ' + (working ? 'working ' : '') + (paused ? 'paused ' : '') + (selected === agent.id ? 'selected ' : '') + (speaking ? 'speaking ' : '') + (receiving ? 'receiving' : '') + '" style="left:' + agent.x + '%;top:' + agent.y + '%" data-agent="' + agent.id + '" aria-label="' + escape(agent.name + ', ' + agent.status) + '">' + art(index) + '<strong>' + escape(agent.name) + '</strong><small>' + escape(working ? 'Working | ' + agent.status : agent.status) + '</small></button>';
  }).join('');
  // Keep marker elements so CSS can interpolate actual vehicle movement between steps.
  for (const truck of state.trucks) {
    let marker = document.getElementById('marker-' + truck.id);
    if (!marker) {
      marker = document.createElement('button');
      marker.id = 'marker-' + truck.id;
      marker.dataset.agent = truck.id;
      $('map-trucks').append(marker);
    }
    const position = truckPosition(truck.id);
    const moving = state.deliveries.some(d => d.truck === truck.id && d.start <= state.time && d.returnEnd > state.time);
    const speaking = message && message.sender === truck.id;
    const receiving = message && message.receiver === truck.id;
    marker.className = 'truck-marker' + (!truck.available && !moving ? ' paused' : '') + (moving ? ' travelling' : '') + (speaking ? ' speaking' : '') + (receiving ? ' receiving' : '');
    const delivery = state.deliveries.find(d => d.truck === truck.id && d.start <= state.time && d.returnEnd > state.time);
    const returning = delivery && Math.floor((state.time - delivery.start) / delivery.travel) % 2 === 1;
    marker.style.left = position.x + '%';
    marker.style.top = position.y + '%';
    marker.innerHTML = art(0, returning ? 'returning' : '') + '<strong>' + truck.id.replace('TRUCK-', 'Truck ') + '</strong><small>' + (moving ? returning ? 'Returning' : 'Delivering' : truck.available ? 'At depot' : 'Unavailable') + '</small>';
    marker.setAttribute('aria-label', truck.name + (moving ? ' travelling' : ' at depot'));
  }
  $('road-state').textContent = state.roadDelayed ? 'Road delay: future travel x2' : 'Roads open';
  $('road-toggle').textContent = state.roadDelayed ? 'Restore road' : 'Disrupt road';
  $('live-message').innerHTML = message ? '<span class="tag">' + escape(message.type) + '</span><strong>' + escape(message.sender) + ' &rarr; ' + escape(message.receiver) + ' | ' + timeAt(message.time) + '</strong><p>' + escape(message.detail) + '</p>' : 'Waiting for agent messages';
  renderVisitors();
  drawRoads();
  drawConnections(message);
  renderPopup(message);
}

function drawRoads() {
  const canvas = $('roads');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const x = v => v / 100 * rect.width;
  const y = v => v / 100 * rect.height;
  function road(points, color, width, dash = []) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    points.forEach(([a, b], i) => i ? ctx.lineTo(x(a), y(b)) : ctx.moveTo(x(a), y(b)));
    ctx.stroke();
  }
  const roads = [
    [[4,94],[4,40],[13,23]],
    [[13,23],[67,23]], [[13,49],[67,49]], [[13,75],[51,75]],
    [[23,23],[23,75]], [[42,23],[42,75]], [[59,23],[59,92]],
    [[67,49],[74,64],[78,64]], [[74,80],[78,80]], [[78,20],[78,79]],
    ...state.locations.map(l => [[78,l.y],[l.x,l.y]])
  ];
  for (const points of roads) {
    road(points, '#cbd4c8', 17);
    road(points, '#f4f6ef', 12);
    road(points, '#b6c1b0', 1, [5, 7]);
  }
  if (state.roadDelayed) road([[78,35],[78,60]], '#d99255', 5, [5, 5]);

}

function mapBounds(id) {
  const position = agentPosition(id);
  const node = document.getElementById((state.trucks.some(t => t.id === id) ? 'marker-' : 'node-') + visualAgentId(id));
  const rect = node?.getBoundingClientRect();
  return { ...position, width: rect?.width || 118, height: rect?.height || 118 };
}

function drawConnections(message) {
  const canvas = $('connections');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  function arrow(sender, receiver, active) {
    const from = mapBounds(sender);
    const to = mapBounds(receiver);
    const a = { x: from.x / 100 * rect.width, y: from.y / 100 * rect.height };
    const b = { x: to.x / 100 * rect.width, y: to.y / 100 * rect.height };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 2) return;
    const startFactor = Math.min(dx ? (from.width / 2 + 6) / Math.abs(dx) : Infinity, dy ? (from.height / 2 + 6) / Math.abs(dy) : Infinity);
    const endFactor = Math.min(dx ? (to.width / 2 + 9) / Math.abs(dx) : Infinity, dy ? (to.height / 2 + 9) / Math.abs(dy) : Infinity);
    const start = { x: a.x + dx * startFactor, y: a.y + dy * startFactor };
    const end = { x: b.x - dx * endFactor, y: b.y - dy * endFactor };
    if (startFactor + endFactor >= 1) return;
    ctx.strokeStyle = active ? '#dc2626' : 'rgba(190, 35, 35, .32)';
    ctx.fillStyle = active ? '#dc2626' : 'rgba(190, 35, 35, .5)';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash(active ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const size = active ? 12 : 8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - size * Math.cos(angle - .45), end.y - size * Math.sin(angle - .45));
    ctx.lineTo(end.x - size * Math.cos(angle + .45), end.y - size * Math.sin(angle + .45));
    ctx.closePath();
    ctx.fill();
  }
  if ($('show-connections').checked) {
    for (const [sender, receiver] of connections) arrow(sender, receiver, false);
    if (state.stations.some(s => s.id === 'SEW-C')) {
      arrow('Coordinator', 'SEW-C', false);
      arrow('SEW-C', 'FIN', false);
    }
  }
  for (const visit of (state.visits || []).filter(visit => visit.phase === 'Placing order')) arrow(visit.id, 'Manager', true);
  if (message) arrow(message.sender, message.receiver, true);
}

function renderPopup(message) {
  const popup = $('agent-popup');
  popup.hidden = !message;
  if (!message) return;
  const key = state.epoch + '-' + message.id;
  if (popup.dataset.message !== key) {
    popup.dataset.message = key;
    popup.innerHTML = '<div class="popup-heading"><strong>' + escape(message.sender) + '</strong><span>' + escape(message.type) + '</span></div><small>To ' + escape(message.receiver) + (message.orderId ? ' | ' + escape(message.orderId) : '') + '</small><p>' + escape(messageText(message)) + '</p>';
  }
  const map = $('factory-map').getBoundingClientRect();
  if (!map.width) return;
  const actor = mapBounds(message.sender);
  const bounds = popup.getBoundingClientRect();
  const actorX = actor.x / 100 * map.width;
  const actorY = actor.y / 100 * map.height;
  const left = Math.max(10, Math.min(map.width - bounds.width - 10, actorX - bounds.width / 2));
  let top = actorY - actor.height / 2 - bounds.height - 15;
  const below = top < 12;
  if (below) top = actorY + actor.height / 2 + 15;
  popup.style.left = left + 'px';
  popup.style.top = Math.max(12, Math.min(map.height - bounds.height - 12, top)) + 'px';
  popup.style.setProperty('--tail-left', Math.max(18, Math.min(bounds.width - 18, actorX - left)) + 'px');
  popup.classList.toggle('below', below);
}

function renderOrders() {
  $('order-list').innerHTML = state.orders.map(order => {
    const arrival = deliveryFor(order)?.end;
    const stages = ['cutting', 'sewing', 'finishing', 'delivery'];
    const pipeline = stages.map(stage => {
      const job = stage === 'delivery' ? deliveryFor(order) : state.bookings.find(b => b.orderId === order.id && b.stage === stage);
      const status = job && job.end <= state.time ? 'done' : job && job.start <= state.time ? 'active' : '';
      return '<span class="' + status + '">' + stage + '</span>';
    }).join('');
    return '<div class="order-card" role="button" tabindex="0" data-order="' + order.id + '"><div class="order-top"><h3>' + escape(order.name) + '</h3><span class="pill ' + (arrival === undefined || arrival > order.deadline ? 'late' : '') + '">' + escape(order.status) + '</span></div><small>' + order.id + ' | ' + escape(order.customer) + ' | ' + order.quantity + ' garments | ' + ['','Normal','High','Urgent'][order.priority] + '</small><small>Due ' + dateAt(order.deadline) + ' (' + timeAt(order.deadline) + ') | Arrival ' + (arrival === undefined ? 'awaiting truck / resources' : dateAt(arrival) + ' (' + timeAt(arrival) + ')') + '</small><div class="pipeline">' + pipeline + '</div></div>';
  }).join('');
}

function renderInspector() {
  if (document.activeElement?.matches('#worker-count, #restock-quantity')) return;
  const agents = allAgents();
  $('agent-select').innerHTML = agents.map(a => '<option value="' + a.id + '"' + (selected === a.id ? ' selected' : '') + '>' + escape(a.name) + ' (' + a.id + ')</option>').join('');
  const agent = agents.find(a => a.id === selected);
  const recent = state.messages.filter(m => m.sender === selected || m.receiver === selected || m.orderId === selected).at(-1);
  let controls = '';
  if (state.stations.some(s => s.id === selected)) controls = '<button data-station="' + selected + '">' + (agent.available ? 'Pause station' : 'Restore station') + '</button>';
  if (state.trucks.some(t => t.id === selected)) controls = '<button data-truck="' + selected + '">' + (agent.available ? 'Pause new trips' : 'Restore truck') + '</button>';
  if (selected === 'HR') controls = '<label>Workers present<input id="worker-count" type="number" min="0" max="40" value="' + state.workers + '"></label><button id="apply-workers">Apply attendance</button>';
  if (selected === 'Stores') controls = '<label>Fabric receipt (metres)<input id="restock-quantity" type="number" min="1" max="10000" value="500"></label><button id="apply-restock">Receive fabric</button>';
  if (selected.startsWith('CUSTOMER-') || selected === 'Manager') controls = '<button id="inspect-order">Place customer order</button>';
  if (selected === 'Monitor') controls = '<button data-action="road">' + (state.roadDelayed ? 'Restore road' : 'Disrupt road') + '</button>';
  if (selected === 'Calendar') controls = '<button data-view="calendar">Open all orders calendar</button>';
  const related = state.orders.find(o => o.id === selected);
  const truckJobs = state.deliveries.filter(d => d.truck === selected);
  const assignments = truckJobs.map(d => '<p>' + d.orderId + ' | dispatch ' + timeAt(d.start) + ' | arrive ' + timeAt(d.end) + ' | return ' + timeAt(d.returnEnd) + ' | ' + d.trips + ' trip(s)</p>').join('');
  $('inspector').innerHTML = '<div class="agent-kind">' + escape(agent.role) + '</div><h3>' + escape(agent.name) + '</h3><p>' + escape(agent.status) + '</p><div class="agent-actions">' + controls + '<button id="full-profile">All agent details</button></div><dl><dt>Goal</dt><dd>' + escape(agent.goal) + '</dd><dt>Beliefs</dt><dd>' + escape(agent.beliefs) + '</dd><dt>Intentions</dt><dd>' + escape(agent.intentions) + '</dd><dt>Percepts / sensors</dt><dd>' + escape(agent.sensors) + '</dd><dt>Actions / actuators</dt><dd>' + escape(agent.actuators) + '</dd></dl>' + assignments + (related ? '<button data-conversation="' + related.id + '">View order messages</button>' : '') + (recent ? '<div class="latest-event"><strong>Latest decision</strong><p>' + escape(recent.detail) + '</p></div>' : '');
}

function calendarEvents() {
  return [
    ...state.bookings.map(b => ({ ...b, resource: b.station, label: b.stage, kind: 'production' })),
    ...state.deliveries.map(d => ({ ...d, resource: d.truck, label: 'Delivery to ' + state.locations.find(l => l.id === d.destination).name + ' (return ' + timeAt(d.returnEnd) + ')', kind: 'delivery' })),
    ...state.orders.map(o => ({ orderId: o.id, start: o.deadline, end: o.deadline, resource: 'Customer', label: 'Delivery deadline', kind: 'deadline' }))
  ].sort((a,b) => a.start - b.start);
}
function renderCalendar() {
  const start = calendarDay * 24 - 8;
  const finish = start + 24;
  $('calendar-day').textContent = dateAt(calendarDay * 24).split(',')[0] + ' | Day ' + (calendarDay + 1);
  $('calendar-prev').disabled = calendarDay <= 0;
  const events = calendarEvents().filter(e => e.start < finish && e.end >= start);
  $('day-calendar').innerHTML = events.length ? events.map(e => '<div class="calendar-item ' + e.kind + '" role="button" tabindex="0" data-order="' + e.orderId + '"><strong>' + timeAt(e.start) + (e.start === e.end ? '' : '-' + timeAt(e.end)) + '</strong><div><b>' + e.orderId + ' | ' + escape(e.resource) + '</b><p>' + escape(e.label) + ' | ' + dateAt(e.start) + '</p></div></div>').join('') : '<p>No bookings on this simulated date.</p>';
  const horizon = Math.max(30, state.time + 2, ...state.bookings.map(b => b.end), ...state.deliveries.map(d => d.returnEnd), ...state.previous.map(b => b.end));
  function block(b, previous = false) {
    const index = state.orders.findIndex(o => o.id === b.orderId);
    const end = b.returnEnd ?? b.end;
    return '<button class="booking o' + index % 4 + (previous ? ' previous' : '') + '" style="left:' + b.start / horizon * 100 + '%;width:' + (end - b.start) / horizon * 100 + '%" data-order="' + b.orderId + '" title="' + b.orderId + ' ' + timeAt(b.start) + '-' + timeAt(end) + '">' + (previous ? '' : b.orderId + ' ' + timeAt(b.start) + '-' + timeAt(end)) + '</button>';
  }
  const resources = [...state.stations, ...state.trucks];
  $('gantt').innerHTML = '<div class="gantt-inner"><div class="ticks">' + Array.from({length:6}, (_,i) => '<span>' + Math.round(i * horizon / 5) + 'h</span>').join('') + '</div>' + resources.map(r => '<div class="gantt-row"><div class="station-label">' + escape(r.name) + '</div><div class="track">' + ($('compare').checked ? state.previous.filter(b => b.station === r.id).map(b => block(b, true)).join('') : '') + state.bookings.filter(b => b.station === r.id).map(b => block(b)).join('') + state.deliveries.filter(d => d.truck === r.id).map(d => block(d)).join('') + '<div class="time-marker" style="left:' + state.time / horizon * 100 + '%"></div></div></div>').join('') + '</div>';
}

function renderMessages() {
  const message = currentMessage();
  $('filter-label').textContent = filter ? 'Conversation for ' + filter : 'All conversations';
  const filtered = state.messages.filter(m => !filter || m.orderId === filter);
  $('message-list').innerHTML = filtered.slice().reverse().map(m => '<tr><td>' + timeAt(m.time) + '<br>#' + m.id + '</td><td>' + escape(m.sender) + ' &rarr; ' + escape(m.receiver) + '</td><td><span class="message-type">' + escape(m.type) + '</span></td><td>' + escape(m.detail) + '</td></tr>').join('');
  $('event-position').textContent = followLive ? 'Live message queue | ' + liveQueue.length + ' pending' : 'Message ' + (replayIndex + 1) + ' / ' + state.messages.length;
  $('event-back').disabled = !state.messages.length || (!followLive && replayIndex === 0);
  $('event-next').disabled = followLive || replayIndex >= state.messages.length - 1;
  $('event-detail').innerHTML = message ? '<strong>' + escape(message.sender) + ' &rarr; ' + escape(message.receiver) + ' | ' + escape(message.type) + '</strong><p>' + escape(message.detail) + '</p><div class="message-meta"><span>Conversation ' + escape(message.conversationId) + '</span><span>Ontology ' + escape(message.ontology) + '</span><span>Protocol ' + escape(message.protocol) + '</span><span>Performative ' + escape(message.performative) + '</span></div>' : 'No messages';
}

function renderEvidence() {
  const count = type => state.messages.filter(m => m.type === type).length;
  const changed = state.previous.filter(old => !state.bookings.some(b => b.orderId === old.orderId && b.stage === old.stage && b.station === old.station && b.start === old.start)).length;
  const evidence = [
    ['Communication', state.messages.length + ' messages between customers, managers, stores, HR, production and trucks.'],
    ['Negotiation', count('CFP') + ' calls for proposals, ' + count('PROPOSE') + ' offers and ' + count('ACCEPT') + ' accepted reservations.'],
    ['Coordination', state.bookings.length + ' production reservations and ' + state.deliveries.length + ' delivery assignments share resource calendars.'],
    ['Autonomy', 'Stations compute free slots. Logistics ranks truck bids by final arrival. Orders choose earliest production completion.'],
    ['Adaptation', count('ALERT') + ' environment alerts. ' + changed + ' previous production operations changed or withdrawn.'],
    ['Shared resources', state.reserved + ' m fabric reserved, ' + state.workers + ' workers present, ' + state.trucks.length + ' truck agents.'],
    ['Loose coupling', state.stations.length + ' stations discovered by stage. The joining scenario registers a sewing line with its own capacity.'],
    ['Completion evidence', state.orders.filter(o => o.status === 'Delivered').length + ' orders delivered. ' + count('WAIT') + ' recorded waits expose resource constraints.']
  ];
  $('property-evidence').innerHTML = evidence.map(([name, detail]) => '<article><strong>' + name + '</strong><p>' + escape(detail) + '</p></article>').join('');
  $('noticeboard').innerHTML = state.stations.map(s => '<article><strong>' + escape(s.name) + '</strong><p>' + (s.available ? 'Available' : 'Paused') + ' | ' + s.assigned + '/' + s.required + ' staff</p><p>' + Math.round(s.rate * s.assigned / s.required) + ' garments/hour | ' + state.bookings.filter(b => b.station === s.id).length + ' reservations</p></article>').join('');
}

function stopReplay() {
  clearInterval(replayTimer);
  replayTimer = undefined;
  $('replay').textContent = 'Replay messages';
  $('map-replay').textContent = 'Watch agent communication';
}
function renderReplay() { renderMap(); renderMessages(); }
function openOrder() {
  $('order-deadline').value = Math.min(1000, state.time + 30);
  $('order-deadline').min = state.time + 3;
  $('order-error').hidden = true;
  $('order-dialog').showModal();
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action],[data-agent],[data-station],[data-truck],[data-order],[data-view],[data-scenario],[data-conversation]');
  if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.action) {
    if (button.dataset.action === 'reset') { stopReplay(); followLive = true; calendarDay = 0; }
    await action(button.dataset.action);
  }
  if (button.dataset.agent) { selected = button.dataset.agent; renderMap(); renderInspector(); openAgentProfile(); }
  if (button.dataset.station) await action('station', { id: button.dataset.station });
  if (button.dataset.truck) await action('truck', { id: button.dataset.truck });
  if (button.dataset.order) { selected = button.dataset.order; filter = selected; renderMap(); renderInspector(); renderMessages(); }
  if (button.dataset.conversation) { filter = button.dataset.conversation; setView('messages'); }
  if (button.dataset.scenario) {
    stopReplay(); followLive = true; calendarDay = 0;
    await action('scenario', { name: button.dataset.scenario });
    setView('map');
  }
});
document.addEventListener('click', event => {
  if (event.target.id === 'apply-workers') action('workers', { count: Number($('worker-count').value) });
  if (event.target.id === 'apply-restock') action('restock', { quantity: Number($('restock-quantity').value) });
  if (event.target.id === 'inspect-order') openOrder();
  if (event.target.id === 'full-profile') openAgentProfile();
});
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role=button]')) {
    event.preventDefault(); event.target.click();
  }
});
$('agent-select').onchange = event => { selected = event.target.value; renderMap(); renderInspector(); };
$('new-order').onclick = openOrder;
$('close-order').onclick = () => $('order-dialog').close();
$('close-profile').onclick = () => $('agent-dialog').close();
$('order-form').onsubmit = async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const ok = await action('visit', { order: { name: data.get('name'), customer: data.get('customer'), destination: data.get('destination'), quantity: Number(data.get('quantity')), priority: Number(data.get('priority')), deadline: Number(data.get('deadline')) } });
  if (ok) { event.target.reset(); $('order-dialog').close(); selected = state.visits.at(-1).id; setView('map'); }
  else { $('order-error').textContent = $('error').textContent; $('order-error').hidden = false; }
};
$('compare').onchange = renderCalendar;
$('calendar-prev').onclick = () => { calendarDay = Math.max(0, calendarDay - 1); renderCalendar(); };
$('calendar-next').onclick = () => { calendarDay++; renderCalendar(); };
$('calendar-now').onclick = () => { calendarDay = Math.floor((state.time + 8) / 24); renderCalendar(); };
$('clear-filter').onclick = () => { filter = null; renderMessages(); };
function previousMessage() {
  stopReplay();
  replayIndex = Math.max(0, (followLive ? Math.max(0, state.messages.findIndex(m => m.id === currentMessage()?.id)) : replayIndex) - 1);
  followLive = false;
  renderReplay();
}
$('event-back').onclick = previousMessage;
$('map-previous').onclick = previousMessage;
function nextMessage() {
  stopReplay(); followLive = false;
  replayIndex = Math.min(state.messages.length - 1, replayIndex + 1);
  renderReplay();
}
$('event-next').onclick = nextMessage;
$('map-next').onclick = nextMessage;
$('follow-live').onclick = followLatest;
function toggleReplay() {
  if (replayTimer) { stopReplay(); return; }
  followLive = false; replayIndex = 0; renderReplay();
  $('replay').textContent = 'Pause replay';
  $('map-replay').textContent = 'Pause communication replay';
  replayTimer = setInterval(() => {
    if (replayIndex >= state.messages.length - 1) { stopReplay(); return; }
    replayIndex++; renderReplay();
  }, 2600);
}
$('replay').onclick = toggleReplay;
$('map-replay').onclick = toggleReplay;
$('map-live').onclick = followLatest;
$('scenario-list').innerHTML = scenarios.map(([id, name, detail]) => '<button data-scenario="' + id + '"><strong>' + name + '</strong><small>' + detail + '</small></button>').join('');
$('show-connections').onchange = () => drawConnections(currentMessage());
window.addEventListener('resize', () => { if (state) { drawRoads(); drawConnections(currentMessage()); renderPopup(currentMessage()); } });
const events = new EventSource('/events');
events.onmessage = event => {
  acceptState(JSON.parse(event.data));
  $('connection').textContent = 'Live connection';
};
events.onerror = () => { $('connection').textContent = 'Reconnecting'; };
function agentDetails(agent) {
  const station = state.stations.find(item => item.id === agent.id);
  const truck = state.trucks.find(item => item.id === agent.id);
  const order = state.orders.find(item => item.id === agent.id);
  const visit = state.visits?.find(item => item.id === agent.id);
  let key = agent.id;
  if (station) key = 'station';
  if (truck) key = 'truck';
  if (order) key = 'order';
  if (visit || agent.id.startsWith('CUSTOMER-')) key = 'customer';
  const policies = {
    Manager: {
      type: 'Goal-based agent', reason: 'Routes approved customer requirements into the production planning process.',
      actions: ['Approve an order request', 'Request a production plan', 'Receive shortage alerts'],
      knowledge: 'Customer quantities, delivery deadlines, fixed priority policy and resource exceptions.',
      criteria: 'Feasible fulfilment commitments and delivery deadlines.',
      adaptive: 'Receives revised commitments and resource exceptions as the factory changes.'
    },
    Coordinator: {
      type: 'Goal-based agent', reason: 'Builds feasible cutting, sewing and finishing routes and commits them in priority order.',
      actions: ['Order requests by priority and deadline', 'Commit a complete route', 'Preserve active work', 'Replan future reservations'],
      knowledge: 'All station calendars, stage dependencies, current time and order priorities.',
      criteria: 'Complete feasible routes, non-overlapping resource calendars and preserved active work.',
      adaptive: 'Recalculates future routes after station, staff and material changes.'
    },
    HR: {
      type: 'Goal-based agent', reason: 'Uses a fixed staffing heuristic to maintain stage coverage within attendance limits.',
      actions: ['Protect active crews', 'Allocate a minimum crew', 'Fill target crew sizes', 'Report remaining staff'],
      knowledge: 'Attendance, station crew requirements and operations already in progress.',
      criteria: 'Assigned workers stay within attendance and active work retains its crew.',
      adaptive: 'Allocations and effective rates change when attendance or available lines change.'
    },
    Stores: {
      type: 'Model-based reflex agent', reason: 'Uses the stock and reservation ledger to reserve, issue or defer fabric requests.',
      actions: ['Check available fabric', 'Reserve fabric', 'Issue fabric at cutting', 'Receive restock', 'Load finished garments'],
      knowledge: 'Physical fabric stock, committed reservations, issued materials and finished production.',
      criteria: 'Non-negative unreserved fabric and one material issue per order.',
      adaptive: 'Updated stock receipts allow waiting orders to obtain reservations.'
    },
    Calendar: {
      type: 'Model-based reflex agent', reason: 'Maintains commitments and reports the arrival time when a reservation changes.',
      actions: ['Publish production bookings', 'Publish dispatch and arrival', 'Compare arrival to deadline', 'Notify customer'],
      knowledge: 'Committed production and delivery times, customer deadlines and simulation date.',
      criteria: 'Displayed commitments agree with the current resource schedules.',
      adaptive: 'Publishes the revised schedule after a new planning round.'
    },
    Logistics: {
      type: 'Utility-based agent', reason: 'Ranks truck bids by final arrival hour, then trip count. Utility uses lexicographic (-arrival, -trips).',
      actions: ['Request truck bids', 'Compare arrival times', 'Select a delivery', 'Wait for fleet capacity'],
      knowledge: 'Production ready times, truck capacities, truck return calendars and road delays.',
      criteria: 'Earliest final customer arrival, using fewer trips to break arrival ties.',
      adaptive: 'Rebids future journeys when roads or fleet availability change.'
    },
    Monitor: {
      type: 'Simple reflex agent', reason: 'A station or road change immediately triggers an alert using a condition-action rule.',
      actions: ['Observe availability change', 'Report road condition', 'Send an alert to a manager'],
      knowledge: 'Current station and road status plus a fixed event-to-alert rule.',
      criteria: 'Report each controlled disruption so affected plans can be updated.',
      adaptive: 'Responds to current events using its fixed alert rule.'
    },
    station: {
      type: 'Goal-based agent', reason: 'Searches its calendar for the earliest free slot that can process the requested quantity.',
      actions: ['Receive capacity request', 'Propose a free slot', 'Refuse unavailable capacity', 'Complete a reserved stage'],
      knowledge: 'Own calendar, target production rate, assigned staff and required crew.',
      criteria: 'Earliest feasible slot, no overlapping work and completion of accepted stages.',
      adaptive: 'New offers reflect staffing and availability while active bookings are preserved.'
    },
    truck: {
      type: 'Goal-based agent', reason: 'Computes the earliest feasible journey using load size and the vehicle return calendar.',
      actions: ['Bid for delivery', 'Carry repeated loads', 'Report final receipt', 'Return to depot', 'Refuse new work when paused'],
      knowledge: 'Own load capacity, travel duration, accepted journeys and return times.',
      criteria: 'Capacity-respecting trips and no overlap through the final return to depot.',
      adaptive: 'Future bids use the latest road duration and availability.'
    },
    order: {
      type: 'Utility-based agent', reason: 'Ranks complete production routes by finish time. Utility is -productionFinishHour.',
      actions: ['Request fabric', 'Send capacity requests', 'Compare complete routes', 'Accept stage reservations', 'Wait for missing resources'],
      knowledge: 'Garment quantity, priority, deadline, fabric responses and station offers.',
      criteria: 'Earliest complete production route. Delivery timing is delegated to logistics.',
      adaptive: 'Chooses a revised feasible route after resource changes.'
    },
    customer: {
      type: 'Model-based reflex agent', reason: 'Remembers the visit phase and follows arrival, submission and departure rules.',
      actions: ['Walk to reception', 'Submit the configured order', 'Receive acknowledgement', 'Leave reception', 'Receive delivery updates'],
      knowledge: 'Own requested quantity, delivery deadline, destination and visit schedule.',
      criteria: 'Submit exactly once on arrival and leave while the factory continues fulfilment.',
      adaptive: 'Tracks factory confirmations. The customer request is configured by the user.'
    }
  };
  const policy = policies[key];
  const perceivedBy = visit ? 'CUSTOMER-' + visit.destination : agent.id;
  const percepts = (state.percepts || []).filter(percept => percept.agent === perceivedBy && (!visit || !visit.orderId || !percept.orderId || percept.orderId === visit.orderId));
  const messages = state.messages.filter(message => (message.sender === perceivedBy || message.receiver === perceivedBy) && (!visit || !visit.orderId || !message.orderId || message.orderId === visit.orderId));
  const peers = [...new Set(messages.map(message => message.sender === perceivedBy ? message.receiver : message.sender))];
  const position = agentPosition(agent.id);
  const delivered = state.orders.filter(item => item.status === 'Delivered').length;
  let current = state.orders.length + ' orders; ' + delivered + ' delivered.';
  if (station) current = station.assigned + '/' + station.required + ' staff; effective rate ' + Math.round(station.rate * station.assigned / station.required) + ' garments/hour.';
  if (truck) current = 'Load capacity ' + truck.capacity + '; ' + state.deliveries.filter(item => item.truck === truck.id).length + ' assigned deliveries.';
  if (order) current = order.status + '; planned production finish ' + (productionEnd(order) ?? 'waiting') + '; delivery ' + (deliveryFor(order)?.end ?? 'waiting') + '.';
  if (visit) current = visit.phase + '; submission ' + timeAt(visit.arriveAt) + '; departure ' + timeAt(visit.departAt) + '; exit ' + timeAt(visit.end) + '.';
  if (agent.id === 'Stores') current = state.stock + ' m on hand; ' + state.reserved + ' m reserved; ' + (state.stock - state.reserved) + ' m unreserved.';
  if (agent.id === 'HR') current = state.stations.reduce((sum, item) => sum + item.assigned, 0) + ' workers assigned out of ' + state.workers + ' present.';
  const location = order ? 'Order planning workspace for ' + order.customer : visit ? 'Customer entrance and reception walkway' : truck ? 'Dispatch depot and customer road network' : agent.id.startsWith('CUSTOMER-') ? 'Customer delivery location' : 'Factory campus at map position ' + Math.round(position.x) + '%, ' + Math.round(position.y) + '%';
  return { policy, percepts, peers, messages, current, location };
}

function openAgentProfile() {
  renderAgentProfile();
  if (!$('agent-dialog').open) $('agent-dialog').showModal();
}

function renderAgentProfile() {
  const agent = allAgents().find(item => item.id === selected);
  if (!agent) return;
  const { policy, percepts, peers, messages, current, location } = agentDetails(agent);
  const fields = rows => '<dl>' + rows.map(([name, value]) => '<dt>' + escape(name) + '</dt><dd>' + escape(value) + '</dd>').join('') + '</dl>';
  $('profile-title').textContent = agent.name + ' (' + agent.id + ')';
  const properties = [
    ['Situatedness', location + '. Current simulated time ' + timeAt(state.time) + '.'],
    ['Autonomy', 'Limited operational autonomy. Once triggered, this role applies its own configured decision rules. Goals and policies are supplied by the application or customer.'],
    ['Adaptivity', policy.adaptive + ' Learning-based policy updates are unimplemented.'],
    ['Sociability', messages.length + ' recorded messages. Communication partners include ' + (peers.join(', ') || 'no exchanges yet') + '.'],
    ['Rationality', 'Bounded, criterion-driven policy using currently modeled inputs and its configured task knowledge. Global optimality is unverified.'],
    ['Omniscience', 'Future manual orders and disruptions are unknown. Current simulation transitions follow known rules.']
  ];
  const peas = [
    ['Performance / evaluation criteria', policy.criteria],
    ['Environment', location + ', other agents, stock, workforce, resource calendars and simulation clock.'],
    ['Sensors / percepts', agent.sensors],
    ['Actuators', agent.actuators],
    ['Available actions', policy.actions.join('. ') + '.'],
    ['Task knowledge', policy.knowledge],
    ['Current observations', current]
  ];
  const environment = [
    ['Observability', 'Fully observable modeled state', 'The single-process controller holds exact current resource ledgers and calendars. Each role reads task-relevant fields.'],
    ['Outcomes', 'Deterministic', 'Given the same state and external actions, transitions repeat. Stochastic failures are unimplemented.'],
    ['Task dependence', 'Sequential', 'Reservations and earlier stages constrain later production and delivery decisions.'],
    ['Change over time', 'Dynamic during simulation', 'The clock and other agents change the world between decisions. A planning transaction uses a stable snapshot.'],
    ['State and time', 'Discrete', 'The engine uses integer hours, garment counts and finite actions. Smooth map motion interpolates snapshots for display.'],
    ['Transition knowledge', 'Known', 'Production durations, material use and journey rules are encoded in the simulator.'],
    ['Agent population', 'Multi-agent', 'Roles coordinate shared resources while order requests compete for capacity.']
  ];
  const history = percepts.length ? '<ol class="percept-history">' + percepts.map(percept => '<li><span>#' + percept.id + ' | ' + timeAt(percept.time) + ' | ' + escape(percept.sender) + '</span><strong>' + escape(percept.kind) + '</strong><p>' + escape(percept.content) + '</p></li>').join('') + '</ol>' : '<p>This agent has no recorded received inputs yet.</p>';
  $('agent-profile').innerHTML = '<div class="profile-summary"><span class="pill">' + escape(agent.role) + '</span><span class="pill">' + escape(policy.type) + '</span><p>' + escape(policy.reason) + '</p><p>' + escape(current) + '</p></div><div class="profile-grid"><section><h3>Agent properties</h3>' + fields(properties) + '</section><section><h3>PEAS and task knowledge</h3>' + fields(peas) + '</section><section><h3>Goals and internal model</h3>' + fields([['Desires / goal', agent.goal], ['Beliefs', agent.beliefs], ['Intentions', agent.intentions]]) + '</section><section><h3>Agent architecture guide</h3>' + fields([['Simple reflex', 'A current condition selects a fixed response.'], ['Model-based reflex', 'A stored model helps choose a condition-based response.'], ['Goal-based', 'Possible actions are evaluated for reaching a goal.'], ['Utility-based', 'A preference score ranks feasible alternatives.']]) + '</section><section class="profile-wide"><h3>Task environment classification</h3><div class="environment-grid">' + environment.map(([dimension, classification, reason]) => '<article><small>' + escape(dimension) + '</small><strong>' + escape(classification) + '</strong><p>' + escape(reason) + '</p></article>').join('') + '</div><p>Partially observable, stochastic, episodic, static and continuous environments are alternative classifications. The current simulator uses the values shown above.</p></section><section class="profile-wide"><h3>Percept sequence (' + percepts.length + ' recorded inputs)</h3><p>Chronological received messages and decision-time sensor observations, retained for this simulation run.</p>' + history + '</section></div>';
}
