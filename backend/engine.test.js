import test from 'node:test';
import assert from 'node:assert/strict';
import { Factory } from './engine.js';

function checkSchedule(factory) {
  for (const station of factory.stations) {
    const jobs = factory.bookings.filter(b => b.station === station.id).sort((a,b) => a.start-b.start);
    for (let i=1; i<jobs.length; i++) assert.ok(jobs[i].start >= jobs[i-1].end, 'Reservations must not overlap');
  }
  for (const order of factory.orders) {
    const jobs = factory.bookings.filter(b => b.orderId === order.id).sort((a,b) => a.start-b.start);
    for (let i=1; i<jobs.length; i++) assert.ok(jobs[i].start >= jobs[i-1].end, 'Operations must respect dependencies');
  }
}

test('initial route reservations are feasible and deterministic', () => {
  const factory = new Factory();
  checkSchedule(factory);
  assert.equal(factory.bookings.length, 9);
  const initial = structuredClone(factory.bookings);
  factory.reset();
  assert.deepEqual(factory.bookings, initial);
});

test('disruption preserves active work and reassigns future sewing', () => {
  const factory = new Factory();
  factory.step();
  const active = structuredClone(factory.bookings.filter(b => b.start < factory.time));
  factory.toggleStation('SEW-A');
  checkSchedule(factory);
  for (const booking of active) assert.ok(factory.bookings.some(b => JSON.stringify(b)===JSON.stringify(booking)));
  assert.ok(factory.bookings.filter(b => b.stage==='sewing').every(b => b.station==='SEW-B'));
});

test('unavailable capacity waits and recovers without partial reservations', () => {
  const factory = new Factory();
  factory.toggleStation('SEW-A');
  factory.toggleStation('SEW-B');
  assert.equal(factory.bookings.length, 0);
  assert.ok(factory.messages.some(m => m.type==='WAIT'));
  factory.toggleStation('SEW-A');
  assert.equal(factory.bookings.length, 9);
  checkSchedule(factory);
});

test('new orders validate input and negotiate around completed production', () => {
  const factory = new Factory();
  assert.throws(() => factory.addOrder({name:'Bad',quantity:-1,priority:3,deadline:20}));
  assert.equal(factory.orders.length,3);
  for(let i=0;i<4;i++) factory.step();
  factory.addOrder({name:'Urgent batch',quantity:60,priority:3,deadline:8});
  checkSchedule(factory);
  assert.equal(factory.orders.length,4);
  assert.ok(factory.messages.some(m=>m.orderId==='ORD-104' && m.type==='CONFIRM'));
});

test('stores reserve and consume fabric exactly once across replans', () => {
  const factory = new Factory();
  assert.equal(factory.state().reserved, 300);
  factory.step();
  const afterIssue = factory.stock;
  assert.ok(afterIssue < 650);
  factory.toggleRoad();
  factory.restock(1);
  assert.equal(factory.stock, afterIssue + 1);
  while (factory.time < 40) factory.step();
  assert.equal(factory.stock, 351);
  assert.equal(factory.state().reserved, 0);
  assert.ok(factory.state().orders.every(o => o.status === 'Delivered'));
});

test('fabric shortages wait without partial commitments and recover after restocking', () => {
  const factory = new Factory();
  factory.scenario('fabric');
  assert.equal(factory.bookings.filter(b => b.orderId === 'ORD-104').length, 0);
  assert.ok(factory.messages.some(m => m.sender === 'Stores' && m.type === 'WAIT'));
  factory.restock(1000);
  assert.equal(factory.bookings.filter(b => b.orderId === 'ORD-104').length, 3);
  assert.ok(factory.stock >= factory.state().reserved);
  checkSchedule(factory);
});

test('HR reduces production rates and preserves staff on active operations', () => {
  const factory = new Factory();
  const initialEnd = Math.max(...factory.bookings.map(b => b.end));
  factory.setWorkers(6);
  assert.ok(factory.stations.every(s => s.assigned > 0));
  assert.equal(factory.stations.reduce((sum, s) => sum + s.assigned, 0), 6);
  assert.ok(Math.max(...factory.bookings.map(b => b.end)) > initialEnd);
  factory.step();
  const active = structuredClone(factory.bookings.filter(b => b.start < factory.time && b.end > factory.time));
  assert.throws(() => factory.setWorkers(0));
  factory.setWorkers(7);
  for (const job of active) assert.ok(factory.bookings.some(b => JSON.stringify(b) === JSON.stringify(job)));
  checkSchedule(factory);
});

