import { ref } from "vue";
import { doc } from "../../../shared/document";
const past: string[] = [];
const future: string[] = [];
export const revision = ref(0);
function snapshot() {
  return JSON.stringify({ shapes: doc.shapes, constraints: doc.constraints });
}
export function beginEdit() {
  past.push(snapshot());
  if (past.length > 100) past.shift();
  future.length = 0;
}
function install(state: string) {
  const s = JSON.parse(state);
  doc.shapes = s.shapes;
  doc.constraints = s.constraints ?? [];
  doc.selected = doc.selected.filter((id) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}
export function undo() {
  const state = past.pop();
  if (state) {
    future.push(snapshot());
    install(state);
  }
}
export function redo() {
  const state = future.pop();
  if (state) {
    past.push(snapshot());
    install(state);
  }
}
