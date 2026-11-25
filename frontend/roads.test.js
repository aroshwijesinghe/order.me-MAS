import test from 'node:test';
import assert from 'node:assert/strict';
import { roadPaths, deliveryRoad, truckDepot, truckPositionAt, truckMotionFrames } from './roads.js';
import { LOCATIONS } from '../backend/engine.js';

function onRoad(point) {
  return roadPaths(LOCATIONS).some(path => path.slice(1).some((end,index) => {
    const start = path[index];
    const cross = (point.x-start[0])*(end[1]-start[1]) - (point.y-start[1])*(end[0]-start[0]);
    return Math.abs(cross)<.00001 &&
      point.x>=Math.min(start[0],end[0])-.00001 && point.x<=Math.max(start[0],end[0])+.00001 &&
      point.y>=Math.min(start[1],end[1])-.00001 && point.y<=Math.max(start[1],end[1])+.00001;
  }));
}

test('both trucks remain on drawn roads throughout outbound, return and repeated trips', () => {
  for (const truck of ['TRUCK-1','TRUCK-2']) {
    for (const location of LOCATIONS) {
      const delivery = { truck, destination:location.id, start:4, travel:2, trips:3, returnEnd:16 };
      for (let time=0;time<=18;time+=.025) {
        const point = truckPositionAt(truck,[delivery],LOCATIONS,time,1400,850);
        assert.ok(onRoad(point),truck+' left road to '+location.id+' at '+time);
      }
      assert.deepEqual(truckPositionAt(truck,[delivery],LOCATIONS,16),truckDepot(truck));
      for (const vertex of deliveryRoad(truck,location)) assert.ok(onRoad(vertex));
    }
  }
});

test('animation keyframes include every bend so interpolated movement cannot cut corners', () => {
  const delivery = {truck:'TRUCK-2',destination:'school',start:2,travel:3,trips:2,returnEnd:14};
  for (const [from,to] of [[2,3],[3,4],[4,5],[5,6],[2,14],[6.4,9]]) {
    const frames=truckMotionFrames('TRUCK-2',[delivery],LOCATIONS,from,to,1400,850);
    assert.equal(frames[0].offset,0);
    assert.equal(frames.at(-1).offset,1);
    for(let i=1;i<frames.length;i++) {
      const a={x:parseFloat(frames[i-1].left),y:parseFloat(frames[i-1].top)};
      const b={x:parseFloat(frames[i].left),y:parseFloat(frames[i].top)};
      assert.ok(Math.abs(a.x-b.x)<.00001 || Math.abs(a.y-b.y)<.00001,'Animation cut diagonally across a junction');
      for(let step=0;step<=10;step++) assert.ok(onRoad({x:a.x+(b.x-a.x)*step/10,y:a.y+(b.y-a.y)*step/10}));
    }
  }
});

test('waiting and consecutive deliveries keep the same depot connection', () => {
  const deliveries=[
    {truck:'TRUCK-1',destination:'school',start:4,travel:2,trips:1,returnEnd:8},
    {truck:'TRUCK-1',destination:'sports',start:8,travel:3,trips:1,returnEnd:14}
  ];
  assert.deepEqual(truckPositionAt('TRUCK-1',deliveries,LOCATIONS,8),truckDepot('TRUCK-1'));
  const frames=truckMotionFrames('TRUCK-1',deliveries,LOCATIONS,0,16,1000,800);
  assert.ok(frames.some(frame=>Math.abs(frame.offset-.5)<.00001));
  assert.deepEqual(truckMotionFrames('TRUCK-1',deliveries,LOCATIONS,5,5,1000,800),[]);
});