test('trucks dispatch only after finishing and reserve all trips through return', () => {
  const factory = new Factory();
  factory.addOrder({name:'Large delivery',quantity:340,priority:1,deadline:80});
  for (const delivery of factory.deliveries) {
    const finish = factory.bookings.find(b => b.orderId === delivery.orderId && b.stage === 'finishing');
    const order = factory.orders.find(o => o.id === delivery.orderId);
    const truck = factory.trucks.find(t => t.id === delivery.truck);
    assert.ok(delivery.start >= finish.end);
    assert.equal(delivery.trips, Math.ceil(order.quantity / truck.capacity));
    assert.equal(delivery.returnEnd - delivery.start, delivery.trips * delivery.travel * 2);
  }
  for (const truck of factory.trucks) {
    const jobs = factory.deliveries.filter(d => d.truck === truck.id).sort((a,b) => a.start-b.start);
    for (let i=1; i<jobs.length; i++) assert.ok(jobs[i].start >= jobs[i-1].returnEnd);
  }
});

test('fleet shortage retains production and recovers delivery when a truck returns', () => {
  const factory = new Factory();
  factory.scenario('truck');
  assert.equal(factory.deliveries.length, 0);
  assert.equal(factory.bookings.length, 9);
  for (let i=0; i<25; i++) factory.step();
  assert.ok(factory.state().orders.every(o => o.status === 'Ready for dispatch'));
  factory.toggleTruck('TRUCK-1');
  assert.equal(factory.deliveries.length, 3);
  while (factory.time < 60) factory.step();
  assert.ok(factory.state().orders.every(o => o.status === 'Delivered'));
});

test('road disruptions preserve active trips and joining agents receive staffing', () => {
  const factory = new Factory();
  const departure = Math.min(...factory.deliveries.map(d => d.start));
  while (factory.time <= departure) factory.step();
  const active = structuredClone(factory.deliveries.find(d => d.start < factory.time && d.returnEnd > factory.time));
  factory.toggleRoad();
  assert.ok(factory.deliveries.some(d => JSON.stringify(d) === JSON.stringify(active)));
  assert.ok(factory.deliveries.filter(d => d.start >= factory.time).every(d => d.travel >= 4));
  factory.scenario('join');
  assert.equal(factory.stations.length, 5);
  assert.equal(factory.workers, 13);
  assert.equal(factory.stations.find(s => s.id === 'SEW-C').assigned, 3);
  assert.throws(() => factory.toggleTruck('unknown'));
  assert.throws(() => factory.restock(-1));
  assert.throws(() => factory.setWorkers(1.5));
});

test('customer visit submits once at arrival and leaves without removing the order', () => {
  const factory = new Factory();
  const visit = factory.queueCustomer({name:'Reception order',customer:'Campus visitor',quantity:40,priority:2,deadline:30});
  assert.equal(factory.orders.length,3);
  assert.equal(factory.visitPhase(visit),'Arriving');
  factory.step();
  assert.equal(factory.orders.length,3);
  factory.step();
  assert.equal(factory.orders.length,4);
  assert.equal(factory.visitPhase(visit),'Placing order');
  assert.equal(visit.orderId,'ORD-104');
  factory.step();
  assert.equal(factory.visitPhase(visit),'Leaving');
  factory.step();
  factory.step();
  assert.equal(factory.visitPhase(visit),'Left');
  assert.equal(factory.orders.length,4);
  assert.equal(factory.messages.filter(m=>m.type==='REQUEST' && m.receiver==='Manager' && m.orderId===visit.orderId).length,1);
  checkSchedule(factory);
});

test('queued visitors have distinct submission slots and invalid visits leave no partial state', () => {
  const factory = new Factory();
  const input = {name:'Visitor order',quantity:20,priority:1,deadline:20};
  const first = factory.queueCustomer(input);
  const second = factory.queueCustomer(input);
  assert.equal(second.arriveAt, first.arriveAt + 1);
  const count = factory.visits.length;
  assert.throws(() => factory.queueCustomer({...input,deadline:factory.time+1}));
  assert.equal(factory.visits.length,count);
  for(let i=0;i<6;i++)factory.step();
  assert.ok(first.orderId && second.orderId && first.orderId!==second.orderId);
  assert.equal(factory.orders.length,5);
});

