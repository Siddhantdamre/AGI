# DEIC: Discrete Executive Inference Core

[![Live Sensor Diagnostic](https://img.shields.io/badge/Live_sensor_diagnostic-open-137B75?style=for-the-badge&logo=githubpages)](https://siddhantdamre.github.io/Wait-a-minute...who-are-you/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

DEIC explores a practical question: when redundant information sources disagree,
which state should a system believe, which source is suspect, and what should it
check next before committing?

## Direct Use: Sensor Trust Diagnostic

The [public browser app](https://siddhantdamre.github.io/Wait-a-minute...who-are-you/)
is a zero-key worksheet for redundant sensor arrays. Enter readings,
source-reliability priors, operating thresholds, expected noise, and
confirmatory-probe costs. It returns:

- a reliability-weighted robust consensus and uncertainty interval
- `COMMIT`, `ABSTAIN`, or `ESCALATE` with an explicit reason
- the most suspect sensor from deviation and leave-one-out consistency
- the next confirmatory probe ranked by expected diagnostic value per cost
- a downloadable decision trace for review

The implementation is deterministic JavaScript under `docs/`; all inputs remain
in the browser. Run its engine checks with:

```bash
node docs/engine.test.mjs
```

## Method

The worksheet combines:

1. reliability-weighted median state estimation
2. median-absolute-deviation robustness
3. leave-one-out consensus shifts
4. threshold-crossing uncertainty checks
5. value-per-cost probe selection

It is a diagnostic planning demonstration, not certified control logic. Real
deployments require calibrated noise models, temporal dynamics, authenticated
telemetry, domain-specific validation, and human safety ownership.

## Research Code

The public repository has multiple historical lines of development. The mature
bounded-inference and metacognition benchmark currently lives on the
[`metacog-benchmark-expansion`](https://github.com/Siddhantdamre/Wait-a-minute...who-are-you/tree/metacog-benchmark-expansion)
branch, where `deic_core/`, cross-domain benchmark adapters, regression tests,
and result packages are maintained.

This `main` branch intentionally keeps the immediately usable browser diagnostic
small and dependency-free while the research history is consolidated.

## License

MIT
