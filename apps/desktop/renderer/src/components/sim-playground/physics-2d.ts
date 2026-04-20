/**
 * Lightweight 2D rigid-body physics in the XZ floor plane.
 * No external dependencies — runs entirely inside useFrame.
 * Supports: circles (robots, cones) and AABBs (maze walls, ring edge).
 */

// ─── Wall rectangle ───────────────────────────────────────────────────────────

export interface WallRect {
  x: number;
  z: number;
  w: number;   // full width along local X
  d: number;   // full depth along local Z
  rot?: number; // Y-axis rotation (radians)
}

// ─── Physics body ─────────────────────────────────────────────────────────────

export class PhysicsBody {
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  angle: number;    // heading, radians around Y
  angVel: number;   // rad/s
  mass: number;
  radius: number;
  restitution: number;
  linDamp: number;  // linear damping coefficient
  angDamp: number;  // angular damping coefficient
  isDynamic: boolean;
  sleeping: boolean;

  constructor(
    x: number,
    z: number,
    opts: Partial<{
      angle: number;
      mass: number;
      radius: number;
      restitution: number;
      linDamp: number;
      angDamp: number;
      isDynamic: boolean;
    }> = {},
  ) {
    this.pos = { x, z };
    this.vel = { x: 0, z: 0 };
    this.angle = opts.angle ?? 0;
    this.angVel = 0;
    this.mass = opts.mass ?? 1;
    this.radius = opts.radius ?? 0.12;
    this.restitution = opts.restitution ?? 0.28;
    this.linDamp = opts.linDamp ?? 2.5;
    this.angDamp = opts.angDamp ?? 3.5;
    this.isDynamic = opts.isDynamic ?? true;
    this.sleeping = false;
  }

  integrate(dt: number): void {
    if (!this.isDynamic || this.sleeping) return;
    const ldScale = Math.max(0, 1 - this.linDamp * dt);
    const adScale = Math.max(0, 1 - this.angDamp * dt);
    this.vel.x *= ldScale;
    this.vel.z *= ldScale;
    this.angVel *= adScale;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.angle += this.angVel * dt;
    const spd2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    if (spd2 < 0.000025 && this.angVel * this.angVel < 0.0004) {
      this.vel.x = 0; this.vel.z = 0; this.angVel = 0;
      this.sleeping = true;
    }
  }

  applyImpulse(ix: number, iz: number): void {
    if (!this.isDynamic) return;
    this.sleeping = false;
    this.vel.x += ix / this.mass;
    this.vel.z += iz / this.mass;
  }

  applyForce(fx: number, fz: number, dt: number): void {
    if (!this.isDynamic) return;
    this.sleeping = false;
    this.vel.x += (fx / this.mass) * dt;
    this.vel.z += (fz / this.mass) * dt;
  }

  applyTorque(t: number, dt: number): void {
    if (!this.isDynamic) return;
    this.sleeping = false;
    this.angVel += (t / this.mass) * dt;
  }

