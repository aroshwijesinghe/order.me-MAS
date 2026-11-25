export class Factory {
  constructor() { this.reset(); }
  reset() {
    this.time = 0;
    this.running = false;
    this.orders = [
      { id: 'ORD-101', name: 'School shirts', quantity: 120, priority: 2, deadline: 18 },
      { id: 'ORD-102', name: 'Sports jerseys', quantity: 80, priority: 3, deadline: 14 },
      { id: 'ORD-103', name: 'Work trousers', quantity: 100, priority: 1, deadline: 24 }
    ];
    this.stations = [
      { id: 'CUT', name: 'Cutting station', stage: 'cutting', rate: 60, available: true },
      { id: 'SEW-A', name: 'Sewing line A', stage: 'sewing', rate: 25, available: true },
      { id: 'SEW-B', name: 'Sewing line B', stage: 'sewing', rate: 20, available: true },
      { id: 'FIN', name: 'Finishing station', stage: 'finishing', rate: 50, available: true }
    ];
    this.bookings = [];
    this.messages = [];
    this.previous = [];
    this.sequence = 0;
    this.round = 0;
    this.plan();
  }
  message(sender, receiver, type, detail, orderId) {
    const conversationId = orderId ? `plan-${this.round}-${orderId}` : `environment-${this.round}`;
    this.messages.push({ id: ++this.sequence, time: this.time, sender, receiver, type, detail, orderId,
      conversationId, ontology: 'garment-production-v1', protocol: 'capacity-contract-net',
      performative: ({ACCEPT:'accept-proposal', CONFIRM:'inform', ALERT:'inform', WAIT:'failure'})[type] || type.toLowerCase() });
  }
  slot(station, earliest, duration, bookings) {
    let start = earliest;
    for (const booking of bookings.filter(b => b.station === station.id).sort((a,b) => a.start-b.start)) {
      if (start + duration <= booking.start) break;
      if (start < booking.end) start = booking.end;
    }
    return { start, end: start + duration };
  }
  plan() {
    this.round++;
    // Synchronous coordinator commits each complete route atomically.
    // Preserve completed and in-progress work when rescheduling future operations.
    this.bookings = this.bookings.filter(b => b.start < this.time);
    const ordered = [...this.orders].sort((a,b) => b.priority-a.priority || a.deadline-b.deadline || a.id.localeCompare(b.id));
    for (const order of ordered) {
      let routes = [{ bookings: [], end: this.time }];
      for (const stage of ['cutting','sewing','finishing']) {
        const fixed = this.bookings.find(b => b.orderId === order.id && b.stage === stage);
        if (fixed) {
          routes = routes.map(route => ({ ...route, end: Math.max(route.end, fixed.end) }));
          continue;
        }
        this.message(order.id, stage, 'CFP', `Request ${stage} capacity for ${order.quantity} garments`, order.id);
        const next = [];
        for (const route of routes) {
          for (const station of this.stations.filter(s => s.stage === stage)) {
            if (!station.available) {
              this.message(station.id, order.id, 'REFUSE', 'Station paused for future bookings', order.id);
              continue;
            }
            const duration = Math.ceil(order.quantity / station.rate);
            const slot = this.slot(station, route.end, duration, [...this.bookings, ...route.bookings]);
            const booking = { ...slot, stage, orderId: order.id, station: station.id };
            this.message(station.id, order.id, 'PROPOSE', `${station.name}: hour ${slot.start}–${slot.end}`, order.id);
            next.push({ bookings: [...route.bookings, booking], end: slot.end });
          }
        }
        routes = next;
      }
      routes.sort((a,b) => a.end-b.end);
      const best = routes[0];
      if (!best) {
        this.message('Coordinator', order.id, 'WAIT', 'No complete production route available', order.id);
        continue;
      }
      this.bookings.push(...best.bookings);
      for (const booking of best.bookings) {
        this.message(order.id, booking.station, 'ACCEPT', `Reserve ${booking.stage} at hour ${booking.start}–${booking.end}`, order.id);
      }
      this.message('Coordinator', order.id, 'CONFIRM', `Earliest complete route finishes at hour ${best.end}. ${best.end <= order.deadline ? 'Deadline met' : `${best.end-order.deadline} hours late`}. Priority ${order.priority} applied before deadline and submission order.`, order.id);
    }
  }
  toggleStation(id) {
    const station = this.stations.find(s => s.id === id);
    if (!station) throw new Error('Unknown station');
    this.previous = structuredClone(this.bookings);
    station.available = !station.available;
    this.message('Monitor', 'Coordinator', 'ALERT', `${station.name} ${station.available ? 'restored' : 'paused'}. Active work completes, future work is renegotiated.`);
    this.plan();
  }
  addOrder(input) {
    const {name, quantity, priority, deadline} = input;
    if (typeof name !== 'string' || !name.trim() || name.length > 80 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || ![1,2,3].includes(priority) || !Number.isInteger(deadline) || deadline <= this.time || deadline > 1000) throw new Error('Enter a name, quantity 1–10000, priority 1–3, and a future deadline up to hour 1000');
    this.previous = structuredClone(this.bookings);
    this.orders.push({id:`ORD-${101+this.orders.length}`, name:name.trim(), quantity, priority, deadline});
    this.plan();
  }
  step() {
    this.time++;
    for (const booking of this.bookings.filter(b => b.end === this.time)) this.message(booking.station, booking.orderId, 'INFORM', `${booking.stage} completed`, booking.orderId);
    if (this.time >= Math.max(0, ...this.bookings.map(b => b.end))) this.running = false;
  }
  scenario(name) {
    if (!['outage','scarcity','urgent','join'].includes(name)) throw new Error('Unknown scenario');
    this.reset();
    if (name === 'outage') this.toggleStation('SEW-A');
    if (name === 'scarcity') { this.toggleStation('SEW-A'); this.toggleStation('SEW-B'); }
    if (name === 'urgent') this.addOrder({name:'Emergency uniform order', quantity:160, priority:3, deadline:12});
    if (name === 'join') {
      this.previous = structuredClone(this.bookings);
      this.stations.push({id:'SEW-C',name:'Sewing line C',stage:'sewing',rate:35,available:true});
      this.message('SEW-C','Coordinator','REGISTER','New sewing agent advertises 35 garments/hour');
      this.plan();
    }
  }
  state() { return {round:this.round, noticeboard:this.stations.map(s => ({agent:s.id,stage:s.stage,rate:s.rate,available:s.available,reservations:this.bookings.filter(b=>b.station===s.id).length})), time:this.time, running:this.running, orders:this.orders, stations:this.stations, bookings:this.bookings, previous:this.previous, messages:this.messages}; }
}
