let replayIndex = 0, replayTimer;
let state, selected = 'Coordinator', filter = null;
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function action(type, extra = {}) {
  try {
    const response = await fetch('/api/action', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,...extra})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('error').hidden = true;
    state = result; render();
    return true;
  } catch(error) { $('error').textContent = error.message; $('error').hidden = false; return false; }
}
function end(order) { return state.bookings.find(b => b.orderId === order.id && b.stage === 'finishing')?.end; }
function render() {
  renderEvidence();
  renderNegotiation();
  $('clock').textContent = `Hour ${String(state.time).padStart(2,'0')}`;
  $('status').textContent = state.running ? 'Production in progress' : 'Simulation paused';
  $('play').textContent = state.running ? 'Pause simulation' : 'Run simulation';
  const complete = state.orders.filter(o => end(o) <= state.time).length;
  const risk = state.orders.filter(o => end(o) === undefined || end(o) > o.deadline).length;
  const metrics = [['Active orders',state.orders.length-complete,'Across cutting, sewing & finishing'],['On-time plans',state.orders.length-risk,'Based on confirmed completion'],['Orders completed',complete,'All production stages finished'],['Stations available',`${state.stations.filter(s=>s.available).length} / ${state.stations.length}`,'Capacity reported by station agents']];
  $('metrics').innerHTML = metrics.map(([label,value,hint])=>`<div class="metric"><small>${label}</small><strong>${value}</strong><span>${hint}</span></div>`).join('');
  const horizon = Math.max(30,state.time+2,...state.bookings.map(b=>b.end),...state.previous.map(b=>b.end));
  function block(b, previous=false) {
    const index = state.orders.findIndex(o=>o.id===b.orderId);
    return `<button class="booking o${index%4} ${previous?'previous':''}" style="left:${b.start/horizon*100}%;width:${(b.end-b.start)/horizon*100}%" data-order="${b.orderId}" title="${b.orderId} · ${b.stage} · ${b.start}–${b.end}">${previous?'':`${escape(b.orderId)} · ${b.start}–${b.end}`}</button>`;
  }
  $('gantt').innerHTML = `<div class="gantt-inner"><div class="ticks">${Array.from({length:6},(_,i)=>`<span>${Math.round(i*horizon/5)}h</span>`).join('')}</div>${state.stations.map(s=>`<div class="gantt-row"><div class="station-label">${s.name}<button data-station="${s.id}">${s.available?'Pause station':'Restore station'}</button></div><div class="track">${$('compare').checked?state.previous.filter(b=>b.station===s.id).map(b=>block(b,true)).join(''):''}${state.bookings.filter(b=>b.station===s.id).map(b=>block(b)).join('')}<div class="time-marker" style="left:${state.time/horizon*100}%"></div></div></div>`).join('')}</div>`;
  $('order-list').innerHTML = state.orders.map(o=>`<div class="order" data-order="${o.id}" role="button" tabindex="0"><div class="order-top"><h3>${escape(o.name)}</h3><span class="pill ${end(o)===undefined||end(o)>o.deadline?'late':''}">${end(o)===undefined?'Awaiting capacity':end(o)<=state.time?'Completed':end(o)>o.deadline?'At risk':'On track'}</span></div><small>${o.id} · ${o.quantity} garments · ${['','Normal','High','Urgent'][o.priority]} · Due ${o.deadline}h · Finish ${end(o)??'—'}h</small></div>`).join('');
  const agents = ['Coordinator','Monitor',...state.orders.map(o=>o.id),...state.stations.map(s=>s.id)];
  $('agent-list').innerHTML = agents.map(id=>`<button data-agent="${id}" class="${selected===id?'selected':''}">${id}</button>`).join('');
  const station = state.stations.find(s=>s.id===selected);
  const order = state.orders.find(o=>o.id===selected);
  let description = 'Resolves capacity claims by priority, deadline, then submission order. Commits complete routes without overlapping reservations.';
  if (station) description = `${station.available?'Available':'Paused for future bookings'} · ${station.rate} garments/hour · ${station.stage}. Offers the earliest free slot in its calendar.`;
  if (order) description = `Goal: complete ${order.quantity} garments by hour ${order.deadline}. Priority ${order.priority}. Compares complete route finish times across eligible stations.`;
  if (selected==='Monitor') description = 'Observes station availability. Alerts the coordinator to renegotiate future reservations when a station is paused or restored.';
  const recent = state.messages.filter(m=>m.sender===selected||m.receiver===selected).at(-1);
  $('inspector').innerHTML = `<strong>${escape(selected)}</strong><p>${escape(description)}</p><dl><dt>Beliefs</dt><dd>${escape(station ? 'Own capacity and reserved slots' : order ? 'Station offers and stage completion' : 'Current capacity and order priorities')}</dd><dt>Desires</dt><dd>${escape(station ? 'Process work within capacity' : order ? 'Finish before the deadline' : selected==='Monitor' ? 'Detect availability changes' : 'Allocate feasible production routes')}</dd><dt>Intentions</dt><dd>${escape(station ? 'Honor accepted reservations' : order ? 'Reserve the earliest complete route' : selected==='Monitor' ? 'Report station disruptions' : 'Commit routes in priority order')}</dd><dt>PEAS</dt><dd>Performance ? timely completion and feasible reservations. Environment ? orders and production stations. Actuators ? offers, reservations and alerts. Sensors ? messages, calendars and availability.</dd></dl>${recent?`Latest event · ${escape(recent.detail)}`:''}`;
  $('filter-label').textContent = filter ? `Conversation for ${filter}` : 'All agent conversations';
  $('message-list').innerHTML = state.messages.filter(m=>!filter||m.orderId===filter).slice().reverse().map(m=>`<tr><td>#${m.id} · ${m.time}h</td><td>${escape(m.sender)} → ${escape(m.receiver)}</td><td><span class="message-type">${m.type}</span></td><td>${escape(m.detail)}</td></tr>`).join('');
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-scenario],[data-action],[data-station],[data-order],[data-agent]');
  if (!button) return;
  if (button.dataset.scenario) { stopReplay(); replayIndex = 0; action('scenario',{name:button.dataset.scenario}); }
  if (button.dataset.action) action(button.dataset.action);
  if (button.dataset.station) action('station',{id:button.dataset.station});
  if (button.dataset.order) { selected = filter = button.dataset.order; render(); }
  if (button.dataset.agent) { selected = button.dataset.agent; render(); }
});
document.addEventListener('keydown', e=>{if ((e.key==='Enter'||e.key===' ')&&e.target.matches('.order')) {e.preventDefault();e.target.click();}});
$('compare').onchange = render;
$('clear-filter').onclick = ()=>{filter=null;render();};
$('new-order').onclick = ()=>{$('order-form').hidden=!$('order-form').hidden;};
$('order-form').onsubmit = async event=>{
  event.preventDefault();
  const data = new FormData(event.target);
  const ok = await action('order',{order:{name:data.get('name'),quantity:Number(data.get('quantity')),priority:Number(data.get('priority')),deadline:Number(data.get('deadline'))}});
  if(ok) {event.target.reset();event.target.hidden=true;}
};
const events = new EventSource('/events');
events.onmessage = event=>{state=JSON.parse(event.data);if(!state.orders.some(o=>o.id===selected)&&selected.startsWith('ORD'))selected='Coordinator';render();$('connection').textContent='● Live connection';};
events.onerror = ()=>{$('connection').textContent='Reconnecting…';};

