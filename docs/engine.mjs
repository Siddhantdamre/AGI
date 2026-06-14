function finite(value, name, minimum = -Infinity, maximum = Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function weightedMedian(values) {
  if (!values.length) throw new Error("At least one weighted value is required.");
  const sorted = [...values].sort((left, right) => left.value - right.value);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;
  for (const item of sorted) {
    running += item.weight;
    if (running >= totalWeight / 2) return item.value;
  }
  return sorted.at(-1).value;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[midpoint];
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function stateFor(value, warningThreshold, criticalThreshold) {
  if (value >= criticalThreshold) return "critical";
  if (value >= warningThreshold) return "warning";
  return "normal";
}

function validateSensors(rawSensors) {
  if (!Array.isArray(rawSensors) || rawSensors.length < 3) {
    throw new Error("Add at least three redundant sensors.");
  }
  return rawSensors.map((sensor, index) => ({
    id: String(sensor.id || `S${index + 1}`).trim(),
    value: finite(sensor.value, `Value for sensor ${index + 1}`),
    reliability: finite(sensor.reliability, `Reliability for sensor ${index + 1}`, 0.05, 1),
    probeCost: finite(sensor.probeCost, `Probe cost for sensor ${index + 1}`, 0.1, 1000),
  }));
}

function consensusFor(sensors) {
  return weightedMedian(sensors.map((sensor) => ({
    value: sensor.value,
    weight: sensor.reliability,
  })));
}

export function diagnoseSensors(rawSensors, rawSettings = {}) {
  const sensors = validateSensors(rawSensors);
  const settings = {
    unit: String(rawSettings.unit || "units").trim() || "units",
    warningThreshold: finite(rawSettings.warningThreshold, "Warning threshold"),
    criticalThreshold: finite(rawSettings.criticalThreshold, "Critical threshold"),
    expectedNoise: finite(rawSettings.expectedNoise, "Expected sensor noise", 0.01, 1000000),
    probeBudget: Math.floor(finite(rawSettings.probeBudget ?? 1, "Probe budget", 0, sensors.length)),
  };
  if (settings.warningThreshold >= settings.criticalThreshold) {
    throw new Error("Warning threshold must be lower than the critical threshold.");
  }

  const consensus = consensusFor(sensors);
  const deviations = sensors.map((sensor) => Math.abs(sensor.value - consensus));
  const mad = median(deviations);
  const robustScale = Math.max(mad * 1.4826, settings.expectedNoise);
  const agreementTolerance = Math.max(settings.expectedNoise * 2.5, robustScale * 0.5);
  const totalReliability = sensors.reduce((sum, sensor) => sum + sensor.reliability, 0);

  const diagnostics = sensors.map((sensor) => {
    const others = sensors.filter((candidate) => candidate.id !== sensor.id);
    const leaveOneOut = consensusFor(others);
    const deviation = Math.abs(sensor.value - consensus);
    const normalizedDeviation = deviation / robustScale;
    const consensusShift = Math.abs(leaveOneOut - consensus);
    const suspectScore = normalizedDeviation * (1.5 - sensor.reliability);
    const probeValue = (
      normalizedDeviation
      * (0.5 + sensor.reliability)
      * (1 + consensusShift / robustScale)
    ) / sensor.probeCost;
    return {
      ...sensor,
      deviation: round(deviation),
      normalizedDeviation: round(normalizedDeviation),
      leaveOneOutConsensus: round(leaveOneOut),
      consensusShift: round(consensusShift),
      suspectScore: round(suspectScore),
      probeValue: round(probeValue),
      agrees: deviation <= agreementTolerance,
    };
  });

  const supportWeight = diagnostics
    .filter((sensor) => sensor.agrees)
    .reduce((sum, sensor) => sum + sensor.reliability, 0);
  const supportRatio = supportWeight / totalReliability;
  const splitRatio = 1 - supportRatio;
  const uncertainty = robustScale * (1 + splitRatio);
  const lower = consensus - uncertainty;
  const upper = consensus + uncertainty;
  const consensusState = stateFor(consensus, settings.warningThreshold, settings.criticalThreshold);
  const boundaryUncertain = (
    (lower < settings.warningThreshold && upper >= settings.warningThreshold)
    || (lower < settings.criticalThreshold && upper >= settings.criticalThreshold)
  );
  const strongConflict = splitRatio >= 0.3 || diagnostics.filter((sensor) => !sensor.agrees).length >= 2;
  const confidence = Math.max(0, Math.min(1, supportRatio * Math.exp(-mad / settings.expectedNoise)));

  let decision = "ABSTAIN";
  let reason = "Evidence does not yet support a stable state classification.";
  if (strongConflict) {
    decision = "ESCALATE";
    reason = "Sensor disagreement is too large for a safe autonomous state estimate.";
  } else if (boundaryUncertain) {
    decision = "ABSTAIN";
    reason = "The uncertainty interval crosses an operating threshold; confirm before acting.";
  } else if (confidence >= 0.72) {
    decision = "COMMIT";
    reason = "Reliability-weighted consensus is stable and does not cross an operating threshold.";
  }

  const suspect = [...diagnostics].sort((left, right) => right.suspectScore - left.suspectScore)[0];
  const recommendedProbes = [...diagnostics]
    .sort((left, right) => right.probeValue - left.probeValue)
    .slice(0, settings.probeBudget);

  return {
    generatedAt: new Date().toISOString(),
    settings,
    consensus: round(consensus),
    consensusState,
    interval: [round(lower), round(upper)],
    robustScale: round(robustScale),
    supportRatio: round(supportRatio),
    conflictRatio: round(splitRatio),
    confidence: round(confidence),
    decision,
    reason,
    suspectSensor: suspect,
    recommendedProbes,
    sensors: diagnostics,
  };
}

export function diagnosticSummary(result) {
  return [
    `Decision: ${result.decision}`,
    `Estimated state: ${result.consensusState}`,
    `Consensus: ${result.consensus} ${result.settings.unit}`,
    `Uncertainty interval: ${result.interval[0]} to ${result.interval[1]} ${result.settings.unit}`,
    `Confidence: ${Math.round(result.confidence * 100)}%`,
    `Most suspect sensor: ${result.suspectSensor.id}`,
    `Recommended probes: ${result.recommendedProbes.map((sensor) => sensor.id).join(", ") || "None"}`,
    `Reason: ${result.reason}`,
  ].join("\n");
}
