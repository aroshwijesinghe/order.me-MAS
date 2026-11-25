export const LOCATIONS = [
  { id: 'school', name: 'Valley School', x: 89, y: 20, travel: 2 },
  { id: 'sports', name: 'Sports Retail', x: 89, y: 49, travel: 3 },
  { id: 'workwear', name: 'Workwear Outlet', x: 89, y: 79, travel: 2 }
];

export class Factory {
  constructor() { this.reset(); }

  reset() {
    this.epoch = (this.epoch || 0) + 1;
    this.time = 0;
    this.running = false;
    this.round = 0;
    this.sequence = 0;
    this.messages = [];
    this.percepts = [];
    this.perceptSequence = 0;
    this.previous = [];
    this.bookings = [];
    this.deliveries = [];
    this.dispatched = [];
    this.materialConsumed = [];
    this.visits = [];
    this.visitSequence = 0;
    this.stock = 650;
    this.workers = 10;
    this.roadDelayed = false;
    this.orders = [
      { id: 'ORD-101', name: 'School shirts', customer: 'Valley School', destination: 'school', quantity: 120, priority: 2, deadline: 18 },
      { id: 'ORD-102', name: 'Sports jerseys', customer: 'Sports Retail', destination: 'sports', quantity: 80, priority: 3, deadline: 14 },
      { id: 'ORD-103', name: 'Work trousers', customer: 'Workwear Outlet', destination: 'workwear', quantity: 100, priority: 1, deadline: 24 }
    ];
    this.stations = [
      { id: 'CUT', name: 'Cutting station', stage: 'cutting', rate: 60, required: 2, available: true, x: 34, y: 23 },
      { id: 'SEW-A', name: 'Sewing line A', stage: 'sewing', rate: 25, required: 3, available: true, x: 51, y: 23 },
      { id: 'SEW-B', name: 'Sewing line B', stage: 'sewing', rate: 20, required: 3, available: true, x: 51, y: 49 },
      { id: 'FIN', name: 'Finishing & quality', stage: 'finishing', rate: 50, required: 2, available: true, x: 67, y: 23 }
    ];
    this.trucks = [
      { id: 'TRUCK-1', name: 'Delivery truck 1', capacity: 150, available: true },
      { id: 'TRUCK-2', name: 'Delivery truck 2', capacity: 200, available: true }
    ];
    for (const order of this.orders) {
      this.visits.push({ id: 'VISIT-' + (++this.visitSequence), customer: order.customer, destination: order.destination,
        start: -2, arriveAt: 0, departAt: 1, end: 3, orderId: order.id, order: { ...order } });
      this.message('CUSTOMER-' + order.destination, 'Manager', 'REQUEST', 'Place ' + order.quantity + ' garment order due at hour ' + order.deadline, order.id);
    }
    this.plan();
  }

  observe(agent, kind, content, orderId, sender = 'Environment') {
    this.percepts.push({ id: ++this.perceptSequence, time: this.time, agent, kind, content, orderId, sender });
  }

  message(sender, receiver, type, detail, orderId) {
    this.observe(receiver, 'Received ' + type, detail, orderId, sender);
    this.messages.push({
      id: ++this.sequence, time: this.time, sender, receiver, type, detail, orderId,
      conversationId: orderId ? 'plan-' + this.round + '-' + orderId : 'environment-' + this.round,
      ontology: 'garment-network-v2', protocol: 'capacity-contract-net',
      performative: ({ ACCEPT: 'accept-proposal', CONFIRM: 'inform', ALERT: 'inform', WAIT: 'failure', REGISTER: 'inform', RESERVE: 'agree' })[type] || type.toLowerCase()
    });
  }

  slot(station, earliest, duration, bookings) {
    let start = earliest;
    for (const booking of bookings.filter(b => b.station === station.id).sort((a, b) => a.start - b.start)) {
      if (start + duration <= booking.start) break;
      if (start < booking.end) start = booking.end;
    }
    return { start, end: start + duration };
  }

