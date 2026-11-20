import { ref } from "vue";
import { doc } from "../../../shared/document";
import type { AnchorRef } from "../../../shared/types";
import { solve } from "./solver";

export type SolverStatus = "settled" | "preview" | "conflict";

/** Ids of constraints the last settle pass could not satisfy. */
export const broken = ref<Set<string>>(new Set());
export const status = ref<SolverStatus>("settled");
export const lastResidual = ref(0);

/**
 * Continuous feedback while dragging: fast best-effort relaxation of the
 * healthy subset, mutating the document live. This is a transient preview —
 * geometry is only authoritative after `solveCommit`.
 */
export function solvePreview(opts: {
  pinnedShapes?: ReadonlySet<string>;
  pinnedKeys?: ReadonlySet<string>;
}) {
  const r = solve(doc.shapes, doc.constraints, {
    ...opts,
    previouslyBroken: broken.value,
    settle: false,
    maxIter: 60,
    eps: 1e-3,
  });
  lastResidual.value = r.residual;
  status.value = "preview";
}

/**
 * Final solve after a gesture or parameter edit: high precision, conflicts
 * are detected and quarantined, geometry stays at the last usable result.
 */
export function solveCommit(
  opts: {
    pinnedShapes?: ReadonlySet<string>;
    pinnedKeys?: ReadonlySet<string>;
    suspect?: string;
  } = {},
) {
  const r = solve(doc.shapes, doc.constraints, {
    ...opts,
    previouslyBroken: broken.value,
    settle: true,
    maxIter: 5000,
    eps: 1e-8,
  });
  broken.value = new Set([...r.broken, ...r.invalid]);
  lastResidual.value = r.residual;
  status.value = broken.value.size ? "conflict" : "settled";
}

/* ---- anchor picking (input for creating constraints) ---- */

export const picks = ref<AnchorRef[]>([]);

export function togglePick(ref: AnchorRef, additive: boolean) {
  const i = picks.value.findIndex(
    (p) => p.shape === ref.shape && p.node === ref.node,
  );
  if (i >= 0) picks.value.splice(i, 1);
  else {
    if (!additive) picks.value.length = 0;
    if (picks.value.length < 4) picks.value.push(ref);
  }
}

export function clearPicks() {
  picks.value = [];
}
