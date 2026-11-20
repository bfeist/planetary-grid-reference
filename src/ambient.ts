import type * as GridReference from "./types.js";

declare global {
  type LgrsCrsId = GridReference.LgrsCrsId;
  type LgrsPrecision = GridReference.LgrsPrecision;
  type GridLabelScheme = GridReference.GridLabelScheme;
  type MissionGridSystemId = GridReference.MissionGridSystemId;
  type LgrsMapProjection = GridReference.LgrsMapProjection;
  type LgrsMapProjector = GridReference.LgrsMapProjector;
  type LgrsGridBinding = GridReference.LgrsGridBinding;
  type LgrsGridSystem = GridReference.LgrsGridSystem;
  type LgrsDisplayStyle = GridReference.LgrsDisplayStyle;
  type LgrsRenderOptions = GridReference.LgrsRenderOptions;
  type LgrsRenderLine = GridReference.LgrsRenderLine;
  type LgrsRenderLabel = GridReference.LgrsRenderLabel;
  type LgrsRenderPlan = GridReference.LgrsRenderPlan;
}
