export interface Point {
  x: number;
  y: number;
}
export interface Node extends Point {
  in: Point;
  out: Point;
}
export interface Shape {
  id: string;
  name: string;
  nodes: Node[];
  closed: boolean;
  fill: string;
  stroke: string;
  width: number;
  opacity: number;
  group?: string;
  /** Locked shapes are constants for the constraint solver and cannot be dragged. */
  fixed?: boolean;
}

/** Reference to one anchor point of a shape. */
export interface AnchorRef {
  shape: string;
  node: number;
}
interface ConstraintBase {
  id: string;
}
export interface CoincidentConstraint extends ConstraintBase {
  kind: "coincident";
  a: AnchorRef;
  b: AnchorRef;
}
export interface TangentConstraint extends ConstraintBase {
  kind: "tangent";
  a: AnchorRef;
  b: AnchorRef;
}
export interface DistanceConstraint extends ConstraintBase {
  kind: "distance";
  a: AnchorRef;
  b: AnchorRef;
  value: number;
}
export interface EqualConstraint extends ConstraintBase {
  kind: "equal";
  a: AnchorRef;
  b: AnchorRef;
  c: AnchorRef;
  d: AnchorRef;
}
export type Constraint =
  | CoincidentConstraint
  | TangentConstraint
  | DistanceConstraint
  | EqualConstraint;

export interface Document {
  shapes: Shape[];
  constraints: Constraint[];
  selected: string[];
  tool: string;
  zoom: number;
}
