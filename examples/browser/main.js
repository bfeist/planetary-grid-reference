import { getGridSystem } from "@bfeist/planetary-grid-reference";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { createLgrsRenderPlan, getLgrsGridBinding } from "@bfeist/planetary-grid-reference/grid";

const moon = getGridSystem("moon-m2025", "lunar-acc");
const analog = getEarthGridSystem("lunar-acc");
const binding = getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, analog);
const centre = new Float64Array(2);
binding.latLonToMap(29.5593, -95.09, centre);
const extent = [centre[0] - 2000, centre[1] - 1500, centre[0] + 2000, centre[1] + 1500];
const plan = createLgrsRenderPlan({
  binding,
  extent,
  resolution: 5,
  gridSpacingMode: 100,
  gridLabelInterval: 100,
  labelsVisible: true,
});

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");
context.fillStyle = "#f7f9fc";
context.fillRect(0, 0, canvas.width, canvas.height);
drawGrid(canvas, plan, extent);

export function drawGrid(canvas, plan, extent) {
  const context = canvas.getContext("2d");
  const x = (value) => ((value - extent[0]) / (extent[2] - extent[0])) * canvas.width;
  const y = (value) => ((extent[3] - value) / (extent[3] - extent[1])) * canvas.height;
  context.strokeStyle = "#5378a1";
  for (const line of plan.lines) {
    context.lineWidth = line.kind === "seam" ? 2 : 1;
    context.beginPath();
    for (let index = 0; index < line.coordinates.length; index += 2) {
      const draw = index === 0 ? context.moveTo.bind(context) : context.lineTo.bind(context);
      draw(x(line.coordinates[index]), y(line.coordinates[index + 1]));
    }
    context.stroke();
  }
  context.font = "10px sans-serif";
  context.fillStyle = "#17324f";
  for (const label of plan.labels) {
    context.fillText(label.text, x(label.coordinate[0]) + 3, y(label.coordinate[1]) - 3);
  }
}
const result = {
  lunar: moon.formatPoint(-86, 30, 10, "full"),
  analog: analog.formatPoint(29.5593, -95.09, 10, "full"),
  mgrs: getEarthGridSystem("mgrs").formatPoint(29.5593, -95.09, 10, "full"),
  lineCount: plan.lines.length,
  labelCount: plan.labels.length,
  vertexCount: plan.vertexCount,
};
document.querySelector("output").textContent = JSON.stringify(result, null, 2);
window.gridExample = result;
