import type { CharacterJson, Point, PositionerOptions } from '../types';
import {
  subtract,
  distance,
  length,
  cosineSimilarity,
  equals,
  frechetDist,
  normalizeCurve,
  rotate,
} from '../geometry';

function average(arr: number[]) {
  const sum = arr.reduce((acc, val) => val + acc, 0);
  return sum / arr.length;
}

// All makemeahanzi characters have the same bounding box
const CHARACTER_BOUNDS = [
  { x: 0, y: -124 },
  { x: 1024, y: 900 },
];
const [from, to] = CHARACTER_BOUNDS;
const preScaledWidth = to.x - from.x;
const preScaledHeight = to.y - from.y;

export class Positioner {
  padding: number;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  scale: number;

  constructor(options: PositionerOptions) {
    const { padding, width, height } = options;
    this.padding = padding;
    this.width = width;
    this.height = height;

    const effectiveWidth = width - 2 * padding;
    const effectiveHeight = height - 2 * padding;
    const scaleX = effectiveWidth / preScaledWidth;
    const scaleY = effectiveHeight / preScaledHeight;

    this.scale = Math.min(scaleX, scaleY);

    const xCenteringBuffer =
      padding + (effectiveWidth - this.scale * preScaledWidth) / 2;
    const yCenteringBuffer =
      padding + (effectiveHeight - this.scale * preScaledHeight) / 2;

    this.xOffset = -1 * from.x * this.scale + xCenteringBuffer;
    this.yOffset = -1 * from.y * this.scale + yCenteringBuffer;
  }

  convertExternalPoint(point: Point) {
    const x = (point.x - this.xOffset) / this.scale;
    const y = (this.height - this.yOffset - point.y) / this.scale;
    return { x, y };
  }
}

export class UserStroke {
  id: number;
  points: Point[];
  externalPoints: Point[];

  constructor(id: number, startingPoint: Point, startingExternalPoint: Point) {
    this.id = id;
    this.points = [startingPoint];
    this.externalPoints = [startingExternalPoint];
  }

  appendPoint(point: Point, externalPoint: Point) {
    this.points.push(point);
    this.externalPoints.push(externalPoint);
  }
}

export class Stroke {
  path: string;
  points: Point[];
  strokeNum: number;
  isInRadical: boolean;

  constructor(
    path: string,
    points: Point[],
    strokeNum: number,
    isInRadical = false
  ) {
    this.path = path;
    this.points = points;
    this.strokeNum = strokeNum;
    this.isInRadical = isInRadical;
  }

  getStartingPoint() {
    return this.points[0];
  }

  getEndingPoint() {
    return this.points[this.points.length - 1];
  }

  getLength(): number {
    return length(this.points);
  }

  getVectors() {
    let lastPoint = this.points[0];
    const pointsSansFirst = this.points.slice(1);
    return pointsSansFirst.map((point) => {
      const vector = subtract(point, lastPoint);
      lastPoint = point;
      return vector;
    });
  }

  getDistance(point: Point) {
    const distances = this.points.map((strokePoint) =>
      distance(strokePoint, point)
    );
    return Math.min(...distances);
  }

  getAverageDistance(points: Point[]) {
    const totalDist = points.reduce(
      (acc, point) => acc + this.getDistance(point),
      0
    );
    return totalDist / points.length;
  }
}

function generateStrokes({ radStrokes, strokes, medians }: CharacterJson) {
  const isInRadical = (strokeNum: number) =>
    (radStrokes?.indexOf(strokeNum) ?? -1) >= 0;
  return strokes.map((path, index) => {
    const points = medians[index].map((pointData) => {
      const [x, y] = pointData;
      return { x, y };
    });
    return new Stroke(path, points, index, isInRadical(index));
  });
}

export class Character {
  symbol: string;
  strokes: Stroke[];

  constructor(symbol: string, strokes: Stroke[]) {
    this.symbol = symbol;
    this.strokes = strokes;
  }
}

export function parseCharData(symbol: string, charJson: CharacterJson) {
  const strokes = generateStrokes(charJson);
  return new Character(symbol, strokes);
}

const AVG_DIST_THRESHOLD = 350; // bigger = more lenient
const COSINE_SIMILARITY_THRESHOLD = 0; // -1 to 1, smaller = more lenient
const START_AND_END_DIST_THRESHOLD = 250; // bigger = more lenient
const FRECHET_THRESHOLD = 0.4; // bigger = more lenient
const MIN_LEN_THRESHOLD = 0.35; // smaller = more lenient

export interface StrokeMatchResultMeta {
  isStrokeBackwards: boolean;
}

export interface StrokeMatchResult {
  isMatch: boolean;
  meta: StrokeMatchResultMeta;
}

