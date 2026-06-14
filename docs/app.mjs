import { diagnoseSensors, diagnosticSummary } from "./engine.mjs";

const SCENARIOS = {
  outlier: [
    { id: "T1", value: 61.8, reliability: 0.95, probeCost: 2 },
    { id: "T2", value: 62.1, reliability: 0.9, probeCost: 2 },
    { id: "T3", value: 24, reliability: 0.55, probeCost: 1 },
    { id: "T4", value: 61.5, reliability: 0.85, probeCost: 3 },
  ],
  split: [
    { id: "T1", value: 35, reliability: 0.9, probeCost: 1 },
    { id: "T2", value: 36, reliability: 0.9, probeCost: 1 },
    { id: "T3", value: 66, reliability: 0.9, probeCost: 1 },
    { id: "T4", value: 67, reliability: 0.9, probeCost: 1 },
  ],
  stable: [
    { id: "T1", value: 42.8, reliability: 0.95, probeCost: 2 },
    { id: "T2", value: 43.1, reliability: 0.9, probeCost: 2 },
    { id: "T3", value: 42.6, reliability: 0.85, probeCost: 2 },
  ],
};

const form = document.querySelector("#diagnostic-form");
const sensorRows = document.querySelector("#sensor-rows");
const template = document.querySelector("#sensor-template");
const emptyState = document.querySelector("#empty-state");
const resultsShell = document.querySelector("#results-shell");
let currentResult = null;

function addSensor(sensor = {}) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector("tr");
  row.querySelector(".sensor-id").value = sensor.id ?? `S${sensorRows.children.length + 1}`;
  row.querySelector(".sensor-value").value = sensor.value ?? 0;
  row.querySelector(".sensor-reliability").value = sensor.reliability ?? 0.8;
  row.querySelector(".sensor-cost").value = sensor.probeCost ?? 1;
  row.querySelector(".remove-sensor").addEventListener("click", () => {
    if (sensorRows.children.length <= 3) {
      window.alert("At least three redundant sensors are required.");
      return;
    }
    row.remove();
  });
  sensorRows.append(fragment);
}

function loadScenario(name) {
  sensorRows.replaceChildren();
  SCENARIOS[name].forEach(addSensor);
}

function collectSensors() {
  return [...sensorRows.querySelectorAll("tr")].map((row) => ({
    id: row.querySelector(".sensor-id").value,
    value: row.querySelector(".sensor-value").value,
    reliability: row.querySelector(".sensor-reliability").value,
    probeCost: row.querySelector(".sensor-cost").value,
  }));
}

function settings() {
  return {
    unit: document.querySelector("#unit").value,
    expectedNoise: document.querySelector("#expected-noise").value,
    warningThreshold: document.querySelector("#warning-threshold").value,
    criticalThreshold: document.querySelector("#critical-threshold").value,
    probeBudget: document.querySelector("#probe-budget").value,
  };
}

function drawPlot(result) {
  const canvas = document.querySelector("#sensor-plot");
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { left: 58, right: 24, top: 24, bottom: 58 };
  const values = result.sensors.map((sensor) => sensor.value);
  const min = Math.min(...values, result.settings.warningThreshold, result.interval[0]);
  const max = Math.max(...values, result.settings.criticalThreshold, result.interval[1]);
  const spread = Math.max(max - min, result.settings.expectedNoise * 5);
  const axisMin = min - (spread * 0.12);
  const axisMax = max + (spread * 0.12);
  const x = (value) => padding.left + (((value - axisMin) / (axisMax - axisMin)) * (width - padding.left - padding.right));
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8f9fc";
  context.fillRect(0, 0, width, height);

  const bands = [
    { from: axisMin, to: result.settings.warningThreshold, color: "#e8f4ee" },
    { from: result.settings.warningThreshold, to: result.settings.criticalThreshold, color: "#fff1d9" },
    { from: result.settings.criticalThreshold, to: axisMax, color: "#f9e2e6" },
  ];
  for (const band of bands) {
    context.fillStyle = band.color;
    context.fillRect(x(band.from), padding.top, x(band.to) - x(band.from), height - padding.top - padding.bottom);
  }

  context.strokeStyle = "#8f98a7";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(padding.left, height - padding.bottom);
  context.lineTo(width - padding.right, height - padding.bottom);
  context.stroke();

  for (const threshold of [
    { value: result.settings.warningThreshold, label: "warning" },
    { value: result.settings.criticalThreshold, label: "critical" },
  ]) {
    context.strokeStyle = threshold.label === "critical" ? "#a13b4c" : "#9d620e";
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(x(threshold.value), padding.top);
    context.lineTo(x(threshold.value), height - padding.bottom);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = context.strokeStyle;
    context.font = "700 11px Inter, sans-serif";
    context.textAlign = "center";
    context.fillText(threshold.label, x(threshold.value), 16);
  }

  const intervalStart = x(result.interval[0]);
  const intervalEnd = x(result.interval[1]);
  context.fillStyle = "rgba(75,74,161,0.18)";
  context.fillRect(intervalStart, height - padding.bottom - 28, intervalEnd - intervalStart, 18);
  context.strokeStyle = "#4b4aa1";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x(result.consensus), padding.top);
  context.lineTo(x(result.consensus), height - padding.bottom);
  context.stroke();

  result.sensors.forEach((sensor, index) => {
    const y = padding.top + 35 + ((index % 4) * 42);
    context.beginPath();
    context.arc(x(sensor.value), y, 9, 0, Math.PI * 2);
    context.fillStyle = sensor.id === result.suspectSensor.id ? "#a13b4c" : "#137b75";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#303746";
    context.font = "700 11px Inter, sans-serif";
    context.textAlign = "center";
    context.fillText(sensor.id, x(sensor.value), y - 15);
  });

  context.fillStyle = "#5e6675";
  context.font = "11px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText(`${axisMin.toFixed(1)} ${result.settings.unit}`, padding.left, height - 20);
  context.textAlign = "right";
  context.fillText(`${axisMax.toFixed(1)} ${result.settings.unit}`, width - padding.right, height - 20);
}

