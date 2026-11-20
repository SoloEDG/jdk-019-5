import { doc } from "../../../shared/document";
import { translate } from "../lib/translate";
export function translateSelected(x: number, y: number) {
  doc.shapes
    .filter((s) => doc.selected.includes(s.id) && !s.fixed)
    .forEach((s) => translate(s, x, y));
}
