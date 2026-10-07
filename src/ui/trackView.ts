// The track seen from above, in centimetres scaled to fit the canvas. The mat is drawn from the geometry the
// sensors read (tracks/surface.ts), once per track and canvas size, into an offscreen canvas; each frame copies
// it and draws the barrier, the distance beams and the robot over it. Colours are fixed: the mat stays light
// in both themes.
import type { Point, Segment } from '../geometry';
import { ROBOT, slotDirection, slotPoint } from '../robot/robot';
import type { Pose } from '../robot/robot';
import { DISTANCE_MAX } from '../sim/sensors';
import type { Reading } from '../sim/sensors';
import type { World } from '../sim/world';
import type { ColorName } from '../tracks/surface';
import { MAT } from '../tracks/tracks';
import type { Track } from '../tracks/tracks';

const MAT_COLOR: Record<ColorName, string> = { white: '#fafaf7', black: '#161616', red: '#e5484d', green: '#22c55e' };
const MAT_EDGE = '#c9ced6';
const START_BOX = '#8b94a3';
const INK = '#1d2330';
const BARRIER = '#dc2626';
const ROBOT_BODY = '#cbd5e1';
const ROBOT_EDGE = '#475569';
const ROBOT_WHEEL = '#334155';
const SENSOR_IDLE = '#ffffff';
const SENSOR_LIT = '#f59e0b'; // a line sensor that sees the line
const SENSOR_DISTANCE = '#3b82f6';
const BEAM = 'rgb(59 130 246 / 0.75)';
const SENSOR_R = 1.2; // cm

export class TrackView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly mat = document.createElement('canvas'); // offscreen, the same size as the canvas
  private track: Track | null = null;
  private last: { world: World; readings: Reading[] } | null = null;
  private scale = 0; // pixels per centimetre; 0 while the canvas has no size (its screen is hidden)
  private left = 0;  // where the mat's corner is on the canvas, in pixels
  private top = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  setTrack(track: Track): void {
    this.track = track;
    this.drawMat();
  }

  render(world: World, readings: Reading[]): void {
    this.last = { world, readings };
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.scale === 0) return;
    ctx.drawImage(this.mat, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.left, this.top);
    if (world.track.barrier) drawBarrier(ctx, world.track.barrier, world.barrierOpen);
    for (const r of readings) if (r.type === 'distance') drawBeam(ctx, world.pose, r);
    drawRobot(ctx, world.pose);
    for (const r of readings) drawSensor(ctx, world.pose, r);
  }

  private resize(): void {
    const width = Math.round(this.canvas.clientWidth * devicePixelRatio);
    const height = Math.round(this.canvas.clientHeight * devicePixelRatio);
    this.canvas.width = this.mat.width = width;
    this.canvas.height = this.mat.height = height;
    this.scale = Math.min(width / MAT.width, height / MAT.height);
    this.left = (width - MAT.width * this.scale) / 2;
    this.top = (height - MAT.height * this.scale) / 2;
    this.drawMat();
    if (this.last) this.render(this.last.world, this.last.readings);
  }

  private drawMat(): void {
    const ctx = this.mat.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.mat.width, this.mat.height);
    const track = this.track;
    if (!track || this.scale === 0) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.left, this.top);
    ctx.fillStyle = MAT_COLOR.white;
    ctx.fillRect(0, 0, MAT.width, MAT.height);
    // The line is every point within half its width of the centre line, so its joins and ends are round.
    ctx.beginPath();
    for (const p of track.line) ctx.lineTo(p.x, p.y);
    ctx.lineWidth = MAT.lineWidth;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = MAT_COLOR.black;
    ctx.stroke();
    // The zones are painted over the line.
    ctx.fillStyle = MAT_COLOR.red;
    if (track.redSquare) ctx.fillRect(track.redSquare.x, track.redSquare.y, track.redSquare.w, track.redSquare.h);
    ctx.fillStyle = MAT_COLOR.green;
    ctx.fillRect(track.finish.x, track.finish.y, track.finish.w, track.finish.h);
    ctx.setLineDash([1.5, 1]);
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = START_BOX;
    ctx.strokeRect(track.startBox.x, track.startBox.y, track.startBox.w, track.startBox.h);
    ctx.setLineDash([]);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = MAT_EDGE;
    ctx.strokeRect(0, 0, MAT.width, MAT.height);
  }
}

// Red and white stripes while closed; faded once it has lifted.
function drawBarrier(ctx: CanvasRenderingContext2D, b: Segment, open: boolean): void {
  ctx.save();
  ctx.globalAlpha = open ? 0.25 : 1;
  ctx.lineCap = 'butt';
  line(ctx, b.a, b.b, 2.2, INK);
  line(ctx, b.a, b.b, 1.6, '#ffffff');
  ctx.setLineDash([2.5, 2.5]);
  line(ctx, b.a, b.b, 1.6, BARRIER);
  ctx.restore();
  circle(ctx, b.a, 1.3, INK);
  circle(ctx, b.b, 1.3, INK);
}

// From the sensor to what it sees, or as far as it can see.
function drawBeam(ctx: CanvasRenderingContext2D, pose: Pose, r: Reading): void {
  const from = slotPoint(pose, r.slot);
  const angle = slotDirection(pose, r.slot);
  const length = r.distance!;
  const to = { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
  ctx.save();
  ctx.setLineDash([2, 1.2]);
  line(ctx, from, to, 0.6, BEAM);
  ctx.restore();
  if (length < DISTANCE_MAX) circle(ctx, to, 0.9, SENSOR_DISTANCE);
}

function drawRobot(ctx: CanvasRenderingContext2D, pose: Pose): void {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading); // x now points forward and y to the robot's right
  ctx.beginPath();
  ctx.roundRect(-ROBOT.length / 2, -ROBOT.width / 2, ROBOT.length, ROBOT.width, 2);
  ctx.fillStyle = ROBOT_BODY;
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = ROBOT_EDGE;
  ctx.stroke();
  ctx.fillStyle = ROBOT_WHEEL;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(-2.8, side * ROBOT.wheelBase / 2 - 1.2, 5.6, 2.4, 0.7);
    ctx.fill();
  }
  ctx.restore();
}

// A line sensor lights up on the line; a colour sensor shows any colour but white.
function drawSensor(ctx: CanvasRenderingContext2D, pose: Pose, r: Reading): void {
  let fill = SENSOR_DISTANCE;
  if (r.type === 'line') fill = r.line ? SENSOR_LIT : SENSOR_IDLE;
  if (r.type === 'color') fill = r.color === 'white' ? SENSOR_IDLE : MAT_COLOR[r.color!];
  circle(ctx, slotPoint(pose, r.slot), SENSOR_R, fill, INK);
}

function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, width: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, p: Point, r: number, fill: string, edge?: string): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  if (!edge) return;
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = edge;
  ctx.stroke();
}
