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
