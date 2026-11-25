import test from 'node:test';
import assert from 'node:assert/strict';
import { routeMessage } from './routing.js';

function crosses(a,b,rect) {
  if(a.x===b.x) return a.x>rect.left && a.x<rect.right && Math.max(a.y,b.y)>rect.top && Math.min(a.y,b.y)<rect.bottom;
  return a.y>rect.top && a.y<rect.bottom && Math.max(a.x,b.x)>rect.left && Math.min(a.x,b.x)<rect.right;
}
function checkRoute(route, obstacles) {
  assert.ok(route.length>=2,'A visible route is required');
  for(let i=1;i<route.length;i++) {
    const a=route[i-1], b=route[i];
    assert.ok(a.x===b.x || a.y===b.y,'Every segment follows a clear horizontal or vertical corridor');
    for(const obstacle of obstacles) assert.ok(!crosses(a,b,obstacle),'Route crossed '+obstacle.id);
  }
}

test('message routes bend around intervening entities and popup bounds',()=>{
  const from={id:'customer',left:30,top:130,right:110,bottom:210};
  const to={id:'line',left:570,top:130,right:650,bottom:210};
  const middle={id:'warehouse',left:250,top:75,right:420,bottom:265};
  const popup={id:'popup',left:130,top:15,right:350,bottom:110};
  const obstacles=[from,to,middle,popup];
  const route=routeMessage(from,to,obstacles,700,360);
  checkRoute(route,obstacles);
  assert.ok(route.length>2);
});

test('routes remain clear in narrow corridors and near map boundaries',()=>{
  const from={id:'manager',left:20,top:20,right:110,bottom:100};
  const to={id:'truck',left:510,top:255,right:590,bottom:335};
  const obstacles=[from,to,
    {id:'production',left:165,top:0,right:310,bottom:235},
    {id:'stores',left:335,top:145,right:470,bottom:360}
  ];
  checkRoute(routeMessage(from,to,obstacles,620,380),obstacles);
});

test('blocked maps produce no crossing fallback and same-agent messages have no arrow',()=>{
  const from={id:'a',left:30,top:120,right:90,bottom:200};
  const to={id:'b',left:500,top:120,right:570,bottom:200};
  const wall={id:'wall',left:250,top:0,right:350,bottom:360};
  assert.deepEqual(routeMessage(from,to,[from,to,wall],620,360),[]);
  assert.deepEqual(routeMessage(from,from,[from],620,360),[]);
});