function render(result) {
  currentResult = result;
  document.querySelector("#error-message").classList.add("hidden");
  emptyState.classList.add("hidden");
  resultsShell.classList.remove("hidden");
  document.querySelector("#result-subtitle").textContent =
    `${result.sensors.length} sensors | interval ${result.interval[0]}-${result.interval[1]} ${result.settings.unit}`;

  const decision = document.querySelector("#decision");
  decision.textContent = result.decision;
  decision.className = `decision ${result.decision.toLowerCase()}`;
  document.querySelector("#metric-state").textContent = result.consensusState;
  document.querySelector("#metric-consensus").textContent = `${result.consensus} ${result.settings.unit}`;
  document.querySelector("#metric-confidence").textContent = `${Math.round(result.confidence * 100)}%`;
  document.querySelector("#metric-suspect").textContent = result.suspectSensor.id;
  document.querySelector("#metric-conflict").textContent = `${Math.round(result.conflictRatio * 100)}%`;
  document.querySelector("#decision-note").textContent = result.reason;

  const probes = result.recommendedProbes.length
    ? result.recommendedProbes.map((sensor, index) => {
      const item = document.createElement("li");
      item.textContent =
        `${index + 1}. Probe ${sensor.id}: reading ${sensor.value} ${result.settings.unit}, `
        + `reliability ${sensor.reliability.toFixed(2)}, value/cost ${sensor.probeValue.toFixed(2)}.`;
      return item;
    })
    : [Object.assign(document.createElement("li"), { textContent: "No confirmatory probes requested." })];
  document.querySelector("#probe-list").replaceChildren(...probes);

  document.querySelector("#trace-rows").replaceChildren(
    ...[...result.sensors].sort((left, right) => right.suspectScore - left.suspectScore).map((sensor) => {
      const row = document.createElement("tr");
      const values = [
        sensor.id,
        `${sensor.value} ${result.settings.unit}`,
        sensor.reliability.toFixed(2),
        sensor.deviation.toFixed(2),
        sensor.leaveOneOutConsensus.toFixed(2),
        sensor.suspectScore.toFixed(2),
        sensor.probeValue.toFixed(2),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 0 && sensor.id === result.suspectSensor.id) cell.className = "flag";
        row.append(cell);
      });
      return row;
    }),
  );
  drawPlot(result);
  resultsShell.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    render(diagnoseSensors(collectSensors(), settings()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run the diagnostic.";
    const errorMessage = document.querySelector("#error-message");
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
    console.error("Diagnostic render failed:", error);
  }
});

document.querySelector("#add-sensor").addEventListener("click", () => addSensor());
document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => loadScenario(button.dataset.scenario));
});
document.querySelector("#copy-button").addEventListener("click", async () => {
  if (!currentResult) return;
  await navigator.clipboard.writeText(diagnosticSummary(currentResult));
  const button = document.querySelector("#copy-button");
  const original = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = original; }, 1200);
});
document.querySelector("#download-button").addEventListener("click", () => {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "deic-sensor-diagnostic.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

loadScenario("outlier");