test('percept histories record received messages and real resource observations in order', () => {
  const factory = new Factory();
  const before = factory.percepts.length;
  factory.toggleRoad();
  assert.ok(factory.percepts.length>before);
  assert.ok(factory.percepts.some(p=>p.agent==='Monitor' && p.kind==='Road condition'));
  assert.ok(factory.percepts.some(p=>p.agent==='HR' && p.kind==='Attendance'));
  for(const message of factory.messages) {
    assert.ok(factory.percepts.some(p=>p.agent===message.receiver && p.sender===message.sender && p.content===message.detail));
  }
  assert.ok(factory.percepts.every((percept,index)=>percept.id===index+1));
  factory.reset();
  assert.equal(factory.percepts[0].id,1);
});

test('customer messages cross the company boundary through their assigned manager', () => {
  const factory = new Factory();
  const begin = factory.messages.length;
  factory.message('CUSTOMER-school','CUT','REQUEST','Please review my order','ORD-101');
  const inbound = factory.messages.slice(begin);
  assert.deepEqual(inbound.map(message=>[message.sender,message.receiver]),[
    ['CUSTOMER-school','Manager'],['Manager','CUT']
  ]);
  assert.equal(inbound[1].relayOf,inbound[0].id);
  assert.equal(inbound[1].forwardedFrom,'CUSTOMER-school');
  assert.equal(inbound[0].conversationId,inbound[1].conversationId);
  const outgoingStart=factory.messages.length;
  factory.message('Stores','CUSTOMER-school','INFORM','Material confirmed','ORD-101');
  const outgoing=factory.messages.slice(outgoingStart);
  assert.deepEqual(outgoing.map(message=>[message.sender,message.receiver]),[
    ['Stores','Manager'],['Manager','CUSTOMER-school']
  ]);
  assert.equal(outgoing[1].relayOf,outgoing[0].id);
  assert.equal(outgoing[1].orderId,'ORD-101');
  assert.ok(factory.percepts.some(percept=>percept.agent==='CUSTOMER-school' && percept.sender==='Manager' && percept.content==='Material confirmed'));
});

test('all scenarios, visits and delivery receipts preserve manager-only customer contacts', () => {
  const factory=new Factory();
  for(const scenario of ['visit','outage','scarcity','urgent','join','staff','fabric','truck','road']) {
    factory.scenario(scenario);
    for(let hour=0;hour<45;hour++)factory.step();
    for(const message of factory.messages) {
      if(message.sender.startsWith('CUSTOMER-')) assert.equal(message.receiver,'Manager');
      if(message.receiver.startsWith('CUSTOMER-')) assert.equal(message.sender,'Manager');
      if(message.relayOf) {
        const original=factory.messages.find(item=>item.id===message.relayOf);
        assert.equal(original.receiver,'Manager');
        assert.equal(original.sender,message.forwardedFrom);
        assert.equal(original.orderId,message.orderId);
        assert.equal(original.conversationId,message.conversationId);
      }
    }
  }
  factory.reset();
  while(factory.time<35)factory.step();
  assert.ok(factory.messages.some(message=>message.sender==='Manager' && message.forwardedFrom==='Calendar' && message.receiver==='CUSTOMER-school'));
  assert.ok(factory.messages.some(message=>message.sender==='Manager' && message.forwardedFrom?.startsWith('TRUCK-') && message.receiver==='CUSTOMER-school'));
});

