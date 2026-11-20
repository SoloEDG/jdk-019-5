import type { AnchorRef, Constraint, Shape } from "../../../shared/types";

/**
 * Geometric constraint solver.
 *
 * Strategy: weighted projection (Gauss-Seidel style relaxation) always
 * starting from the *current* geometry. Starting from the current state is
 * what keeps multi-solution systems on the same branch — points move to the
 * nearest satisfying configuration and never flip to the other side.
 *
 * `settle` mode additionally resolves conflicts: constraints that cannot be
 * satisfied (over-constrained systems, or constraints that would require
 * moving fixed/pinned geometry) are detected one by one and excluded, always
 * restoring the pre-solve snapshot before each retry, so the committed
 * geometry is the relaxation of the maximal satisfiable subset from the
 * last usable state.
 */

export interface SolveOptions {
  /** Shapes driven by the user right now: treated as immovable for this pass. */
  pinnedShapes?: ReadonlySet<string>;
  /** Individual points (keyOf) driven by the user right now. */
  pinnedKeys?: ReadonlySet<string>;
  /** Constraints known to be broken; excluded from preview passes and
   *  dropped first when settling. */
  previouslyBroken?: ReadonlySet<string>;
  /** Constraint that was just added/edited: prime suspect on conflict. */
  suspect?: string;
  maxIter: number;
  eps: number;
}

export interface SolveResult {
  /** Ids of constraints that could not be satisfied (settle mode). */
  broken: string[];
  /** Largest residual among the constraints that were solved. */
  residual: number;
  /** Constraints referencing missing shapes/nodes. */
  invalid: string[];
}

/** Residual above which a settled constraint counts as conflicting. */
export const CONFLICT_TOL = 1e-4;

export function keyOf(shape: string, node: number, part?: "in" | "out") {
  return part ? `${shape}:${node}:${part}` : `${shape}:${node}`;
}

interface Particle {
  o: { x: number; y: number };
  /** Inverse mass. 0 = immovable (fixed shape or user-driven point). */
  w: number;
}

interface Item {
  c: Constraint;
  a: Particle;
  b: Particle;
  c2?: Particle;
  d?: Particle;
  handles?: { ha: Particle[]; hb: Particle[] };
}

interface Ctx {
  items: Item[];
  invalid: string[];
  particles: Particle[];
  /** Anchor particles with their owning node, for handle follow-up. */
  anchors: { p: Particle; shape: Shape; node: number }[];
  /** Keys of points that are solver-controlled particles. */
  keys: Set<string>;
}

function refsOf(c: Constraint): AnchorRef[] {
  return c.kind === "equal" ? [c.a, c.b, c.c, c.d] : [c.a, c.b];
}

function build(
  shapes: Shape[],
  constraints: Constraint[],
  opts: SolveOptions,
): Ctx {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const parts = new Map<string, Particle>();
  const particles: Particle[] = [];
  const anchors: Ctx["anchors"] = [];
  const mass = (s: Shape, key: string) =>
    s.fixed || opts.pinnedShapes?.has(s.id) || opts.pinnedKeys?.has(key)
      ? 0
      : 1;
  const point = (s: Shape, node: number, part?: "in" | "out") => {
    const key = keyOf(s.id, node, part);
    let p = parts.get(key);
    if (!p) {
      const n = s.nodes[node];
      if (!n) return undefined;
      p = { o: part ? n[part] : n, w: mass(s, key) };
      parts.set(key, p);
      particles.push(p);
      if (!part) anchors.push({ p, shape: s, node });
    }
    return p;
  };
  const items: Item[] = [];
  const invalid: string[] = [];
  for (const c of constraints) {
    const anchors_: Particle[] = [];
    let ok = true;
    for (const ref of refsOf(c)) {
      const s = byId.get(ref.shape);
      const p = s && point(s, ref.node);
      if (!p) {
        ok = false;
        break;
      }
      anchors_.push(p);
    }
    if (ok && c.kind === "tangent") {
      const handles = { ha: [] as Particle[], hb: [] as Particle[] };
      const groups = [handles.ha, handles.hb];
      [c.a, c.b].forEach((ref, i) => {
        const s = byId.get(ref.shape)!;
        for (const part of ["in", "out"] as const) {
          const h = point(s, ref.node, part);
          if (h) groups[i].push(h);
        }
      });
      items.push({ c, a: anchors_[0], b: anchors_[1], handles });
    } else if (ok) {
      items.push({
        c,
        a: anchors_[0],
        b: anchors_[1],
        c2: anchors_[2],
        d: anchors_[3],
      });
    }
    if (!ok) invalid.push(c.id);
  }
  return { items, invalid, particles, anchors, keys: new Set(parts.keys()) };
}

