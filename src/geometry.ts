// Pure 2D geometry helpers (centimetres, x right, y down). No DOM.

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Segment { a: Point; b: Point }

export function distanceToSegment(p: Point, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const lengthSq = dx * dx + dy * dy;
  // Position of the closest point along the segment: 0 at a, 1 at b.
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}

export function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, { a: line[i], b: line[i + 1] }));
  }
  return best;
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Distance along the ray to the segment, or null if the ray misses it (or runs parallel to it).
export function rayToSegment(origin: Point, angle: number, s: Segment): number | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const ox = s.a.x - origin.x;
  const oy = s.a.y - origin.y;
  const t = (ox * ey - oy * ex) / denom; // along the ray
  const u = (ox * dy - oy * dx) / denom; // along the segment
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}

// Shortest distance between a (filled) polygon and a segment; 0 when they intersect.
export function polygonToSegment(poly: Point[], s: Segment): number {
  if (pointInPolygon(s.a, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, segmentToSegment({ a: poly[i], b: poly[(i + 1) % poly.length] }, s));
  }
  return best;
}

// Catmull-Rom spline through every point. End tangents use the duplicated end point.
export function smoothPath(points: Point[], samplesPerSegment: number): Point[] {
  const last = points.length - 1;
  const out: Point[] = [];
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, last)];
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = k / samplesPerSegment;
      out.push({ x: catmullRom(p0.x, p1.x, p2.x, p3.x, t), y: catmullRom(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  out.push({ ...points[last] });
  return out;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1
    + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
    + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}

// Ray casting: count how many polygon edges a horizontal ray from p crosses.
function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function segmentToSegment(s1: Segment, s2: Segment): number {
  if (crosses(s1, s2)) return 0;
  // Segments that do not cross are closest at one of the four endpoints (touching gives 0 here too).
  return Math.min(
    distanceToSegment(s1.a, s2), distanceToSegment(s1.b, s2),
    distanceToSegment(s2.a, s1), distanceToSegment(s2.b, s1));
}

// True when the segments cross at a point interior to both.
function crosses(s1: Segment, s2: Segment): boolean {
  return side(s2, s1.a) * side(s2, s1.b) < 0 && side(s1, s2.a) * side(s1, s2.b) < 0;
}

// Which side of the line through s the point p is on: positive, negative, or 0 when on the line.
function side(s: Segment, p: Point): number {
  return (s.b.x - s.a.x) * (p.y - s.a.y) - (s.b.y - s.a.y) * (p.x - s.a.x);
}