test('random customers arrive at varied hours with all priorities and customer locations', () => {
  const factory=new Factory();
  factory.setRandomTraffic(true,12345);
  const initialAt=factory.randomTraffic.nextAt;
  assert.ok(initialAt>=2 && initialAt<=6);
  while(factory.time<45) factory.step();
  const visits=factory.visits.filter(visit=>visit.source==='random');
  assert.ok(visits.length>=6);
  for(let i=1;i<visits.length;i++) {
    const gap=visits[i].start-visits[i-1].start;
    assert.ok(gap>=2 && gap<=6);
  }
  assert.deepEqual([...new Set(visits.slice(0,3).map(visit=>visit.order.priority))].sort(),[1,2,3]);
  assert.equal(new Set(visits.slice(0,3).map(visit=>visit.destination)).size,3);
  assert.ok(new Set(visits.map(visit=>visit.order.quantity)).size>1);
  assert.ok(visits.every(visit=>visit.order.quantity>=20 && visit.order.quantity<=80 && visit.order.deadline>visit.arriveAt));
  assert.ok(factory.orders.some(order=>order.source==='random'));
  for(const message of factory.messages) {
    if(message.sender.startsWith('CUSTOMER-'))assert.equal(message.receiver,'Manager');
    if(message.receiver.startsWith('CUSTOMER-'))assert.equal(message.sender,'Manager');
  }
  checkSchedule(factory);
});

test('seeded traffic repeats, stops generating when disabled and leaves queued visits intact', () => {
  const first=new Factory();
  const second=new Factory();
  first.setRandomTraffic(true,77);
  second.setRandomTraffic(true,77);
  for(let i=0;i<12;i++){first.step();second.step();}
  assert.deepEqual(first.visits,second.visits);
  const generated=first.randomTraffic.generated;
  first.setRandomTraffic(false);
  for(let i=0;i<8;i++)first.step();
  assert.equal(first.randomTraffic.generated,generated);
  assert.equal(first.randomTraffic.nextAt,null);
  assert.ok(first.visits.filter(visit=>visit.source==='random').every(visit=>visit.orderId));
  first.reset();
  assert.equal(first.randomTraffic.enabled,false);
  assert.equal(first.randomTraffic.generated,0);
  assert.throws(()=>first.setRandomTraffic('yes'));
});

test('new urgent requests receive future slots before normal requests and horizon stops traffic safely', () => {
  const factory=new Factory();
  const normal=factory.addOrder({name:'Normal new batch',quantity:20,priority:1,deadline:50});
  const urgent=factory.addOrder({name:'Urgent new batch',quantity:20,priority:3,deadline:50});
  const cut=id=>factory.bookings.find(booking=>booking.orderId===id && booking.stage==='cutting');
  assert.ok(cut(urgent.id).start<cut(normal.id).start);
  factory.setRandomTraffic(true,9);
  factory.time=960;
  factory.randomTraffic.nextAt=960;
  assert.doesNotThrow(()=>factory.step());
  assert.equal(factory.randomTraffic.enabled,false);
});

test('four manual quarter-hour steps preserve the hourly engine result', () => {
  const hourly=new Factory();
  const manual=new Factory();
  hourly.step();
  for(let i=0;i<4;i++)manual.step(.25);
  assert.equal(manual.time,1);
  assert.deepEqual(manual.bookings,hourly.bookings);
  assert.deepEqual(manual.messages,hourly.messages);
  assert.equal(manual.stock,hourly.stock);
  assert.throws(()=>manual.step(.1));
});

test('fractional-time production and deliveries complete when hourly and small steps are mixed', () => {
  const factory=new Factory();
  while(factory.time<40)factory.step();
  factory.step(.25);
  const order=factory.addOrder({name:'Quarter-hour batch',quantity:20,priority:3,deadline:70});
  const finish=factory.bookings.find(booking=>booking.orderId===order.id && booking.stage==='finishing');
  const delivery=factory.deliveries.find(delivery=>delivery.orderId===order.id);
  assert.equal(finish.end%1,.25);
  while(factory.time<delivery.end)factory.step();
  assert.equal(factory.state().orders.find(item=>item.id===order.id).status,'Delivered');
  assert.ok(factory.messages.some(message=>message.orderId===order.id && message.detail==='cutting completed'));
  assert.ok(factory.messages.some(message=>message.orderId===order.id && message.detail.includes('All garments delivered')));
  checkSchedule(factory);
});

test('random customer generation works when enabled on a quarter-hour boundary', () => {
  const factory=new Factory();
  factory.step(.25);
  factory.setRandomTraffic(true,123);
  for(let i=0;i<60;i++)factory.step(.25);
  assert.ok(factory.randomTraffic.generated>0);
  assert.ok(factory.visits.filter(visit=>visit.source==='random').every(visit=>Number.isInteger(visit.order.deadline)));
});