  /** Unit vector in the forward (heading) direction. */
  forwardDir(): { x: number; z: number } {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  /** Signed speed along the forward heading. */
  forwardSpeed(): number {
    const fd = this.forwardDir();
    return this.vel.x * fd.x + this.vel.z * fd.z;
  }

  wake(): void {
    this.sleeping = false;
  }
}

// ─── Circle-circle collision resolution ──────────────────────────────────────

/** Returns true when a collision was detected and resolved. */
export function resolveCircleCircle(a: PhysicsBody, b: PhysicsBody): boolean {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist2 = dx * dx + dz * dz;
  const minDist = a.radius + b.radius;
  if (dist2 >= minDist * minDist) return false;

  const dist = Math.sqrt(dist2);
  if (dist < 0.0001) return false;

  const nx = dx / dist;
  const nz = dz / dist;
  const pen = minDist - dist;
  const aMove = a.isDynamic;
  const bMove = b.isDynamic;

  // Positional correction — split proportionally to inverse mass
  const invA = aMove ? 1 / a.mass : 0;
  const invB = bMove ? 1 / b.mass : 0;
  const totalInv = invA + invB;
  if (totalInv > 0) {
    if (aMove) { a.pos.x -= nx * pen * (invA / totalInv); a.pos.z -= nz * pen * (invA / totalInv); }
    if (bMove) { b.pos.x += nx * pen * (invB / totalInv); b.pos.z += nz * pen * (invB / totalInv); }
  }

  // Impulse resolution
  const avx = aMove ? a.vel.x : 0;
  const avz = aMove ? a.vel.z : 0;
  const bvx = bMove ? b.vel.x : 0;
  const bvz = bMove ? b.vel.z : 0;
  const rvDotN = (avx - bvx) * nx + (avz - bvz) * nz;
  if (rvDotN > 0) return true; // already separating

  const e = Math.min(a.restitution, b.restitution);
  if (totalInv < 0.0001) return true;
  const j = -(1 + e) * rvDotN / totalInv;

  if (aMove) {
    a.vel.x -= j * invA * nx;
    a.vel.z -= j * invA * nz;
    a.sleeping = false;
  }
  if (bMove) {
    b.vel.x += j * invB * nx;
    b.vel.z += j * invB * nz;
    b.sleeping = false;
    // Random angular impulse — makes knocked objects spin realistically
    b.angVel += (j / b.mass) * 3.5 * (Math.random() - 0.5);
  }
  return true;
}

// ─── Circle-AABB collision resolution ────────────────────────────────────────

/** Resolves a dynamic circle against a static (fixed) axis-aligned box. */
export function resolveCircleAABB(circle: PhysicsBody, rect: WallRect): boolean {
  if (!circle.isDynamic) return false;

  // Transform into wall-local frame
  let cx = circle.pos.x - rect.x;
  let cz = circle.pos.z - rect.z;
  if (rect.rot) {
    const cosR = Math.cos(-rect.rot);
    const sinR = Math.sin(-rect.rot);
    const rx = cx * cosR - cz * sinR;
    cz = cx * sinR + cz * cosR;
    cx = rx;
  }

  const hw = rect.w * 0.5;
  const hd = rect.d * 0.5;
  const nearX = Math.max(-hw, Math.min(cx, hw));
  const nearZ = Math.max(-hd, Math.min(cz, hd));
  const dx = cx - nearX;
  const dz = cz - nearZ;
  const dist2 = dx * dx + dz * dz;
  if (dist2 >= circle.radius * circle.radius) return false;

  const dist = dist2 > 0.0001 ? Math.sqrt(dist2) : 0.0001;
  const pen = circle.radius - dist;
  let nx = dx / dist;
  let nz = dz / dist;

  // Back to world space
  if (rect.rot) {
    const cosR = Math.cos(rect.rot);
    const sinR = Math.sin(rect.rot);
    const wx = nx * cosR - nz * sinR;
    nz = nx * sinR + nz * cosR;
    nx = wx;
  }

  circle.pos.x += nx * pen;
  circle.pos.z += nz * pen;
  const vDotN = circle.vel.x * nx + circle.vel.z * nz;
  if (vDotN < 0) {
    circle.vel.x -= (1 + circle.restitution) * vDotN * nx;
    circle.vel.z -= (1 + circle.restitution) * vDotN * nz;
  }
  circle.sleeping = false;
  return true;
}

// ─── Sumo ring constraint ─────────────────────────────────────────────────────

/** Keeps a circle body inside a ring. Returns true if the body hit the boundary. */
export function constrainToRing(body: PhysicsBody, ringRadius: number, restitution = 0.35): boolean {
  const r = Math.hypot(body.pos.x, body.pos.z);
  const limit = ringRadius - body.radius;
  if (r <= limit) return false;
  if (r < 0.0001) return false;
  const nx = body.pos.x / r;
  const nz = body.pos.z / r;
  body.pos.x = nx * limit;
  body.pos.z = nz * limit;
  const vDotN = body.vel.x * nx + body.vel.z * nz;
  if (vDotN > 0) {
    body.vel.x -= (1 + restitution) * vDotN * nx;
    body.vel.z -= (1 + restitution) * vDotN * nz;
  }
  body.sleeping = false;
  return true;
}

// ─── Tank drive kinematics ────────────────────────────────────────────────────

/** Compute individual wheel speeds for differential-drive wheel spin animation. */
export function tankWheelSpeeds(
  fwdSpeed: number,
  angVel: number,
  halfWheelbase: number,
): { left: number; right: number } {
  return {
    left: fwdSpeed - angVel * halfWheelbase,
    right: fwdSpeed + angVel * halfWheelbase,
  };
}

// ─── Angle utilities ──────────────────────────────────────────────────────────

/** Shortest signed difference from current to target, in [-π, π]. */
export function angDiff(target: number, current: number): number {
  let d = ((target - current) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d;
}