/* ---- projections (mutate particles, weighted by inverse mass) ---- */

function projCoincident(a: Particle, b: Particle) {
  const w = a.w + b.w;
  if (!w) return;
  const dx = b.o.x - a.o.x,
    dy = b.o.y - a.o.y;
  a.o.x += (dx * a.w) / w;
  a.o.y += (dy * a.w) / w;
  b.o.x -= (dx * b.w) / w;
  b.o.y -= (dy * b.w) / w;
}

function projDistance(a: Particle, b: Particle, value: number) {
  const w = a.w + b.w;
  if (!w) return;
  let dx = b.o.x - a.o.x,
    dy = b.o.y - a.o.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const err = d - value;
  a.o.x += (dx * err * a.w) / w;
  a.o.y += (dy * err * a.w) / w;
  b.o.x -= (dx * err * b.w) / w;
  b.o.y -= (dy * err * b.w) / w;
}

function projEqual(a: Particle, b: Particle, c: Particle, d: Particle) {
  const w1 = a.w + b.w,
    w2 = c.w + d.w,
    w = w1 + w2;
  if (!w) return;
  const d1 = Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y);
  const d2 = Math.hypot(d.o.x - c.o.x, d.o.y - c.o.y);
  const err = d1 - d2;
  // Each pair absorbs correction proportional to its freedom.
  projDistance(a, b, d1 - (err * w1) / w);
  projDistance(c, d, d2 + (err * w2) / w);
}

/** Best-fit line direction through `p` for handle vectors, sign-normalized. */
function fitLine(
  p: { x: number; y: number },
  handles: Particle[],
): { ux: number; uy: number } | undefined {
  let ux = 0,
    uy = 0,
    rx = 0,
    ry = 0,
    first = true;
  for (const h of handles) {
    const vx = h.o.x - p.x,
      vy = h.o.y - p.y;
    const l = Math.hypot(vx, vy);
    if (l < 1e-9) continue; // collapsed handle: nothing to align
    if (first) {
      rx = vx / l;
      ry = vy / l;
      first = false;
    }
    // Flip each vector onto the reference side before averaging so that
    // opposite handles (in vs out) define one axis instead of cancelling.
    const s = vx * rx + vy * ry < 0 ? -1 : 1;
    ux += (s * vx) / l;
    uy += (s * vy) / l;
  }
  const ul = Math.hypot(ux, uy);
  if (ul < 1e-9) return undefined; // already opposed/collinear
  return { ux: ux / ul, uy: uy / ul };
}

function projTangent(
  a: Particle,
  b: Particle,
  handles: { ha: Particle[]; hb: Particle[] },
) {
  const ax = a.o.x,
    ay = a.o.y,
    bx = b.o.x,
    by = b.o.y;
  projCoincident(a, b);
  // Handles ride along with their anchor's translation so the curve
  // keeps its shape before alignment.
  for (const h of handles.ha) {
    h.o.x += a.o.x - ax;
    h.o.y += a.o.y - ay;
  }
  for (const h of handles.hb) {
    h.o.x += b.o.x - bx;
    h.o.y += b.o.y - by;
  }
  const all = [...handles.ha, ...handles.hb];
  const p = { x: (a.o.x + b.o.x) / 2, y: (a.o.y + b.o.y) / 2 };
  const u = fitLine(p, all);
  if (!u) return;
  for (const h of all) {
    if (!h.w) continue;
    const vx = h.o.x - p.x,
      vy = h.o.y - p.y;
    if (Math.hypot(vx, vy) < 1e-9) continue;
    // Nearest point on the line keeps the handle on its current side:
    // the solution branch never flips.
    const dot = vx * u.ux + vy * u.uy;
    h.o.x = p.x + u.ux * dot;
    h.o.y = p.y + u.uy * dot;
  }
}

function project(it: Item) {
  switch (it.c.kind) {
    case "coincident":
      projCoincident(it.a, it.b);
      break;
    case "distance":
      projDistance(it.a, it.b, it.c.value);
      break;
    case "equal":
      projEqual(it.a, it.b, it.c2!, it.d!);
      break;
    case "tangent":
      projTangent(it.a, it.b, it.handles!);
      break;
  }
}

/* ---- residuals (read-only) ---- */

