let state;
let selected = 'Manager';
let filter = null;
let calendarDay = 0;
let replayIndex = 0;
let replayTimer;
let followLive = true;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = { Manager: 'M', Coordinator: 'C', HR: 'HR', Stores: 'S', Calendar: '31', Logistics: 'L', Monitor: '!', CUT: 'Cut', 'SEW-A': 'A', 'SEW-B': 'B', 'SEW-C': 'C', FIN: 'QC' };
const scenarios = [
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
function currentMessage() { return followLive ? state.messages.at(-1) : state.messages[replayIndex]; }

async function action(type, extra = {}) {
  try {
    const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Action failed');
    $('error').hidden = true;
    state = result;
    render();
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
    { id: 'Monitor', name: 'Network monitor', role: 'Monitoring agent', x: 67, y: 87, status: state.roadDelayed ? 'Road delay active' : 'Roads normal', goal: 'Report changes in the operating environment', beliefs: 'Station availability and road condition', intentions: 'Notify managers when future plans need revision', sensors: 'Disruption controls', actuators: 'Alerts that trigger replanning' }
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
  return [...core, ...stations, ...customers, ...trucks, ...orders];
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
}

function agentPosition(id) {
  if (id === 'Fleet') id = 'Logistics';
  const order = state.orders.find(o => o.id === id);
  if (order) id = 'CUSTOMER-' + order.destination;
  if (state.trucks.some(t => t.id === id)) return truckPosition(id);
  return allAgents().find(a => a.id === id) || { x: 34, y: 49 };
}

function truckPosition(id) {
  const base = { x: 67, y: id === 'TRUCK-1' ? 62 : 69 };
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
  $('map-message-position').textContent = followLive ? 'Live events' : 'Message ' + (replayIndex + 1) + ' / ' + state.messages.length;
  const agents = allAgents().filter(a => a.x !== undefined && !a.id.startsWith('ORD'));
  $('map-nodes').innerHTML = agents.map(agent => {
    const working = state.bookings.some(b => b.station === agent.id && b.start <= state.time && b.end > state.time);
    const paused = agent.available === false || (agent.required && !agent.assigned);
    const speaking = message && (message.sender === agent.id || message.receiver === agent.id);
    const icon = icons[agent.id] || 'C';
    return '<button class="map-node ' + (working ? 'working ' : '') + (paused ? 'paused ' : '') + (selected === agent.id ? 'selected ' : '') + (speaking ? 'speaking' : '') + '" style="left:' + agent.x + '%;top:' + agent.y + '%" data-agent="' + agent.id + '" aria-label="' + escape(agent.name + ', ' + agent.status) + '"><span class="node-icon">' + icon + '</span><strong>' + escape(agent.name) + '</strong><small>' + escape(working ? 'Working | ' + agent.status : agent.status) + '</small></button>';
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
    marker.className = 'truck-marker' + (!truck.available && !moving ? ' paused' : '');
    marker.style.left = position.x + '%';
    marker.style.top = position.y + '%';
    marker.textContent = truck.id.replace('TRUCK-', 'Truck ') + (moving ? ' | moving' : ' | depot');
    marker.setAttribute('aria-label', truck.name + (moving ? ' travelling' : ' at depot'));
  }
  $('road-state').textContent = state.roadDelayed ? 'Road delay: future travel x2' : 'Roads open';
  $('road-toggle').textContent = state.roadDelayed ? 'Restore road' : 'Disrupt road';
  $('live-message').innerHTML = message ? '<span class="tag">' + escape(message.type) + '</span><strong>' + escape(message.sender) + ' &rarr; ' + escape(message.receiver) + '</strong><p>' + escape(message.detail) + '</p>' : 'Waiting for agent messages';
  drawRoads(message);
}

function drawRoads(message) {
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
    [[13,23],[67,23]], [[13,49],[67,49]], [[13,75],[51,75]],
    [[23,23],[23,75]], [[42,23],[42,75]], [[59,23],[59,87]],
    [[67,62],[78,62]], [[67,69],[78,69]], [[78,20],[78,79]],
    ...state.locations.map(l => [[78,l.y],[l.x,l.y]])
  ];
  for (const points of roads) {
    road(points, '#cbd4c8', 17);
    road(points, '#f4f6ef', 12);
    road(points, '#b6c1b0', 1, [5, 7]);
  }
  if (state.roadDelayed) road([[78,35],[78,60]], '#d99255', 5, [5, 5]);
  if (message) {
    const from = agentPosition(message.sender);
    const to = agentPosition(message.receiver);
    road([[from.x,from.y],[to.x,to.y]], '#bd9443', 2, [5, 4]);
    ctx.setLineDash([]);
    ctx.fillStyle = '#bd9443';
    ctx.beginPath();
    ctx.arc(x(to.x), y(to.y), 5, 0, Math.PI * 2);
    ctx.fill();
  }
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
  $('inspector').innerHTML = '<div class="agent-kind">' + escape(agent.role) + '</div><h3>' + escape(agent.name) + '</h3><p>' + escape(agent.status) + '</p><div class="agent-actions">' + controls + '</div><dl><dt>Goal</dt><dd>' + escape(agent.goal) + '</dd><dt>Beliefs</dt><dd>' + escape(agent.beliefs) + '</dd><dt>Intentions</dt><dd>' + escape(agent.intentions) + '</dd><dt>Percepts / sensors</dt><dd>' + escape(agent.sensors) + '</dd><dt>Actions / actuators</dt><dd>' + escape(agent.actuators) + '</dd></dl>' + assignments + (related ? '<button data-conversation="' + related.id + '">View order messages</button>' : '') + (recent ? '<div class="latest-event"><strong>Latest decision</strong><p>' + escape(recent.detail) + '</p></div>' : '');
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
  $('event-position').textContent = followLive ? 'Following live messages' : 'Message ' + (replayIndex + 1) + ' / ' + state.messages.length;
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
  $('order-deadline').min = state.time + 1;
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
  if (button.dataset.agent) { selected = button.dataset.agent; renderMap(); renderInspector(); }
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
});
document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role=button]')) {
    event.preventDefault(); event.target.click();
  }
});
$('agent-select').onchange = event => { selected = event.target.value; renderMap(); renderInspector(); };
$('new-order').onclick = openOrder;
$('close-order').onclick = () => $('order-dialog').close();
$('order-form').onsubmit = async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const ok = await action('order', { order: { name: data.get('name'), customer: data.get('customer'), destination: data.get('destination'), quantity: Number(data.get('quantity')), priority: Number(data.get('priority')), deadline: Number(data.get('deadline')) } });
  if (ok) { event.target.reset(); $('order-dialog').close(); selected = state.orders.at(-1).id; setView('map'); }
  else { $('order-error').textContent = $('error').textContent; $('order-error').hidden = false; }
};
$('compare').onchange = renderCalendar;
$('calendar-prev').onclick = () => { calendarDay = Math.max(0, calendarDay - 1); renderCalendar(); };
$('calendar-next').onclick = () => { calendarDay++; renderCalendar(); };
$('calendar-now').onclick = () => { calendarDay = Math.floor((state.time + 8) / 24); renderCalendar(); };
$('clear-filter').onclick = () => { filter = null; renderMessages(); };
$('event-back').onclick = () => { stopReplay(); replayIndex = Math.max(0, (followLive ? state.messages.length - 1 : replayIndex) - 1); followLive = false; renderReplay(); };
$('event-next').onclick = () => { stopReplay(); followLive = false; replayIndex = Math.min(state.messages.length - 1, replayIndex + 1); renderReplay(); };
$('follow-live').onclick = () => { stopReplay(); followLive = true; renderReplay(); };
function toggleReplay() {
  if (replayTimer) { stopReplay(); return; }
  followLive = false; replayIndex = 0; renderReplay();
  $('replay').textContent = 'Pause replay';
  $('map-replay').textContent = 'Pause communication replay';
  replayTimer = setInterval(() => {
    if (replayIndex >= state.messages.length - 1) { stopReplay(); return; }
    replayIndex++; renderReplay();
  }, 1000);
}
$('replay').onclick = toggleReplay;
$('map-replay').onclick = toggleReplay;
$('map-live').onclick = () => { stopReplay(); followLive = true; renderReplay(); };
$('scenario-list').innerHTML = scenarios.map(([id, name, detail]) => '<button data-scenario="' + id + '"><strong>' + name + '</strong><small>' + detail + '</small></button>').join('');
window.addEventListener('resize', () => { if (state) drawRoads(currentMessage()); });
const events = new EventSource('/events');
events.onmessage = event => {
  state = JSON.parse(event.data);
  render();
  $('connection').textContent = 'Live connection';
};
events.onerror = () => { $('connection').textContent = 'Reconnecting'; };
