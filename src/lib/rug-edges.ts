export type RugEdge = "end1" | "end2" | "side1" | "side2";

/** Calculate selected linear footage from edges + dimensions */
export function calcSelectedLinearFt(
  edges: RugEdge[],
  lengthFt: number,
  widthFt: number
): number {
  let total = 0;
  if (edges.includes("end1")) total += widthFt;
  if (edges.includes("end2")) total += widthFt;
  if (edges.includes("side1")) total += lengthFt;
  if (edges.includes("side2")) total += lengthFt;
  return total;
}