function residualOf(it: Item): number {
  const { c, a, b } = it;
  switch (c.kind) {
    case "coincident":
      return Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y);
    case "distance":
      return Math.abs(Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y) - c.value);
    case "equal":
      return Math.abs(
        Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y) -
          Math.hypot(it.d!.o.x - it.c2!.o.x, it.d!.o.y - it.c2!.o.y),
      );
    case "tangent": {
      let r = Math.hypot(b.o.x - a.o.x, b.o.y - a.o.y);
      const all = [...it.handles!.ha, ...it.handles!.hb];
      const p = { x: (a.o.x + b.o.x) / 2, y: (a.o.y + b.o.y) / 2 };
      const u = fitLine(p, all);
      if (!u) return r;
      for (const h of all) {
        const vx = h.o.x - p.x,
          vy = h.o.y - p.y;
        if (Math.hypot(vx, vy) < 1e-9) continue;
        r += Math.abs(vx * u.uy - vy * u.ux); // perpendicular distance
      }
      return r;
    }
  }
}

interface RelaxResult {
  /** Largest pre-projection error seen in the final pass. */
  max: number;
  /** Per-item pre-projection error of the final pass. Order-independent,
   *  unlike a post-pass measurement where the last-projected constraint
   *  of an incompatible set looks satisfied. */
  seen: Map<Item, number>;
}

function relax(items: Item[], maxIter: number, eps: number): RelaxResult {
  const seen = new Map<Item, number>();
  let max = 0,
    prev = Infinity,
    stall = 0;
  for (let i = 0; i < maxIter; i++) {
    max = 0;
    for (const it of items) {
      const r = residualOf(it);
      seen.set(it, r);
      if (r > max) max = r;
      project(it);
    }
    if (max < eps) break;
    // Incompatible constraints oscillate forever; detect the stall.
    if (Math.abs(prev - max) < 1e-12 * Math.max(1, max)) {
      if (++stall > 10) break;
    } else stall = 0;
    prev = max;
  }
  return { max, seen };
}

export function solve(
  shapes: Shape[],
  constraints: Constraint[],
  opts: SolveOptions & { settle: boolean },
): SolveResult {
  const ctx = build(shapes, constraints, opts);
  // Handles that are not themselves solver variables ride along with
  // their anchor, so solved curves keep their shape (like a rigid move
  // in the node tool). Record entry positions up front.
  const entry = ctx.anchors.map((a) => ({ a, x: a.p.o.x, y: a.p.o.y }));
  const followHandles = () => {
    for (const { a, x, y } of entry) {
      const dx = a.p.o.x - x,
        dy = a.p.o.y - y;
      if (!dx && !dy) continue;
      const n = a.shape.nodes[a.node];
      for (const part of ["in", "out"] as const) {
        if (ctx.keys.has(keyOf(a.shape.id, a.node, part))) continue;
        n[part].x += dx;
        n[part].y += dy;
      }
    }
  };
  if (!opts.settle) {
    // Preview: best-effort relaxation of the healthy subset, in place.
    const items = ctx.items.filter(
      (it) => !opts.previouslyBroken?.has(it.c.id),
    );
    const { max } = relax(items, opts.maxIter, opts.eps);
    followHandles();
    return {
      broken: [...(opts.previouslyBroken ?? [])],
      residual: max,
      invalid: ctx.invalid,
    };
  }

  // Settle: find a maximal satisfiable subset. Every retry starts from the
  // entry snapshot, so the committed geometry is always the relaxation of
  // the satisfiable constraints from the last usable state.
  const snapshot = ctx.particles.map((p) => ({ p, x: p.o.x, y: p.o.y }));
  const restore = () => {
    for (const s of snapshot) {
      s.p.o.x = s.x;
      s.p.o.y = s.y;
    }
  };
  const order = new Map(constraints.map((c, i) => [c.id, i]));
  const active = new Map(ctx.items.map((it) => [it.c.id, it]));
  const broken: string[] = [];
  let residual = 0;
  for (let guard = 0; guard <= constraints.length; guard++) {
    restore();
    const { max, seen } = relax([...active.values()], opts.maxIter, opts.eps);
    residual = max;
    if (max <= CONFLICT_TOL) break;
    // Worst offender by pre-projection error, with priority: known-broken,
    // then the suspect (just added/edited), then the newest constraint.
    let worst: Item | undefined;
    let worstR = CONFLICT_TOL;
    let worstPrio = -1;
    for (const it of active.values()) {
      const r = seen.get(it) ?? 0;
      if (r <= CONFLICT_TOL) continue;
      const prio = opts.previouslyBroken?.has(it.c.id)
        ? 2
        : it.c.id === opts.suspect
          ? 1
          : 0;
      if (
        prio > worstPrio ||
        (prio === worstPrio &&
          (r > worstR ||
            (r === worstR && order.get(it.c.id)! > order.get(worst!.c.id)!)))
      ) {
        worst = it;
        worstR = r;
        worstPrio = prio;
      }
    }
    if (!worst) break;
    active.delete(worst.c.id);
    broken.push(worst.c.id);
  }
  followHandles();
  return { broken, residual, invalid: ctx.invalid };
}