function renderNegotiation() {
  replayIndex = Math.min(replayIndex, Math.max(0, state.messages.length - 1));
  const message = state.messages[replayIndex];
  const roles = [
    ['Order agents', 'Request capacity and choose the earliest complete route.'],
    ['Station agents', 'Offer available slots using production rates and reservations.'],
    ['Coordinator', 'Apply priority and deadlines, then commit the selected route.'],
    ['Monitor', 'Observe disruptions and trigger new negotiations.']
  ];
  $('agent-flow').innerHTML = roles.map(([name, description]) => '<article><strong>' + name + '</strong><p>' + description + '</p></article>').join('');
  $('event-position').textContent = state.messages.length ? 'Message ' + (replayIndex + 1) + ' of ' + state.messages.length : 'No messages';
  $('event-detail').innerHTML = message ? '<div class="exchange"><strong>' + escape(message.sender) + '</strong><span>&rarr; ' + escape(message.type) + ' ?</span><strong>' + escape(message.receiver) + '</strong></div><p>' + escape(message.detail) + '</p><small>Simulation hour ' + message.time + ' | Event ' + message.id + '</small><p>Protocol ' + escape(message.protocol || '') + ' | Conversation ' + escape(message.conversationId || '') + ' | Performative ' + escape(message.performative || '') + '</p>' : '';
  $('event-back').disabled = replayIndex === 0;
  $('event-next').disabled = replayIndex >= state.messages.length - 1;
}
function stopReplay() {
  clearInterval(replayTimer);
  replayTimer = undefined;
  $('replay').textContent = 'Replay negotiation';
}
$('event-back').onclick = () => { stopReplay(); replayIndex--; renderNegotiation(); };
$('event-next').onclick = () => { stopReplay(); replayIndex++; renderNegotiation(); };
$('replay').onclick = () => {
  if (replayTimer) { stopReplay(); return; }
  replayIndex = 0;
  renderNegotiation();
  $('replay').textContent = 'Pause replay';
  replayTimer = setInterval(() => {
    if (replayIndex >= state.messages.length - 1) { stopReplay(); return; }
    replayIndex++;
    renderNegotiation();
  }, 900);
};

function renderEvidence() {
  const messages = state.messages;
  const count = type => messages.filter(m => m.type === type).length;
  const changed = state.previous.filter(old => !state.bookings.some(b => b.orderId===old.orderId && b.stage===old.stage && b.station===old.station && b.start===old.start)).length;
  const evidence = [
    ['Communication', messages.length + ' recorded messages with sender, receiver and conversation ID.'],
    ['Negotiation', count('CFP') + ' capacity requests, ' + count('PROPOSE') + ' proposals and ' + count('ACCEPT') + ' accepted reservations.'],
    ['Coordination', count('CONFIRM') + ' route confirmations. Shared station calendars prevent overlapping reservations.'],
    ['Autonomy and utility', 'Order agents rank complete routes by earliest finish. Station agents calculate their own free slots.'],
    ['Adaptation', count('ALERT') + ' disruption alerts. ' + changed + ' previous operations changed or withdrawn during replanning.'],
    ['Resource failure recovery', state.stations.filter(s=>!s.available).length + ' stations paused. ' + state.orders.filter(o=>end(o)!==undefined).length + ' orders currently have complete routes.'],
    ['Loose coupling', state.stations.length + ' resource agents discovered by production stage. Use New agent joins to register another sewing agent.'],
    ['Shared ontology', 'All agents use garment-production-v1 with quantity, stage, station, start, end and deadline.']
  ];
  $('property-evidence').innerHTML = evidence.map(([name,detail]) => '<article><strong>'+escape(name)+'</strong><p>'+escape(detail)+'</p></article>').join('');
  $('noticeboard').innerHTML = state.noticeboard.map(item => '<article><strong>'+escape(item.agent)+'</strong><p>'+escape(item.stage)+' | '+item.rate+' garments/hour</p><p>'+(item.available?'Available':'Paused')+' | '+item.reservations+' reservations</p></article>').join('');
}