  allocateWorkers() {
    // Reserve staff for operations already in progress before assigning future capacity.
    let remaining = this.workers;
    this.observe('HR', 'Attendance', this.workers + ' workers present; active operations retain their crews.');
    const active = this.stations.filter(s => this.isBusy(s.id));
    for (const station of active) remaining -= station.assigned;
    const idle = this.stations.filter(s => !this.isBusy(s.id));
    // Spread a minimum crew across stages before filling each station's target.
    for (const station of idle) {
      station.assigned = station.available && remaining > 0 ? 1 : 0;
      remaining -= station.assigned;
    }
    for (const station of idle.filter(s => s.available && s.assigned)) {
      const extra = Math.min(remaining, station.required - station.assigned);
      station.assigned += extra;
      remaining -= extra;
    }
    this.message('HR', 'Coordinator', 'INFORM', this.workers + ' workers present. ' + remaining + ' unassigned. Staffing limits determine production capacity.');
  }

  isBusy(id) {
    return this.bookings.some(b => b.station === id && b.start < this.time && b.end > this.time);
  }

  plan() {
    this.round++;
    this.bookings = this.bookings.filter(b => b.start < this.time);
    this.deliveries = this.deliveries.filter(d => d.start < this.time);
    this.allocateWorkers();
    this.observe('Coordinator', 'Production calendar', this.bookings.length + ' active or completed reservations retained; ' + this.orders.length + ' orders to consider.');
    const committedMaterials = new Set(this.bookings.filter(b => b.stage === 'cutting').map(b => b.orderId));
    let availableFabric = this.stock - this.orders.filter(o => committedMaterials.has(o.id) && !this.materialConsumed.includes(o.id)).reduce((sum, o) => sum + o.quantity, 0);
    const ordered = [...this.orders].sort((a, b) => b.priority - a.priority || a.deadline - b.deadline || a.id.localeCompare(b.id));
    for (const order of ordered) {
      if (this.deliveries.some(d => d.orderId === order.id)) continue;
      let routes = [{ bookings: [], end: this.time }];
      if (!committedMaterials.has(order.id)) {
        this.message(order.id, 'Stores', 'REQUEST', 'Request ' + order.quantity + ' metres of fabric', order.id);
        this.observe('Stores', 'Fabric ledger', this.stock + ' m physical stock; ' + availableFabric + ' m unreserved for this planning round.', order.id);
        if (order.quantity > availableFabric) {
          this.message('Stores', order.id, 'WAIT', 'Fabric shortage. Need ' + order.quantity + ' m, unreserved stock ' + availableFabric + ' m.', order.id);
          continue;
        }
      }
      for (const stage of ['cutting', 'sewing', 'finishing']) {
        const fixed = this.bookings.find(b => b.orderId === order.id && b.stage === stage);
        if (fixed) {
          routes = routes.map(route => ({ ...route, end: Math.max(route.end, fixed.end) }));
          continue;
        }
        const eligible = this.stations.filter(s => s.stage === stage);
        for (const station of eligible) this.message(order.id, station.id, 'CFP', 'Request ' + stage + ' capacity for ' + order.quantity + ' garments', order.id);
        const next = [];
        for (const route of routes) {
          for (const station of eligible) {
            this.observe(station.id, 'Station state', (station.available ? 'Available' : 'Paused') + '; ' + station.assigned + ' workers; target rate ' + station.rate + ' garments/hour.', order.id);
            if (!station.available || !station.assigned) {
              this.message(station.id, order.id, 'REFUSE', station.available ? 'No workers assigned by HR' : 'Station paused for future bookings', order.id);
              continue;
            }
            const effectiveRate = station.rate * station.assigned / station.required;
            const duration = Math.ceil(order.quantity / effectiveRate);
            const slot = this.slot(station, route.end, duration, [...this.bookings, ...route.bookings]);
            const booking = { ...slot, stage, orderId: order.id, station: station.id };
            this.message(station.id, order.id, 'PROPOSE', station.name + ' offers hours ' + slot.start + '-' + slot.end + ' with ' + station.assigned + ' workers', order.id);
            next.push({ bookings: [...route.bookings, booking], end: slot.end });
          }
        }
        routes = next;
      }
      routes.sort((a, b) => a.end - b.end);
      const best = routes[0];
      if (!best) {
        this.message('Coordinator', order.id, 'WAIT', 'No complete production route available. Restore staff or station capacity.', order.id);
        continue;
      }
      if (!committedMaterials.has(order.id)) {
        availableFabric -= order.quantity;
        this.message('Stores', order.id, 'RESERVE', 'Reserve ' + order.quantity + ' m fabric. Issued when cutting starts.', order.id);
      }
      this.bookings.push(...best.bookings);
      for (const booking of best.bookings) this.message(order.id, booking.station, 'ACCEPT', 'Reserve ' + booking.stage + ' at hours ' + booking.start + '-' + booking.end, order.id);
      this.message('Coordinator', 'Calendar', 'CONFIRM', order.id + ' production finishes at hour ' + best.end, order.id);
      this.planDelivery(order, best.end);
    }
  }

