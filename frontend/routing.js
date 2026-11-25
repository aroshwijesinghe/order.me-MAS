function contains(rect, point) {
  return point.x > rect.left + .01 && point.x < rect.right - .01 &&
    point.y > rect.top + .01 && point.y < rect.bottom - .01;
}

function segmentClear(a, b, obstacles) {
  return !obstacles.some(rect => {
    if (a.x === b.x) {
      return a.x > rect.left + .01 && a.x < rect.right - .01 &&
        Math.max(a.y, b.y) > rect.top + .01 && Math.min(a.y, b.y) < rect.bottom - .01;
    }
    return a.y > rect.top + .01 && a.y < rect.bottom - .01 &&
      Math.max(a.x, b.x) > rect.left + .01 && Math.min(a.x, b.x) < rect.right - .01;
  });
}

function ports(rect, padding) {
  const x = (rect.left + rect.right) / 2;
  const y = (rect.top + rect.bottom) / 2;
  return [
    { x: rect.left - padding, y, tip: { x: rect.left - 4, y } },
    { x: rect.right + padding, y, tip: { x: rect.right + 4, y } },
    { x, y: rect.top - padding, tip: { x, y: rect.top - 4 } },
    { x, y: rect.bottom + padding, tip: { x, y: rect.bottom + 4 } }
  ];
}

// Route through free horizontal/vertical corridors between padded entity bounds.
export function routeMessage(from, to, entities, width, height) {
  if (from.id === to.id) return [];
  const padding = 12;
  const obstacles = entities.map(rect => ({
    id: rect.id, left: rect.left - padding, right: rect.right + padding,
    top: rect.top - padding, bottom: rect.bottom + padding
  }));
  const insideMap = point => point.x >= 6 && point.x <= width - 6 && point.y >= 6 && point.y <= height - 6;
  const free = point => insideMap(point) && !obstacles.some(rect => contains(rect, point));
  const availablePorts = rect => ports(rect, padding).filter(port =>
    free(port) && segmentClear(port.tip, port, obstacles.filter(obstacle => obstacle.id !== rect.id)));
  const starts = availablePorts(from);
  const goals = availablePorts(to);
  if (!starts.length || !goals.length) return [];

  const allPorts = [...starts, ...goals];
  const xs = [...new Set([6, width - 6, ...obstacles.flatMap(rect => [rect.left, rect.right]), ...allPorts.map(point => point.x)])]
    .filter(x => x >= 6 && x <= width - 6).sort((a,b) => a-b);
  const ys = [...new Set([6, height - 6, ...obstacles.flatMap(rect => [rect.top, rect.bottom]), ...allPorts.map(point => point.y)])]
    .filter(y => y >= 6 && y <= height - 6).sort((a,b) => a-b);
  const pointAt = index => ({ x: xs[index % xs.length], y: ys[Math.floor(index / xs.length)] });
  const indexOf = point => ys.indexOf(point.y) * xs.length + xs.indexOf(point.x);
  const goalIndexes = new Set(goals.map(indexOf));
  const heuristic = point => Math.min(...goals.map(goal => Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y)));
  const best = new Map();
  const open = starts.map(port => ({ index: indexOf(port), axis: -1, cost: 0, estimate: heuristic(port), previous: null, start: port }));
  const freeCache = new Map();
  while (open.length) {
    let next = 0;
    for (let i = 1; i < open.length; i++) if (open[i].estimate < open[next].estimate) next = i;
    const current = open.splice(next, 1)[0];
    const key = current.index + ':' + current.axis;
    if (best.has(key) && best.get(key) <= current.cost) continue;
    best.set(key, current.cost);
    const point = pointAt(current.index);
    if (goalIndexes.has(current.index)) {
      const goal = goals.find(item => indexOf(item) === current.index);
      const result = [goal.tip];
      let step = current;
      while (step) { result.push(pointAt(step.index)); step = step.previous; }
      result.push(current.start.tip);
      result.reverse();
      // Remove collinear grid intersections while preserving bends and arrow direction.
      return result.filter((point, index) => {
        if (!index || index === result.length - 1) return true;
        const before = result[index - 1];
        const after = result[index + 1];
        return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y));
      });
    }
    const column = current.index % xs.length;
    const row = Math.floor(current.index / xs.length);
    const neighbors = [];
    if (column > 0) neighbors.push([current.index - 1, 0]);
    if (column < xs.length - 1) neighbors.push([current.index + 1, 0]);
    if (row > 0) neighbors.push([current.index - xs.length, 1]);
    if (row < ys.length - 1) neighbors.push([current.index + xs.length, 1]);
    for (const [index, axis] of neighbors) {
      const destination = pointAt(index);
      if (!freeCache.has(index)) freeCache.set(index, free(destination));
      if (!freeCache.get(index) || !segmentClear(point, destination, obstacles)) continue;
      const turnCost = current.axis !== -1 && current.axis !== axis ? 18 : 0;
      const cost = current.cost + Math.abs(point.x - destination.x) + Math.abs(point.y - destination.y) + turnCost;
      if (best.has(index + ':' + axis) && best.get(index + ':' + axis) <= cost) continue;
      open.push({ index, axis, cost, estimate: cost + heuristic(destination), previous: current, start: current.start });
    }
  }
  return [];
}