export function strokeMatches(
  userStroke: UserStroke,
  character: Character,
  strokeNum: number,
  options: {
    leniency?: number;
    isOutlineVisible?: boolean;
  } = {}
): StrokeMatchResult {
  const strokes = character.strokes;
  const points = stripDuplicates(userStroke.points);

  if (points.length < 2) {
    return { isMatch: false, meta: { isStrokeBackwards: false } };
  }

  const {
    isMatch: isMatchOne,
    meta,
    avgDist: avgDistOne,
  } = getMatchData(points, strokes[strokeNum], options);

  if (!isMatchOne) {
    return { isMatch: isMatchOne, meta };
  }

  // if there is a better match among strokes the user hasn't drawn yet, the user probably drew the wrong stroke
  const laterStrokes = strokes.slice(strokeNum + 1);
  let closestMatchDist = avgDistOne;

  for (let i = 0; i < laterStrokes.length; i++) {
    const { isMatch: isMatchTwo, avgDist: avgDistTwo } = getMatchData(
      points,
      laterStrokes[i],
      { ...options, checkBackwards: false }
    );
    if (isMatchTwo && avgDistTwo < closestMatchDist) {
      closestMatchDist = avgDistTwo;
    }
  }
  // if there's a better match, rather that returning false automatically, try reducing leniency instead
  // if leniency is already really high we can allow some similar strokes to pass
  if (closestMatchDist < avgDistOne) {
    // adjust leniency between 0.3 and 0.6 depending on how much of a better match the new match is
    const leniencyAdjustment =
      (0.6 * (closestMatchDist + avgDistOne)) / (2 * avgDistOne);
    const { isMatch: isMatchThree, meta } = getMatchData(
      points,
      strokes[strokeNum],
      {
        ...options,
        leniency: (options.leniency || 1) * leniencyAdjustment,
      }
    );
    return { isMatch: isMatchThree, meta };
  }
  return { isMatch: isMatchOne, meta };
}

const startAndEndMatches = (
  points: Point[],
  closestStroke: Stroke,
  leniency: number
) => {
  const startingDist = distance(closestStroke.getStartingPoint(), points[0]);
  const endingDist = distance(
    closestStroke.getEndingPoint(),
    points[points.length - 1]
  );
  return (
    startingDist <= START_AND_END_DIST_THRESHOLD * leniency &&
    endingDist <= START_AND_END_DIST_THRESHOLD * leniency
  );
};

// returns a list of the direction of all segments in the line connecting the points
const getEdgeVectors = (points: Point[]) => {
  const vectors: Point[] = [];
  let lastPoint = points[0];
  points.slice(1).forEach((point) => {
    vectors.push(subtract(point, lastPoint));
    lastPoint = point;
  });
  return vectors;
};

const directionMatches = (points: Point[], stroke: Stroke) => {
  const edgeVectors = getEdgeVectors(points);
  const strokeVectors = stroke.getVectors();
  const similarities = edgeVectors.map((edgeVector) => {
    const strokeSimilarities = strokeVectors.map((strokeVector) =>
      cosineSimilarity(strokeVector, edgeVector)
    );
    return Math.max(...strokeSimilarities);
  });
  const avgSimilarity = average(similarities);
  return avgSimilarity > COSINE_SIMILARITY_THRESHOLD;
};

const lengthMatches = (points: Point[], stroke: Stroke, leniency: number) => {
  return (
    (leniency * (length(points) + 25)) / (stroke.getLength() + 25) >=
    MIN_LEN_THRESHOLD
  );
};

const stripDuplicates = (points: Point[]) => {
  if (points.length < 2) {
    return points;
  }
  const [firstPoint, ...rest] = points;
  const dedupedPoints = [firstPoint];

  for (const point of rest) {
    if (!equals(point, dedupedPoints[dedupedPoints.length - 1])) {
      dedupedPoints.push(point);
    }
  }

  return dedupedPoints;
};

const SHAPE_FIT_ROTATIONS = [
  Math.PI / 16,
  Math.PI / 32,
  0,
  (-1 * Math.PI) / 32,
  (-1 * Math.PI) / 16,
];

const shapeFit = (curve1: Point[], curve2: Point[], leniency: number) => {
  const normCurve1 = normalizeCurve(curve1);
  const normCurve2 = normalizeCurve(curve2);
  let minDist = Infinity;
  SHAPE_FIT_ROTATIONS.forEach((theta) => {
    const dist = frechetDist(normCurve1, rotate(normCurve2, theta));
    if (dist < minDist) {
      minDist = dist;
    }
  });
  return minDist <= FRECHET_THRESHOLD * leniency;
};

const getMatchData = (
  points: Point[],
  stroke: Stroke,
  options: {
    leniency?: number;
    isOutlineVisible?: boolean;
    checkBackwards?: boolean;
  }
): StrokeMatchResult & { avgDist: number } => {
  const {
    leniency = 1,
    isOutlineVisible = false,
    checkBackwards = true,
  } = options;
  const avgDist = stroke.getAverageDistance(points);
  const distMod = isOutlineVisible || stroke.strokeNum > 0 ? 0.5 : 1;
  const withinDistThresh = avgDist <= AVG_DIST_THRESHOLD * distMod * leniency;
  // short circuit for faster matching
  if (!withinDistThresh) {
    return { isMatch: false, avgDist, meta: { isStrokeBackwards: false } };
  }
  const startAndEndMatch = startAndEndMatches(points, stroke, leniency);
  const directionMatch = directionMatches(points, stroke);
  const shapeMatch = shapeFit(points, stroke.points, leniency);
  const lengthMatch = lengthMatches(points, stroke, leniency);
  const isMatch =
    withinDistThresh &&
    startAndEndMatch &&
    directionMatch &&
    shapeMatch &&
    lengthMatch;

  if (checkBackwards && !isMatch) {
    const backwardsMatchData = getMatchData([...points].reverse(), stroke, {
      ...options,
      checkBackwards: false,
    });

    if (backwardsMatchData.isMatch) {
      return {
        isMatch,
        avgDist,
        meta: { isStrokeBackwards: true },
      };
    }
  }

  return { isMatch, avgDist, meta: { isStrokeBackwards: false } };
};
