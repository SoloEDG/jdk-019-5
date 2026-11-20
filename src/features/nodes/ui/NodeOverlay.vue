<script setup lang="ts">
import { beginEdit } from "../../drawing";
import {
  keyOf,
  solveCommit,
  solvePreview,
  togglePick,
} from "../../constraints";

import { doc } from "../../../shared/document";
import { move } from "../model/move";
import { coordinates } from "../lib/coordinates";
import type { Node, Shape } from "../../../shared/types";
function drag(
  e: PointerEvent,
  s: Shape,
  i: number,
  kind: "anchor" | "in" | "out",
) {
  e.stopPropagation();
  const svg = (e.target as SVGElement).ownerSVGElement!;
  const start = coordinates(e, svg);
  const key = keyOf(s.id, i, kind === "anchor" ? undefined : kind);
  const n = s.nodes[i];
  let moved = false;
  const f = (ev: PointerEvent) => {
    if (s.fixed) return; // locked shapes cannot be dragged
    const p = coordinates(ev, svg);
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 2) return;
    if (!moved) beginEdit();
    moved = true;
    if (kind === "anchor") move(n, p);
    else Object.assign(n[kind], p);
    // Transient preview: the dragged point is pinned, everything else
    // relaxes around it. Final precision happens on pointerup.
    solvePreview({ pinnedKeys: new Set([key]) });
  };
  window.addEventListener("pointermove", f);
  window.addEventListener(
    "pointerup",
    () => {
      window.removeEventListener("pointermove", f);
      if (moved) solveCommit();
      else if (kind === "anchor")
        togglePick({ shape: s.id, node: i }, e.shiftKey);
    },
    { once: true },
  );
}
</script>
<template>
  <g v-for="s in doc.shapes.filter((s) => doc.selected.includes(s.id))"
    ><g v-for="(n, i) in s.nodes"
      ><path
        :d="`M${n.in.x},${n.in.y} L${n.x},${n.y} L${n.out.x},${n.out.y}`"
        stroke="#9974ec"
        fill="none" /><circle
        v-for="k in ['in', 'out'] as const"
        :cx="n[k].x"
        :cy="n[k].y"
        r="4"
        fill="white"
        stroke="#8052df"
        @pointerdown="drag($event, s, i, k)" /><rect
        :x="n.x - 4"
        :y="n.y - 4"
        width="8"
        height="8"
        fill="white"
        stroke="#8052df"
        data-testid="anchor"
        @pointerdown="drag($event, s, i, 'anchor')" /></g
  ></g>
</template>
