# Home Monitor

A macOS-first, unofficial Sector Alarm desktop application. The main view puts a compact, expanded whole-house sensor inventory ahead of activity and settings. It starts in an unmistakable **48-device demo**, never signs in automatically, and never sends a real command on startup.

![Whole-house overview](docs/preview-light.png)

## Run

Requirements: Node.js 22+ and npm; macOS is the tested desktop platform. The dependency lockfile is included.

```sh
npm ci
npm run dev                # Electron desktop, starts in demo
```

For a production build:

```sh
npm run build
npm start
npm run pack:mac           # dist/mac-arm64/Home Monitor.app on Apple Silicon
npm run dist:mac           # DMG + ZIP for the build machine architecture
```

The generated `.app` in this workspace is runnable locally. Distribution requires your own Apple Developer signing identity and notarization; this build is unsigned. Windows packaging is configured (`npm run dist:win`) but has not been exercised. Build Windows installers on Windows.

```sh
npm run dev:web            # http://127.0.0.1:5173, demo-only browser preview
```

## Use your alarm

1. Open **Connect your home** in the desktop application.
2. Sign in with your Sector Alarm account and select your property. Connecting performs reads only.
3. Optional **Remember securely** stores an encrypted credential blob protected by Electron's OS credential facility (macOS Keychain; Windows DPAPI). Tokens remain in the main process's memory. No password or panel code goes into local display settings.
4. The live connection starts **read-only**. To intentionally use alarm commands, enable live controls under Settings. Every command requires its explicit confirmation and panel code; codes are not persisted.
5. A command is only confirmed by a matching, connected system state. An unknown outcome locks further commands until **Reconcile state** reads the actual state. No security command is automatically retried.

Development tests use synthetic responses. A subsequent user-requested read-only check verified login, property selection, armed state, and 36 sensors across three floors on the connected account. No live alarm command has been sent. Login flows that require unsupported MFA are not bypassed: use the official app and report the unsupported flow.

## What is implemented

- An expanded floor/room inventory, optional device-type grouping, search, exception filters, explicit total/hidden counts, and a contextual sensor panel.
- 48 demo devices across three floors and 12 rooms. In compact mode all 48 sensor rows fit at 1440 × 900. Activity is below the inventory. Smaller windows, comfortable density, or an open detail panel require page scrolling; no rooms are silently collapsed or paginated.
- Independent activity and health indicators: an open contact is not an alarm or an unhealthy device. Unsupported motion/smoke activity, missing battery/connectivity values, and tamper data stay unknown.
- Light/dark/system appearance; compact/comfortable density; keyboard focus, native dialog focus trapping, Escape, and Cmd/Ctrl+K search.
- Spanish floor/room labels from documented translation keys, preserved custom names, persistent local Spanish device aliases, and original-name fallback. Edit a device's local alias and floor/room grouping in its side panel. All edits stay on this computer.
- All absolute timestamps are formatted in `Europe/Madrid`, 24-hour `YYYY-MM-DD · HH:mm:ss`, with automatic DST. Offsetless legacy event times remain explicitly labeled local wall times; their ambiguous absolute instants are never guessed.
- Latest 80 activity records, with local alarm/health filters and total record count. Unknown event types are preserved; actors are shown only if supplied.
- Demo scenarios for stale/offline connections, partial failures, expired authentication, sensor alarm, rejected commands, and unknown outcomes.

## Live API scope and limits

See [capability assessment](docs/API-ASSESSMENT.md) and the pinned [reference documentation](docs/API-REFERENCE.md).

| Capability                                                                 | Implementation                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Legacy verified login, property list and panel metadata                    | Live HTTP adapter                                                                            |
| SAS v3 area state, partial-arm capability, panel connectivity              | Live HTTP adapter                                                                            |
| SAS contact + temperature property plans                                   | Live HTTP adapter with endpoint-specific legacy fallbacks; merges physical sensors by serial |
| Legacy TC state and sensor inventory                                       | Documented legacy sensor reads supported; legacy alarm commands remain unavailable           |
| Full arm, partial arm, disarm for SAS                                      | Explicitly enabled, code-confirmed commands; returned-state confirmation                     |
| Remote rename, siren, lock, camera capture, automation changes             | Not exposed                                                                                  |
| Native push, desktop notifications                                         | Not implemented; no real-time monitoring claim                                               |
| Tamper, general live motion/smoke state, individual last-report timestamps | Not supplied by the selected documented reads; shown as unavailable                          |

