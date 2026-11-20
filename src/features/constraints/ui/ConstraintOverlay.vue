<script setup lang="ts">
import { computed } from "vue";
import { doc } from "../../../shared/document";
import type { AnchorRef, Constraint } from "../../../shared/types";
import { broken, picks } from "../model/state";

function point(r: AnchorRef) {
  const s = doc.shapes.find((s) => s.id === r.shape);
  return s?.nodes[r.node];
}

interface Badge {
  id: string;
  kind: Constraint["kind"];
  bad: boolean;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  tx?: number;
  ty?: number;
  text?: string;
}

const badges = computed<Badge[]>(() => {
  const out: Badge[] = [];
  for (const c of doc.constraints) {
    const bad = broken.value.has(c.id);
    const pa = point(c.a),
      pb = point(c.b);
    if (!pa || !pb) continue;
    const mx = (pa.x + pb.x) / 2,
      my = (pa.y + pb.y) / 2;
    if (c.kind === "distance") {
      const d = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
      const nx = (-(pb.y - pa.y) / d) * 10,
        ny = ((pb.x - pa.x) / d) * 10;
      out.push({
        id: c.id,
        kind: c.kind,
        bad,
        x: pa.x,
        y: pa.y,
        x2: pb.x,
        y2: pb.y,
        tx: mx + nx,
        ty: my + ny,
        text: c.value.toFixed(1),
      });
    } else if (c.kind === "equal") {
      const pc = point(c.c),
        pd = point(c.d);
      if (!pc || !pd) continue;
      out.push({
        id: c.id,
        kind: c.kind,
        bad,
        x: mx,
        y: my,
        tx: mx,
        ty: my - 8,
        text: "=",
      });
      out.push({
        id: c.id + ":2",
        kind: c.kind,
        bad,
        x: (pc.x + pd.x) / 2,
        y: (pc.y + pd.y) / 2,
        tx: (pc.x + pd.x) / 2,
        ty: (pc.y + pd.y) / 2 - 8,
        text: "=",
      });
    } else {
      out.push({ id: c.id, kind: c.kind, bad, x: mx, y: my });
    }
  }
  return out;
});

const picked = computed(
  () => new Set(picks.value.map((p) => `${p.shape}:${p.node}`)),
);
const pickedPoints = computed(() =>
  doc.shapes.flatMap((s) =>
    s.nodes
      .map((n, i) => ({ n, key: `${s.id}:${i}` }))
      .filter((p) => picked.value.has(p.key))
      .map((p) => p.n),
  ),
);
</script>

<template>
  <g class="constraint-badges" pointer-events="none">
    <g v-for="b in badges" :key="b.id" :class="{ bad: b.bad }">
      <line
        v-if="b.kind === 'distance'"
        :x1="b.x"
        :y1="b.y"
        :x2="b.x2"
        :y2="b.y2"
        class="c-line"
      />
      <circle
        v-if="b.kind === 'coincident'"
        :cx="b.x"
        :cy="b.y"
        r="4"
        class="c-dot"
      />
      <g v-if="b.kind === 'tangent'">
        <circle :cx="b.x" :cy="b.y" r="3.5" class="c-dot" />
        <line :x1="b.x - 9" :y1="b.y" :x2="b.x + 9" :y2="b.y" class="c-line" />
      </g>
      <text v-if="b.text" :x="b.tx" :y="b.ty" class="c-text">{{ b.text }}</text>
    </g>
    <circle
      v-for="(n, i) in pickedPoints"
      :key="i"
      :cx="n.x"
      :cy="n.y"
      r="7"
      class="c-pick"
    />
  </g>
</template>

<style scoped>
.c-line {
  stroke: #8055d5;
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
.c-dot {
  fill: #fff;
  stroke: #8055d5;
  stroke-width: 1.5;
}
.c-text {
  fill: #8055d5;
  font-size: 10px;
  text-anchor: middle;
}
.c-pick {
  fill: none;
  stroke: #8055d5;
  stroke-width: 1.5;
  stroke-dasharray: 2 2;
}
.bad .c-line {
  stroke: #d64545;
}
.bad .c-dot {
  stroke: #d64545;
}
.bad .c-text {
  fill: #d64545;
}
</style>