  planDelivery(order, readyAt) {
    for (const truck of this.trucks) this.message('Logistics', truck.id, 'CFP', 'Request delivery bid for ' + order.quantity + ' garments to ' + order.customer, order.id);
    const location = LOCATIONS.find(l => l.id === order.destination);
    const travel = location.travel * (this.roadDelayed ? 2 : 1);
    const bids = [];
    for (const truck of this.trucks) {
      this.observe(truck.id, 'Fleet state', 'Capacity ' + truck.capacity + '; one-way travel ' + travel + ' hours; ' + (truck.available ? 'available' : 'paused'), order.id);
      if (!truck.available) {
        this.message(truck.id, 'Logistics', 'REFUSE', 'Truck unavailable for new deliveries', order.id);
        continue;
      }
      const trips = Math.ceil(order.quantity / truck.capacity);
      const slot = this.slot(truck, Math.max(this.time, readyAt), travel * 2 * trips, this.deliveries.map(d => ({ station: d.truck, start: d.start, end: d.returnEnd })));
      const bid = { orderId: order.id, truck: truck.id, destination: order.destination, start: slot.start, end: slot.end - travel, returnEnd: slot.end, travel, trips };
      this.message(truck.id, 'Logistics', 'PROPOSE', trips + ' trip(s). Final arrival hour ' + bid.end + ', return hour ' + bid.returnEnd, order.id);
      bids.push(bid);
    }
    bids.sort((a, b) => a.end - b.end || a.trips - b.trips);
    const best = bids[0];
    if (!best) {
      this.message('Logistics', 'Manager', 'WAIT', 'Finished goods require a truck. Restore fleet availability.', order.id);
      return;
    }
    this.deliveries.push(best);
    this.message('Logistics', best.truck, 'ACCEPT', 'Dispatch at hour ' + best.start + ' to ' + order.customer, order.id);
    this.message('Calendar', 'CUSTOMER-' + order.destination, 'CONFIRM', 'Delivery booked at hour ' + best.end + '. ' + (best.end <= order.deadline ? 'Delivery deadline met.' : 'Delivery is ' + (best.end - order.deadline) + ' hours late.'), order.id);
  }

  replan() {
    this.previous = structuredClone(this.bookings);
    this.plan();
  }

  toggleStation(id) {
    const station = this.stations.find(s => s.id === id);
    if (!station) throw new Error('Unknown station');
    station.available = !station.available;
    this.observe('Monitor', 'Station availability', station.name + (station.available ? ' restored' : ' paused'));
    this.message('Monitor', 'Manager', 'ALERT', station.name + (station.available ? ' restored.' : ' paused. Active work finishes.'));
    this.replan();
  }

  toggleTruck(id) {
    const truck = this.trucks.find(t => t.id === id);
    if (!truck) throw new Error('Unknown truck');
    truck.available = !truck.available;
    this.message(truck.id, 'Logistics', 'ALERT', truck.available ? 'Ready for new deliveries' : 'Unavailable for new dispatches. Current trip completes.');
    this.replan();
  }

  setWorkers(count) {
    if (!Number.isInteger(count) || count < 0 || count > 40) throw new Error('Workers must be between 0 and 40');
    const activeRequired = this.stations.filter(s => this.isBusy(s.id)).reduce((sum, s) => sum + s.assigned, 0);
    if (count < activeRequired) throw new Error('Keep at least ' + activeRequired + ' workers until active operations finish');
    this.workers = count;
    this.message('HR', 'Manager', 'ALERT', count + ' workers available. Recalculate future production slots.');
    this.replan();
  }

