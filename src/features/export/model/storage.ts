import { beginEdit, revision } from "../../drawing";
import { ref } from "vue";
import { doc } from "../../../shared/document";
import type {
  AnchorRef,
  Constraint,
  Shape,
  Point,
} from "../../../shared/types";
export const storageStatus = ref("All changes saved locally");
export function save() {
  try {
    localStorage.setItem(
      "forma-document",
      JSON.stringify({ shapes: doc.shapes, constraints: doc.constraints }),
    );
    storageStatus.value = "All changes saved locally";
  } catch {
    storageStatus.value =
      "Local storage unavailable — export to keep your work";
  }
}
function point(v: Point) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y);
}
function valid(s: Shape) {
  return (
    s &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    Array.isArray(s.nodes) &&
    s.nodes.every((n) => point(n) && point(n.in) && point(n.out)) &&
    typeof s.fill === "string" &&
    /^(none|#[0-9a-f]{3,8})$/i.test(s.fill) &&
    typeof s.stroke === "string" &&
    /^#[0-9a-f]{3,8}$/i.test(s.stroke) &&
    Number.isFinite(s.width) &&
    Number.isFinite(s.opacity)
  );
}
function validConstraint(shapes: Shape[]) {
  const refOk = (r: AnchorRef) =>
    r &&
    typeof r.shape === "string" &&
    Number.isInteger(r.node) &&
    r.node >= 0 &&
    shapes.some((s) => s.id === r.shape && r.node < s.nodes.length);
  return (c: Constraint) => {
    if (!c || typeof c.id !== "string") return false;
    switch (c.kind) {
      case "coincident":
      case "tangent":
        return refOk(c.a) && refOk(c.b);
      case "distance":
        return (
          refOk(c.a) && refOk(c.b) && Number.isFinite(c.value) && c.value >= 0
        );
      case "equal":
        return [c.a, c.b, c.c, c.d].every(refOk);
      default:
        return false;
    }
  };
}
export function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem("forma-document") || "null");
    // Legacy format: bare shapes array, no constraints.
    const shapes = Array.isArray(raw) ? raw : raw?.shapes;
    const constraints = Array.isArray(raw) ? [] : raw?.constraints;
    if (Array.isArray(shapes) && shapes.every(valid)) {
      beginEdit();
      doc.shapes = shapes;
      doc.constraints = Array.isArray(constraints)
        ? constraints.filter(validConstraint(shapes))
        : [];
      revision.value++;
      doc.selected = [];
      return true;
    }
  } catch {}
  return false;
}
