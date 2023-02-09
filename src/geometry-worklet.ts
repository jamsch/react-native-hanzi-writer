import type { Point } from './types';

const round = (point: Point, precision = 1) => {
  'worklet';
  const multiplier = precision * 10;
  return {
    x: Math.round(multiplier * point.x) / multiplier,
    y: Math.round(multiplier * point.y) / multiplier,
  };
};

export function getPathString(points: Point[], close = false) {
  'worklet';
  if (points.length === 0) {
    return '';
  }
  const start = round(points[0]);
  const remainingPoints = points.slice(1);
  let pathString = `M ${start.x} ${start.y}`;
  remainingPoints.forEach((point) => {
    const roundedPoint = round(point);
    pathString += ` L ${roundedPoint.x} ${roundedPoint.y}`;
  });
  if (close) {
    pathString += 'Z';
  }
  return pathString;
}
