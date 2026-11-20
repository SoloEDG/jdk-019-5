<script setup lang="ts">
import { doc } from "../../../shared/document";
import type { AnchorRef, Constraint } from "../../../shared/types";
import { broken, picks } from "../model/state";
import {
  addConstraint,
  measuredDistance,
  removeConstraint,
  setDimension,
} from "../model/ops";

const icons: Record<Constraint["kind"], string> = {
  coincident: "⊙",
  tangent: "∿",
  distance: "↔",
  equal: "＝",
};

function refLabel(r: AnchorRef) {
  const s = doc.shapes.find((s) => s.id === r.shape);
  return `${s?.name ?? "?"}‹${r.node}›`;
}

function label(c: Constraint) {
  switch (c.kind) {
    case "coincident":
      return `${refLabel(c.a)} ≡ ${refLabel(c.b)}`;
    case "tangent":
      return `${refLabel(c.a)} ∿ ${refLabel(c.b)}`;
    case "distance":
      return `${refLabel(c.a)} ↔ ${refLabel(c.b)}`;
    case "equal":
      return `${refLabel(c.a)}↔${refLabel(c.b)} = ${refLabel(c.c)}↔${refLabel(c.d)}`;
  }
}

function measured(c: Constraint) {
  if (c.kind === "distance") {
    const m = measuredDistance(c.a, c.b);
    return m === undefined ? "" : m.toFixed(1);
  }
  if (c.kind === "equal") {
    const m1 = measuredDistance(c.a, c.b);
    const m2 = measuredDistance(c.c, c.d);
    return m1 === undefined || m2 === undefined
      ? ""
      : `${m1.toFixed(1)} = ${m2.toFixed(1)}`;
  }
  return "";
}
</script>

<template>
  <section class="constraints">
    <h3>
      Constraints <span>{{ doc.constraints.length }}</span>
    </h3>
    <div class="constraint-actions">
      <button
        :disabled="picks.length !== 2"
        title="Make the two picked anchors coincide"
        @click="addConstraint('coincident')"
      >
        ⊙ Coincident</button
      ><button
        :disabled="picks.length !== 2"
        title="Join smoothly: coincident with aligned handles"
        @click="addConstraint('tangent')"
      >
        ∿ Tangent</button
      ><button
        :disabled="picks.length !== 2"
        title="Fix the distance between the two picked anchors"
        @click="addConstraint('distance')"
      >
        ↔ Dimension</button
      ><button
        :disabled="picks.length !== 4"
        title="Make two picked pairs equally spaced"
        @click="addConstraint('equal')"
      >
        ＝ Equal
      </button>
    </div>
    <p class="hint" v-if="!doc.constraints.length">
      Click anchors to pick them (shift-click for more), then add a constraint.
      Picked: {{ picks.length }}
    </p>
    <div
      v-for="c in doc.constraints"
      :key="c.id"
      class="constraint"
      :class="{ broken: broken.has(c.id) }"
    >
      <span class="c-icon">{{ icons[c.kind] }}</span>
      <span class="c-label" :title="label(c)">{{ label(c) }}</span>
      <input
        v-if="c.kind === 'distance'"
        type="number"
        min="0"
        step="0.5"
        :value="c.value"
        @change="setDimension(c, +($event.target as HTMLInputElement).value)"
      />
      <span class="c-measure">{{ measured(c) }}</span>
      <i v-if="broken.has(c.id)" title="Conflict: cannot be satisfied">⚠</i>
      <button
        class="c-del"
        title="Delete constraint"
        @click="removeConstraint(c.id)"
      >
        ✕
      </button>
    </div>
  </section>
</template>
