export function truckDepot(id) {
  return { x: id === 'TRUCK-1' ? 65 : 74, y: 68 };
}

export function deliveryRoad(id, destination) {
  const depot = truckDepot(id);
  return [depot, { x: depot.x, y: 59 }, { x: 78, y: 59 }, { x: 78, y: destination.y }, { x: destination.x, y: destination.y }];
}

export function roadPaths(locations) {
  const depots = [truckDepot('TRUCK-1'), truckDepot('TRUCK-2')];
  const ys = [59, ...locations.map(point => point.y)];
  return [
    [[4,94],[4,40],[13,23]],
    [[13,23],[67,23]], [[13,49],[67,49]], [[13,75],[51,75]],
    [[23,23],[23,75]], [[42,23],[42,75]], [[59,23],[59,92]],
    [[67,49],[67,59]], [[65,59],[78,59]],
    ...depots.map(point => [[point.x,point.y],[point.x,59]]),
    [[78,Math.min(...ys)],[78,Math.max(...ys)]],
    ...locations.map(point => [[78,point.y],[point.x,point.y]])
  ];
}

function roadMeasurements(points, width, height) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = (points[i].x - points[i-1].x) * width / 100;
    const dy = (points[i].y - points[i-1].y) * height / 100;
    distances.push(distances.at(-1) + Math.hypot(dx,dy));
  }
  return distances;
}

function positionOnRoad(points, fraction, width, height) {
  const distances = roadMeasurements(points,width,height);
  const target = Math.max(0,Math.min(1,fraction)) * distances.at(-1);
  for (let i = 1; i < points.length; i++) {
    const length = distances[i] - distances[i-1];
    if (length > 0 && target <= distances[i]) {
      const progress = (target - distances[i-1]) / length;
      return {
        x: points[i-1].x + (points[i].x - points[i-1].x) * progress,
        y: points[i-1].y + (points[i].y - points[i-1].y) * progress
      };
    }
  }
  return points.at(-1);
}

export function truckPositionAt(id, deliveries, locations, time, width = 100, height = 100) {
  const delivery = deliveries.find(item => item.truck === id && item.start <= time && item.returnEnd > time);
  if (!delivery) return truckDepot(id);
  const destination = locations.find(location => location.id === delivery.destination);
  const elapsed = time - delivery.start;
  const leg = Math.floor(elapsed / delivery.travel);
  const progress = (elapsed % delivery.travel) / delivery.travel;
  return positionOnRoad(deliveryRoad(id,destination), leg % 2 ? 1-progress : progress, width, height);
}

// Every corner crossed during the interval is an animation keyframe.
export function truckMotionFrames(id, deliveries, locations, fromTime, toTime, width, height) {
  if (toTime <= fromTime) return [];
  const times = new Set([fromTime,toTime]);
  for (const delivery of deliveries.filter(item => item.truck === id && item.start < toTime && item.returnEnd > fromTime)) {
    const destination = locations.find(location => location.id === delivery.destination);
    const distances = roadMeasurements(deliveryRoad(id,destination),width,height);
    const total = distances.at(-1);
    for (let leg = 0; leg < delivery.trips * 2; leg++) {
      for (const distance of distances) {
        const fraction = distance / total;
        const time = delivery.start + (leg + (leg % 2 ? 1-fraction : fraction)) * delivery.travel;
        if (time > fromTime && time < toTime) times.add(time);
      }
    }
  }
  return [...times].sort((a,b) => a-b).map(time => {
    const point = truckPositionAt(id,deliveries,locations,time,width,height);
    return { left: point.x + '%', top: point.y + '%', offset: (time-fromTime)/(toTime-fromTime) };
  });
}
