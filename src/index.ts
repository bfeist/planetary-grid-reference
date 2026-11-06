import { getEarthGridSystem } from "./earth/system.js";
import { moonGridSystem } from "./moon/system.js";
import type { GridLabelScheme, LgrsGridSystem, MissionGridSystemId } from "./types.js";

export type * from "./types.js";
export { LGRS_CRS_INVALID, conformLongitude, getEnvelopeLongitudes } from "./common.js";

/** Select a lunar grid or Earth analog with an explicit label scheme. */
export function getGridSystem(id: MissionGridSystemId, scheme: GridLabelScheme): LgrsGridSystem {
  switch (id) {
    case "moon-m2025":
      return moonGridSystem;
    case "earth-wgs84":
      return getEarthGridSystem(scheme);
    default:
      throw new Error(`Grid system "${id}" is not available.`);
  }
}
