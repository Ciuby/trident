import earcut from "earcut";

export function triangulatePolygon(points: Array<[number, number]>): number[] {
  const flattened = points.flatMap(([x, y]) => [x, y]);
  return earcut(flattened);
}
