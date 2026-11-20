import { reactive } from "vue";
import type { Document } from "./types";
export const doc = reactive<Document>({
  shapes: [],
  constraints: [],
  selected: [],
  tool: "select",
  zoom: 1,
});
