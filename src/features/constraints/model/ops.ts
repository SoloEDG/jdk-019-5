import { beginEdit } from "../../drawing";
import { doc } from "../../../shared/document";
import type { AnchorRef, Constraint } from "../../../shared/types";
import { broken, clearPicks, picks, solveCommit, status } from "./state";

/** Normalize so equivalent constraints compare equal regardless of order. */
function signature(c: Constraint): string {
  const key = (r: AnchorRef) => `${r.shape}#${r.node}`;
  const pair = (a: AnchorRef, b: AnchorRef) =>
    [key(a), key(b)].sort().join("|");
  switch (c.kind) {
    case "coincident":
    case "tangent":
    case "distance":
      return `${c.kind}:${pair(c.a, c.b)}`;
    case "equal":
      return `equal:${[pair(c.a, c.b), pair(c.c, c.d)].sort().join("=")}`;
  }
}

function anchorsValid(refs: AnchorRef[]) {
  return refs.every(
    (r) =>
      doc.shapes.some((s) => s.id === r.shape) &&
      r.node < (doc.shapes.find((s) => s.id === r.shape)?.nodes.length ?? 0),
  );
}

/**
 * Add a constraint and settle. If it over-constrains the system the solver
 * flags it as broken and geometry keeps the last usable result — the
 * constraint stays in the list, visibly in conflict, until the user edits
 * or deletes it.
 */
export function addConstraint(kind: Constraint["kind"]) {
  const refs = picks.value;
  const need = kind === "equal" ? 4 : 2;
  if (refs.length !== need || !anchorsValid(refs)) return;
  if (new Set(refs.map((r) => `${r.shape}#${r.node}`)).size !== refs.length)
    return; // refs must be distinct
  const base = { id: crypto.randomUUID() };
  const c: Constraint =
    kind === "equal"
      ? { ...base, kind, a: refs[0], b: refs[1], c: refs[2], d: refs[3] }
      : kind === "distance"
        ? {
            ...base,
            kind,
            a: refs[0],
            b: refs[1],
            value: measuredDistance(refs[0], refs[1]) ?? 0,
          }
        : { ...base, kind, a: refs[0], b: refs[1] };
  if (doc.constraints.some((x) => signature(x) === signature(c))) return;
  beginEdit();
  doc.constraints.push(c);
  solveCommit({ suspect: c.id });
  clearPicks();
}

/**
 * Remove a constraint. Geometry deliberately stays where it is — no solve
 * is triggered, the drawing keeps its current positions. Only stale
 * conflict flags are cleaned up.
 */
export function removeConstraint(id: string) {
  beginEdit();
  doc.constraints = doc.constraints.filter((c) => c.id !== id);
  if (broken.value.delete(id)) {
    broken.value = new Set(broken.value);
    if (!broken.value.size) status.value = "settled";
  }
}

/** Edit a dimension value; related curves update through the solver. */
export function setDimension(c: Constraint, value: number) {
  if (c.kind !== "distance" || !Number.isFinite(value)) return;
  beginEdit();
  c.value = Math.max(0, value);
  solveCommit({ suspect: c.id });
}

/** Fix/unfix selected shapes. Fixed shapes are constants for the solver. */
export function setFixed(fixed: boolean) {
  beginEdit();
  doc.shapes
    .filter((s) => doc.selected.includes(s.id))
    .forEach((s) => (s.fixed = fixed));
  solveCommit();
}

/** Drop constraints referencing shapes that no longer exist. */
export function pruneConstraints() {
  const ids = new Set(doc.shapes.map((s) => s.id));
  const kept = doc.constraints.filter((c) => {
    const refs = c.kind === "equal" ? [c.a, c.b, c.c, c.d] : [c.a, c.b];
    return refs.every((r) => ids.has(r.shape));
  });
  const removed = new Set(
    doc.constraints.filter((c) => !kept.includes(c)).map((c) => c.id),
  );
  doc.constraints = kept;
  if (removed.size) {
    const next = new Set(broken.value);
    for (const id of removed) next.delete(id);
    if (next.size !== broken.value.size) {
      broken.value = next;
      if (!next.size) status.value = "settled";
    }
  }
}

export function measuredDistance(a: AnchorRef, b: AnchorRef) {
  const sa = doc.shapes.find((s) => s.id === a.shape);
  const sb = doc.shapes.find((s) => s.id === b.shape);
  const na = sa?.nodes[a.node],
    nb = sb?.nodes[b.node];
  if (!na || !nb) return undefined;
  return Math.hypot(nb.x - na.x, nb.y - na.y);
}
