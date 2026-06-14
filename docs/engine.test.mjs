import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseSensors, weightedMedian } from "./engine.mjs";

const SETTINGS = {
  unit: "C",
  warningThreshold: 50,
  criticalThreshold: 60,
  expectedNoise: 1,
  probeBudget: 1,
};

test("weighted median respects reliability weights", () => {
  assert.equal(weightedMedian([
    { value: 10, weight: 0.1 },
    { value: 40, weight: 0.8 },
    { value: 90, weight: 0.1 },
  ]), 40);
});

test("identifies a low-reliability outlier", () => {
  const result = diagnoseSensors([
    { id: "T1", value: 61.8, reliability: 0.95, probeCost: 2 },
    { id: "T2", value: 62.1, reliability: 0.9, probeCost: 2 },
    { id: "T3", value: 24, reliability: 0.55, probeCost: 1 },
    { id: "T4", value: 61.5, reliability: 0.85, probeCost: 3 },
  ], SETTINGS);
  assert.equal(result.suspectSensor.id, "T3");
  assert.equal(result.consensusState, "critical");
});

test("escalates when the sensor array is split", () => {
  const result = diagnoseSensors([
    { id: "S1", value: 35, reliability: 0.9, probeCost: 1 },
    { id: "S2", value: 36, reliability: 0.9, probeCost: 1 },
    { id: "S3", value: 66, reliability: 0.9, probeCost: 1 },
    { id: "S4", value: 67, reliability: 0.9, probeCost: 1 },
  ], SETTINGS);
  assert.equal(result.decision, "ESCALATE");
});

test("respects the confirmatory probe budget", () => {
  const result = diagnoseSensors([
    { id: "S1", value: 43, reliability: 0.95, probeCost: 2 },
    { id: "S2", value: 42.5, reliability: 0.9, probeCost: 2 },
    { id: "S3", value: 19, reliability: 0.6, probeCost: 1 },
  ], { ...SETTINGS, probeBudget: 2 });
  assert.equal(result.recommendedProbes.length, 2);
});

test("commits on a stable redundant array", () => {
  const result = diagnoseSensors([
    { id: "S1", value: 42.8, reliability: 0.95, probeCost: 2 },
    { id: "S2", value: 43.1, reliability: 0.9, probeCost: 2 },
    { id: "S3", value: 42.6, reliability: 0.85, probeCost: 2 },
  ], SETTINGS);
  assert.equal(result.decision, "COMMIT");
  assert.equal(result.consensusState, "normal");
});
