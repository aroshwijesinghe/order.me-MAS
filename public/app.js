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
  $('clock').textContent = `Hour ${String(state.time).padStart(2,'0')}`;
  $('status').textContent = state.running ? 'Production in progress' : 'Simulation paused';
  $('play').textContent = state.running ? 'Pause simulation' : 'Run simulation';
  const complete = state.orders.filter(o => end(o) <= state.time).length;
  const risk = state.orders.filter(o => end(o) === undefined || end(o) > o.deadline).length;
  const metrics = [['Active orders',state.orders.length-complete,'Across cutting, sewing & finishing'],['On-time plans',state.orders.length-risk,'Based on confirmed completion'],['Orders completed',complete,'All production stages finished'],['Stations available',`${state.stations.filter(s=>s.available).length} / 4`,'Capacity reported by station agents']];
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
  $('inspector').innerHTML = `<strong>${escape(selected)}</strong><p>${escape(description)}</p>${recent?`Latest event · ${escape(recent.detail)}`:''}`;
  $('filter-label').textContent = filter ? `Conversation for ${filter}` : 'All agent conversations';
  $('message-list').innerHTML = state.messages.filter(m=>!filter||m.orderId===filter).slice().reverse().map(m=>`<tr><td>#${m.id} · ${m.time}h</td><td>${escape(m.sender)} → ${escape(m.receiver)}</td><td><span class="message-type">${m.type}</span></td><td>${escape(m.detail)}</td></tr>`).join('');
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action],[data-station],[data-order],[data-agent]');
  if (!button) return;
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
