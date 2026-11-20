<script setup lang="ts">
import { computed, watch } from "vue";
import { doc } from "../shared/document";
import {
  Tools,
  path,
  create,
  add,
  seed,
  beginEdit,
  undo,
  redo,
  revision,
} from "../features/drawing";
import { NodeOverlay, coordinates, select } from "../features/nodes";
import { Properties } from "../features/appearance";
import { Layers, translateSelected } from "../features/layers";
import { ExportBar, restore, save, storageStatus } from "../features/export";
import {
  ConstraintPanel,
  ConstraintOverlay,
  clearPicks,
  lastResidual,
  solveCommit,
  solvePreview,
  status,
} from "../features/constraints";
import type { Shape } from "../shared/types";
if (!restore()) seed();
solveCommit();
doc.selected = doc.shapes.length
  ? [doc.shapes[Math.min(3, doc.shapes.length - 1)].id]
  : [];
watch(() => [doc.shapes, doc.constraints], save, { deep: true });
watch(() => doc.selected, clearPicks);
const paths = computed(() => doc.shapes.map(path));
let drawing: Shape | undefined;
watch(
  () => doc.tool,
  () => {
    drawing = undefined;
    clearPicks();
  },
);
watch(revision, () => {
  drawing = undefined;
});
function down(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const p = coordinates(e, svg);
  beginEdit();
  const id = (e.target as Element).getAttribute("data-shape");
  if (doc.tool === "pen") {
    if (!drawing) drawing = create(p);
    add(drawing, p);
    const n = drawing.nodes.at(-1)!;
    const f = (ev: PointerEvent) => {
      const q = coordinates(ev, svg);
      n.out = q;
      n.in = { x: 2 * n.x - q.x, y: 2 * n.y - q.y };
    };
    window.addEventListener("pointermove", f);
    window.addEventListener(
      "pointerup",
      () => window.removeEventListener("pointermove", f),
      { once: true },
    );
  } else if (id) {
    select(id, e.shiftKey);
    if (doc.tool === "nodes") return;
    let last = p;
    let moved = false;
    const pinned = new Set(doc.selected);
    const f = (ev: PointerEvent) => {
      const q = coordinates(ev, svg);
      moved = true;
      translateSelected(q.x - last.x, q.y - last.y);
      last = q;
      // Continuous preview while dragging; the dragged selection is
      // pinned so the solver never fights the pointer.
      solvePreview({ pinnedShapes: pinned });
    };
    window.addEventListener("pointermove", f);
    window.addEventListener(
      "pointerup",
      () => {
        window.removeEventListener("pointermove", f);
        if (moved) solveCommit();
      },
      { once: true },
    );
  } else doc.selected = [];
}
function finish() {
  drawing = undefined;
  doc.tool = "select";
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") finish();
});
function doUndo() {
  undo();
  solveCommit();
}
function doRedo() {
  redo();
  solveCommit();
}
const statusText = computed(() => {
  if (!doc.constraints.length)
    return doc.tool === "pen"
      ? "Click / drag to draw · Enter to finish"
      : "Shift + click to select multiple · Drag to move";
  if (status.value === "preview")
    return `◌ preview · residual ${lastResidual.value.toFixed(3)}`;
  if (status.value === "conflict")
    return "⚠ constraint conflict — last usable result kept";
  return "✓ constraints satisfied";
});
</script>
<template>
  <header>
    <b class="brand">◈ forma <small>VECTOR STUDIO</small></b>
    <div>Bloom exploration <span> / Personal workspace</span></div>
    <ExportBar :paths="paths" />
  </header>
  <div class="workspace">
    <div class="left">
      <h5>PROJECT <span>＋</span></h5>
      <p class="project">▣ Bloom / Artboard 01</p>
      <Tools /><Layers /><ConstraintPanel />
      <p class="signature">✧ Designed to explore.</p>
    </div>
    <main>
      <div class="toolbar">
        <span>Artboard 01　<small>800 × 600</small></span>
        <div>
          <button @click="doUndo">↶</button><button @click="doRedo">↷</button
          ><button @click="doc.zoom = Math.max(0.4, doc.zoom - 0.1)">−</button
          >{{ Math.round(doc.zoom * 100) }}%<button
            @click="doc.zoom = Math.min(1.5, doc.zoom + 0.1)"
          >
            ＋
          </button>
        </div>
      </div>
      <div class="stage">
        <svg
          data-testid="canvas"
          :style="{
            width: 800 * doc.zoom + 'px',
            height: 600 * doc.zoom + 'px',
          }"
          viewBox="0 0 800 600"
          @pointerdown="down"
          @dblclick="finish"
        >
          <rect width="800" height="600" fill="#fffdfb" />
          <path
            v-for="s in doc.shapes"
            :key="s.id"
            :data-shape="s.id"
            :d="path(s)"
            :fill="s.fill"
            :stroke="s.stroke"
            :stroke-width="s.width"
            :opacity="s.opacity"
          />
          <ConstraintOverlay />
          <NodeOverlay />
        </svg>
      </div>
      <footer>
        <span>● {{ storageStatus }}</span
        ><span :class="status">{{ statusText }}</span
        ><span>{{ doc.selected.length }} selected</span>
      </footer>
    </main>
    <Properties />
  </div>
</template>