  restock(quantity) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Restock quantity must be 1-10000 metres');
    this.stock += quantity;
    this.message('Stores', 'Manager', 'INFORM', 'Received ' + quantity + ' m fabric. Waiting orders may retry.');
    this.replan();
  }

  toggleRoad() {
    this.roadDelayed = !this.roadDelayed;
    this.observe('Monitor', 'Road condition', this.roadDelayed ? 'Travel delay active' : 'Normal travel');
    this.message('Monitor', 'Logistics', 'ALERT', this.roadDelayed ? 'Road disruption doubles travel time for future dispatches.' : 'Road restored to normal travel time.');
    this.replan();
  }

  validateOrder(input, earliestDeadline = this.time) {
    if (!input || typeof input !== 'object') throw new Error('Order details required');
    const { name, quantity, priority, deadline } = input;
    const destination = input.destination || 'school';
    const customer = input.customer || LOCATIONS.find(l => l.id === destination)?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 80 || typeof customer !== 'string' || !customer.trim() || customer.length > 80 || !LOCATIONS.some(l => l.id === destination) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || ![1, 2, 3].includes(priority) || !Number.isInteger(deadline) || deadline <= earliestDeadline || deadline > 1000) throw new Error('Enter a name, customer, destination, quantity 1-10000, priority 1-3 and future deadline up to hour 1000');
    return { name: name.trim(), customer: customer.trim(), destination, quantity, priority, deadline };
  }

  queueCustomer(input) {
    const arriveAt = Math.max(this.time + 2, ...this.visits.filter(v => !v.orderId).map(v => v.arriveAt + 1));
    const order = this.validateOrder(input);
    if (order.deadline <= arriveAt) throw new Error('Delivery deadline must be later than customer arrival at hour ' + arriveAt);
    const visit = { id: 'VISIT-' + (++this.visitSequence), customer: order.customer, destination: order.destination,
      start: arriveAt - 2, arriveAt, departAt: arriveAt + 1, end: arriveAt + 3, orderId: null, order };
    this.visits.push(visit);
    this.message('CUSTOMER-' + order.destination, 'Manager', 'INFORM', order.customer + ' is visiting reception. Order submission at hour ' + arriveAt + '.');
    return visit;
  }

  visitPhase(visit) {
    if (this.time < visit.start) return 'Waiting at gate';
    if (this.time < visit.arriveAt) return 'Arriving';
    if (this.time < visit.departAt) return 'Placing order';
    if (this.time < visit.end) return 'Leaving';
    return 'Left';
  }

  addOrder(input) {
    const order = { ...this.validateOrder(input), id: 'ORD-' + (101 + this.orders.length) };
    this.orders.push(order);
    this.message('CUSTOMER-' + order.destination, 'Manager', 'REQUEST', 'Place ' + order.quantity + ' garments for ' + order.customer + ', due hour ' + order.deadline, order.id);
    this.message('Manager', 'Coordinator', 'REQUEST', 'Approve order and negotiate materials, staff, production and delivery', order.id);
    this.replan();
    return order;
  }

  announceDispatches() {
    for (const delivery of this.deliveries.filter(d => d.start <= this.time && !this.dispatched.includes(d.orderId))) {
      this.dispatched.push(delivery.orderId);
      this.message('Stores', delivery.truck, 'INFORM', 'Load garments and dispatch to customer', delivery.orderId);
    }
  }

  step() {
    this.announceDispatches();
    for (const booking of this.bookings.filter(b => b.stage === 'cutting' && b.start <= this.time && !this.materialConsumed.includes(b.orderId))) {
      const order = this.orders.find(o => o.id === booking.orderId);
      this.stock -= order.quantity;
      this.materialConsumed.push(order.id);
      this.message('Stores', booking.station, 'INFORM', 'Issue ' + order.quantity + ' m fabric for cutting', order.id);
    }
    this.time++;
    for (const visit of this.visits) {
      if (!visit.orderId && visit.arriveAt <= this.time) {
        const order = this.addOrder(visit.order);
        visit.orderId = order.id;
      }
      if (visit.departAt === this.time) this.message('CUSTOMER-' + visit.destination, 'Manager', 'INFORM', visit.customer + ' leaves reception. Order remains with the factory.', visit.orderId);
    }
    for (const booking of this.bookings.filter(b => b.end === this.time)) {
      this.message(booking.station, booking.stage === 'finishing' ? 'Stores' : booking.orderId, 'INFORM', booking.stage + ' completed', booking.orderId);
    }
    this.announceDispatches();
    for (const delivery of this.deliveries) {
      if (delivery.end === this.time) this.message(delivery.truck, 'CUSTOMER-' + delivery.destination, 'INFORM', 'All garments delivered. Customer receipt confirmed.', delivery.orderId);
      if (delivery.returnEnd === this.time) this.message(delivery.truck, 'Logistics', 'INFORM', 'Returned to dispatch depot', delivery.orderId);
    }
    if (this.time >= Math.max(0, ...this.bookings.map(b => b.end), ...this.deliveries.map(d => d.returnEnd), ...this.visits.map(v => v.end))) this.running = false;
  }

  scenario(name) {
    if (!['visit', 'outage', 'scarcity', 'urgent', 'join', 'staff', 'fabric', 'truck', 'road'].includes(name)) throw new Error('Unknown scenario');
    this.reset();
    if (name === 'visit') this.queueCustomer({ name: 'Visitor uniform order', customer: 'New campus customer', quantity: 60, priority: 2, deadline: 30, destination: 'school' });
    if (name === 'outage') this.toggleStation('SEW-A');
    if (name === 'scarcity') { this.toggleStation('SEW-A'); this.toggleStation('SEW-B'); }
    if (name === 'urgent') this.addOrder({ name: 'Emergency uniform order', quantity: 160, priority: 3, deadline: 12 });
    if (name === 'staff') this.setWorkers(6);
    if (name === 'fabric') this.addOrder({ name: 'Large export batch', quantity: 800, priority: 1, deadline: 65, destination: 'workwear' });
    if (name === 'truck') { this.toggleTruck('TRUCK-1'); this.toggleTruck('TRUCK-2'); }
    if (name === 'road') this.toggleRoad();
    if (name === 'join') {
      this.stations.push({ id: 'SEW-C', name: 'Sewing line C', stage: 'sewing', rate: 35, required: 3, available: true, x: 51, y: 75 });
      this.workers = 13;
      this.message('SEW-C', 'Coordinator', 'REGISTER', 'New sewing agent joins with three workers');
      this.replan();
    }
  }

  orderStatus(order) {
    const delivery = this.deliveries.find(d => d.orderId === order.id);
    const jobs = this.bookings.filter(b => b.orderId === order.id);
    if (delivery && this.time >= delivery.end) return 'Delivered';
    if (delivery && this.time >= delivery.start) return 'In transit';
    if (jobs.some(b => b.stage === 'finishing' && b.end <= this.time)) return 'Ready for dispatch';
    const active = jobs.find(b => b.start <= this.time && b.end > this.time);
    if (active) return active.stage;
    return jobs.length ? 'Scheduled' : 'Waiting for resources';
  }

  state() {
    const reserved = this.orders.filter(o => !this.materialConsumed.includes(o.id) && this.bookings.some(b => b.orderId === o.id && b.stage === 'cutting')).reduce((sum, o) => sum + o.quantity, 0);
    return {
      percepts: this.percepts, epoch: this.epoch, round: this.round, time: this.time, running: this.running,
      orders: this.orders.map(o => ({ ...o, status: this.orderStatus(o) })),
      visits: this.visits.map(v => ({ ...v, phase: this.visitPhase(v) })),
      stations: this.stations, trucks: this.trucks, deliveries: this.deliveries,
      stock: this.stock, reserved, workers: this.workers, roadDelayed: this.roadDelayed,
      locations: LOCATIONS, bookings: this.bookings, previous: this.previous, messages: this.messages,
      noticeboard: this.stations.map(s => ({ agent: s.id, stage: s.stage, rate: s.rate, available: s.available, reservations: this.bookings.filter(b => b.station === s.id).length }))
    };
  }
}
