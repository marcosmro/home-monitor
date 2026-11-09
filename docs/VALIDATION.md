# Validation report

Validated 2026-11-09 on macOS / Apple Silicon. Development and command tests use synthetic data or injected HTTP responses. Subsequent user-requested diagnostics verified real account access and inventory with read-only calls. **No live security action was executed.**

## Results

| Check                                              | Result                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm test`                                         | 95 tests passed, 7 files                                                |
| `npm run typecheck`                                | Passed, desktop and renderer projects                                   |
| `npm run test:e2e`                                 | 12 tests passed in Chrome                                                |
| `npm run build`                                    | Passed: main, sandboxed CommonJS preload, renderer                      |
| `npm run pack:mac`                                 | Passed: `dist/mac-arm64/Home Monitor.app`, custom icon                  |
| Packaged application smoke test                    | Passed; real app bundle launched in isolated temporary profile          |
| OS-independent Madrid formatting                   | Spring/fall DST transitions and offset-bearing source timestamps passed |
| Dependency audit after targeted minimatch override | Zero vulnerabilities reported                                           |

## Tested behavior

- 48 unique devices, three floors, 12 rooms; independent contact activity and health; unknown readings never default to healthy.
- Both themes at 1440 × 900: all 48 sensor rows fit (last row bottom approximately 886 px), no horizontal overflow. The secondary activity strip remains below the sensor inventory and may require scrolling.
- Both themes visually inspected at 1024 × 768: all devices remain in the page, explicit above-inventory scrolling notice, no horizontal overflow. Comfortable density and open details intentionally require more scrolling.
- Expanded room grouping, exception filters, explicit hidden counts, search, original names and accented/long Spanish aliases, persistence after reload.
- Keyboard search, visible focus styles, native dialog focus behavior, Escape dismissal, reduced-motion styling.
- Full simulated command lifecycle: explicit confirmation, sending, awaiting confirmation, confirmed, failed, unknown outcome, read-only reconciliation. Duplicate/conflicting command prevention exists in the process-level gate as well as the UI.
- Fresh state confirmation only for the requested actual area ID; acceptance alone does not confirm. Timeout and wrong-code handling; no automatic security retries; expired-session GET retry at most once.
- Partial telemetry failure retains prior values and source timestamps. Merged-device freshness uses the older contributing source. Stale rows retain known low/offline flags instead of replacing them with a healthy indicator.
- Rate-limit backoff, cap before sending requests, missing/malformed response handling, no source timestamp conversion through the computer's local timezone.
- Device names resolve into events only when a complete documented location/type/mount tuple has exactly one inventory match. Ambiguous or incomplete references remain unlinked.
- Packaged Electron: exposed narrow bridge works, renderer `require` is unavailable, 48 rows render, simulated command confirms, 20 concurrent preference writes serialize correctly, and API request count stays zero.

## Visual artifacts

- `preview-light.png`, `preview-dark.png`: 1440 × 900 viewport, full-page captures.
- `preview-small-light.png`, `preview-small-dark.png`: 1024 × 768 viewport, full-page captures.
- `preview-desktop.png`: packaged Electron capture after a simulated disarm.

## Not verified / remaining limits

- Saved-account login and account-specific SAS reads were verified through the packaged app’s secure bridge. Live command semantics, MFA and Windows credential storage remain untested.
- The macOS bundle is unsigned and not notarized. A Developer ID identity is required for distributable signing. Unsigned local builds can re-prompt for Keychain access across rebuilds.
- Windows packaging and credential storage remain untested.
- Legacy command writes, native Auth0/MFA, desktop notifications, and event paging beyond 80 records are not implemented.
- No individual last-report time or general tamper field is available in the selected API plans. Smoke/motion devices often expose inventory and health, not live activity; the UI says “Not reported.”
- Polling and the shared API budget limit freshness. This application does not promise real-time monitoring.

## Property-discovery regression fix

Added seven cases covering absent/null/numeric/lowercase/non-active `InstallationStatus`, genuinely empty versus malformed responses, and numeric/invalid IDs. All 34 core tests and type checking pass. Property discovery no longer assumes an optional status field proves whether an account has a property; every selected connection still begins read-only. No live account calls were made to verify this correction.

## Inventory regression correction

51 core tests pass. Added replay of all three fictional properties from the working reference repository, modern inventory with absent/lowercase/numeric/legacy Vendor metadata, independence of state and sensor fallback, HTTP-404 caching, non-404 failure behavior, malformed state handling, missing legacy health flags, flat-temperature merging, and sections-only property plans. Read-only connection checks below, if performed, are separate from synthetic development tests.

## Read-only verification on the connected account

Verified through the packaged application and its saved-account bridge, without exposing credentials or changing alarm configuration:

- Read-only remains enabled.
- Panel connected; fully armed. Source state was `Armed`, now normalized correctly.
- 36 unique sensors across three floors, including 30 devices with contact state.
- Zero inventory/state/history warnings in the completed read cycle.
- 61 core tests and type checking pass; the reference fixture and state/name variant regressions are included.

No account identifiers, credentials, device serials, real history records, or live screenshots were added to the repository. The read-only diagnostic screenshot is temporary.

## Verified mount location metadata

The connected account returns numeric `mountType` values (1=window, 0=door), matching the reference Android app’s MountTypeDto numeric mapping. The read-only inventory check found 29 window contacts and 1 door contact, with mountIndex supplied for all 30; six other devices do not report a door/window mount. Normalization now accepts both names and numeric values, preserves unknowns, keeps contact mount information when telemetry is merged, and exposes the location in device details. Generic Spanish names use the reported mount/index. All 66 core tests and type checking pass.

## Temperature overview

Added sensor Celsius readings, room averages and a house average, preserving API aggregates with calculated fallback. Calculations deduplicate physical devices and exclude offline, inactive or stale readings; filtering does not change their scope. Temperature freshness is tracked independently of contacts. Distinct room IDs remain separate even when names match. Tests cover zero/negative readings, missing data, aggregation weighting, freshness, duplicates and filtering. Both themes retain all 48 demo devices at 1440×900; smaller windows remain scrollable without horizontal overflow.

The read-only live verification returned 36 temperature readings and 13 room averages, with a reported house average of 20.1°C at verification time. No additional endpoint or polling requests were added. The rebuilt application was reopened connected in read-only mode.

## Camera panel and local archive

81 core tests and 10 browser tests pass. New checks cover sequential full batches, cancellation, failure without retry, duplicate-batch exclusion, fully-armed state, request-budget admission, long capture timeouts, legacy capture identifiers, path validation, rejected non-image data, property isolation, persisted photos, and deletion. Browser tests cover capturing a simulated photo, actual image decoding, modal viewing and deletion. The packaged desktop smoke check verifies the archive survives application restart, images decode, native export writes a valid PNG, and deletion removes the local record. This uses an isolated demo profile and zero live requests. Dark/light and 1024px camera layouts were inspected. Live transmission latency and actual camera image responses remain unverified; no live camera was activated.

## Temporary local budget override

Tested default blocking, explicit override, continued request counting, immediate restoration, hour-boundary expiry, restart defaults, session-clear reset, input validation and continued server-429 enforcement. Browser coverage verifies the toggle and active indicator. The override is memory-only and does not automatically replay capture requests. No live limit was exceeded during testing.

## Capture progress and photo zoom

Tests cover estimate calculations, longer-than-estimated captures, timing learned from completed items, cancellation estimates and truthful partial completion. Browser tests verify the active-camera indicator and progress bar, stopping a batch, modal zoom and Fit reset with actual scrollable image enlargement. Compact camera layouts and the zoomed viewer were visually inspected using simulated images only. No extra API calls are introduced by progress updates or zoom.

## Camera-specific 405 handling

Added mocked checks for success → 405 → success without repeating a camera, retained response detail/Allow header, and camera-specific diagnostic text without method switching. Existing stop-on-unknown-outcome behavior remains tested. No live photos were taken to reproduce the reported Entrada failure; the underlying camera rejection is not yet diagnosed.

## Intermittent capture rejection follow-up

A subsequent user screenshot showed a successful new photo, 405 rejections including a camera with an older saved photo, an incomplete response, and a skipped camera. This does not establish a camera-specific method mismatch. Added a conservative 10-second pause between live batch requests (not a documented provider requirement), cancelable during the pause, with the pause included in estimates. Unknown outcomes stop pending captures and are labeled separately from definitive failures; summaries include skipped cameras. Cached thumbnails show their saved timestamp. Nested JSON error strings are decoded for readability. Tests cover pacing/cancellation, unknown-outcome stopping, error decoding and pause estimates. No live camera calls were made; the pause is not a verified fix for the server's 405 response.
