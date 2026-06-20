# Vendored Seestar session corpus

These are **sanitized, recorded** control-channel sessions captured between the
official app and real Seestar telescopes. They are vendored verbatim from the
`scopinator-rs` conformance corpus
(`scopinator-rs/conformance/sessions/`) so that esc's end-to-end replay tests are
self-contained and run in CI without the sibling repository present.

Each session directory contains:

- `control.jsonl` — one captured message per line:
  `{"timestamp": <float>, "direction": "client" | "telescope", "raw": "<json-rpc string>"}`
  where `direction` is from the proxy's vantage point: `client` = app→telescope
  (a command), `telescope` = telescope→app (a response or an async `Event`).
- `manifest.json` — model, firmware version, and message counts.

Secrets were redacted upstream by `scopinator-rs/tools/sanitize_session.py`; do
not attempt to restore raw values.

## Vendored subset

| Session            | Model       | Firmware | Lines | Purpose                         |
| ------------------ | ----------- | -------- | ----- | ------------------------------- |
| `s50_fw670_a`      | Seestar S50 | 6.70     | 777   | Comprehensive S50 coverage      |
| `s30_fw706_a`      | Seestar S30 | 7.06     | 455   | Different model + firmware       |
| `s30_fw706_small`  | Seestar S30 | 7.06     | 150   | Fast smoke test                  |

To refresh or add sessions, copy them from the upstream corpus — do not hand-edit.