Alarm state polls every 3 minutes, sensor plans every 15, history every 10. A normal steady modern-API session uses about 36 requests/hour, plus connection/manual actions. This app conservatively caps itself at 44 requests per clock hour, preserves the meter across restarts, and stops on 429 until the next hour. The community-observed service limit is about 60/hour **shared with the phone app**; the app cannot know requests made elsewhere. Manual refresh is coalesced and throttled to at least 15 seconds per block. Inventory metadata is fetched when selecting a property; reconnect/reselect after changing panel capabilities.

Successful HTTP fetch time is not a sensor report time. The interface keeps old values with warnings after partial failures, tracks per-source refreshes, marks sensor data stale after 20 minutes or a failed source, and disables controls when state is stale/offline. Computer resume triggers a budgeted refresh. This is a polling companion, not a replacement for the monitoring service or official emergency alerts.

## Validation

```sh
npm test                   # domain + HTTP/session/command tests
npm run typecheck
npm run test:e2e            # Chrome installed; local demo browser tests
npm run test:desktop        # builds and opens Electron with temporary isolated data
```

The desktop smoke test uses a disposable profile, verifies the sandboxed preload bridge and absence of renderer Node access, and sends **demo-only** commands. It makes zero live API requests. See [validation report](docs/VALIDATION.md).

## Architecture

- `src/main/api.ts`: fixed-host HTTP, in-memory authentication, retry policy, persistent request budget.
- `src/main/service.ts`: refresh scheduling, independent source snapshots, command gate, demo scenarios.
- `src/main/index.ts`: Electron lifecycle, OS-protected credential persistence, narrow validated IPC.
- `src/preload`: sandbox-compatible CommonJS context bridge; no generic IPC/network interface exposed.
- `src/shared`: normalized types, response normalization, documented place dictionary, Madrid time formatting, synthetic demo data.
- `src/renderer`: presentation and local display preferences. Browser preview uses an injected transport that rejects every network call.

The renderer is sandboxed with context isolation, Node disabled, a restrictive CSP, denied permissions, and blocked external navigation/new windows. IPC accepts only the application's main frame. Preferences contain display choices and aliases, not secrets. Settings and encrypted credentials are written with owner-only permissions in the OS application data directory. Disconnect & forget deletes saved credentials and clears the in-memory token/password.

## Reference provenance

Inspected the initially empty target repository and the technical API documentation/client of [sector-alarm-dashboard](https://github.com/marcosmro/sector-alarm-dashboard) at commit `666d8417661657761bf39926d960d8b94632283d`. That repository was treated read-only. The documented location dictionary and API reference are reused with attribution; the application and UI are new. The reference's metadata declares MIT licensing. Its API documentation is unofficial, based on app analysis and reported Spanish-account observations—not an official Sector Alarm public API contract.

### Inventory compatibility correction

Panel `Vendor` is informational, not an inventory gate. As in the working reference client, the app tries modern state/contact/temperature/camera endpoints and falls back independently on actual HTTP 404 responses. Legacy contact, temperature (including flat fallback), camera, smoke, and flood reads are supported. State fallback never disables modern sensors. Missing data remains unknown; malformed responses, authentication failures, and rate limits do not masquerade as unsupported capabilities. Camera inventory and legacy smoke/flood reads run every 30 minutes. Legacy sessions can use about 40 requests/hour plus startup/manual actions, within the same enforced 44-request cap.

### Read-only diagnostic

`node scripts/check-connection.mjs --keep-open` launches the packaged app and uses its saved-account bridge. It only selects automatically when exactly one property is available, never enables alarm controls, and prints non-identifying status/count summaries. It uses the real saved account and consumes the normal request budget, so it is a manual diagnostic, not a test-suite command. A live screenshot is saved only to `/tmp/home-monitor-live-check.png`, not to the repository.

### Temperature overview

The overview shows Celsius readings per sensor, room averages in room headers, and a house average beside the title. Reported averages are retained from the existing temperature response; when unavailable, the app calculates an equal-weight mean of usable sensor readings. Stale, offline and inactive readings are excluded from calculated averages. Missing readings show a dash. Search and filters never change the averaging scope. Hover a temperature or open sensor details to inspect freshness and source information.
