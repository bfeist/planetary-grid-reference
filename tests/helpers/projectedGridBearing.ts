import { classifyLatLon, projectLatLon } from "../../src/moon.js";

export type Point = { lat: number; lng: number };

/** Aegis's planar bearing convention, retained here to check its projection inputs. */
export function bearingFromProjectedPoints(
  origin: ArrayLike<number>,
  destination: ArrayLike<number>
): number {
  const east = destination[0] - origin[0];
  const north = destination[1] - origin[1];
  if (east === 0 && north === 0) return 0;

  const bearing = 90 - (Math.atan2(north, east) * 180) / Math.PI;
  const clockwise = bearing < 0 ? bearing + 360 : bearing;
  return clockwise >= 360 ? clockwise - 360 : clockwise;
}

export function projectedGridBearing(
  origin: Point,
  destination: Point,
  crs = classifyLatLon(origin.lat, origin.lng)
): number {
  const a = new Float64Array(2);
  const b = new Float64Array(2);
  if (
    classifyLatLon(destination.lat, destination.lng) < 0 ||
    !projectLatLon(origin.lat, origin.lng, crs, a) ||
    !projectLatLon(destination.lat, destination.lng, crs, b)
  ) {
    return NaN;
  }
  return bearingFromProjectedPoints(a, b);
}
