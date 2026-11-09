# API and implementation assessment

The target GitHub repository and local folder were empty. No project-specific instructions or existing behavior needed preservation. Before examining reference UI files, the selected information architecture was an always-expanded floor/room matrix, compact persistent state/connection/actions header, secondary activity, and a sensor side panel. Reference UI code was not used.

Electron + React + TypeScript was selected because the reference established a workable Node HTTP environment, Electron provides OS-protected credential storage, and a sandboxed renderer permits a dense, accessible desktop interface with a future Windows build. No web hosting service or remote application backend is involved.

Source: reference `docs/API-REFERENCE.md`, revision 9 November 2026, commit `666d8417661657761bf39926d960d8b94632283d`. Read sections 0–7, 9, 13–17; inspected its client authentication/meter design, normalized type model, storage, and place dictionary. Reused only the place dictionary and documentation. The new normalizer preserves missing booleans instead of assuming healthy defaults, keeps independent source snapshots, and the command implementation examines the returned state instead of considering HTTP acceptance successful.

| API contract                                                                           | Evidence tier in reference                           | Treatment here                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/Login/Login` with UserId/Password, bearer AuthorizationToken, API-Version 6 | Reported verified                                    | Implemented. JWT expiry inspected; GET reauth retry at most once. Unsupported MFA stops.                                                       |
| GET `/api/account/GetPanelList` and `/api/Panel/GetPanel`                              | Reported verified                                    | Implemented, property selection and metadata.                                                                                                  |
| GET `/api/v3/panels/{id}/state`                                                        | Reported verified                                    | Uses actual returned area IDs and capability flags. Mixed area modes are unknown globally, each area is visible in selector.                   |
| GET `/api/Panel/GetPanelStatus`                                                        | Reported verified                                    | Read-only legacy state fallback; independent documented legacy sensor reads are supported. Legacy commands remain unsupported.                 |
| POST v3 `/areas/{id}/{arm,partialArm,disarm}`                                          | Official Android app extraction, **not live tested** | Exposed behind read-only preference + confirmation + code. Requires returned target state. No automatic replay, including 401.                 |
| SAS doors/windows property plan                                                        | Reported verified                                    | Contact state, alarm, batteryLow, last-change time. No invented supervision or tamper.                                                         |
| SAS temperature property plan                                                          | Reported verified                                    | Inventory and health. Supervision true means communication failure. Does not mean live motion/fire activity is available.                      |
| GET v2 panel logs                                                                      | Reported verified                                    | Latest 80 records, raw-type fallback, supplied actor only. No invented door-open history.                                                      |
| Place translation keys and friendlyName                                                | App-extracted and observed model                     | Friendly custom names take precedence. Spanish location dictionary; arbitrary user names never machine-translated. Local aliases are fallback. |
| culture es-ES header                                                                   | May influence response strings                       | Sent; no remote SetCulture mutation. No assumption that it translates user-assigned names.                                                     |
| ~60 requests/account/clock-hour                                                        | Community measurement, not service guarantee         | 44 local cap; roughly 36/h steady-state. Meter persisted; external app use cannot be measured.                                                 |
| No push/websocket                                                                      | Reference finding                                    | Polling, visible age, no real-time claims or desktop notifications.                                                                            |

## Deliberate gaps

- TC inventory reads now have documented legacy normalization and fallbacks. Legacy alarm commands remain unsupported.
- No remote lock, siren, automation, user/contact, or notification-setting writes. User-initiated photo capture is supported separately from alarm controls.
- No native Auth0/MFA flow is implemented. Unsupported legacy login responses stop and explain the limitation.
- No full history paging beyond the latest 80 events. The total is explicit.
- Telemetry generally lacks individual sensor last-report time; fetching does not manufacture one. Contact lastChanged is a state-change timestamp, not freshness proof.
- No generic tamper flag is documented in the selected plans.
- Offsetless TC history is known to be panel-local, but the source provides no DST-fold disambiguation. We preserve local wall time with an explicit unavailable-offset label, not a guessed instant.
- Account-specific reads were subsequently verified at the user’s request: online panel, fully armed state, 36 devices and 30 contact states across three floors. Live security writes remain untested.

## Freshness and commands

Source plans are cached independently. Failed refreshes retain previous records and timestamps; merged-device freshness is conservative, using the older contributing fetch and marking any failed source stale. A successful state request does not refresh the sensor inventory's timestamp. A panel offline flag remains separate from network refresh failures.

A process-level gate prevents duplicate/conflicting commands, independent of disabled buttons. HTTP errors that definitively reject a request become failed. Transport/server ambiguity becomes outcome unknown and blocks commands. Reconciliation is a read, never a retry, and only unlocks after a connected known area state; matching target confirms, different known state reports the mismatch. PINs are not stored. Every exposed security operation acts only on a selected, currently connected, recently checked area.

## Property discovery correction

The property list follows the reference client: every entry with a valid `PanelId` is offered. `InstallationStatus` is not treated as a required discovery field. Missing, numeric, or differently cased status values do not silently hide a property. Selecting a property remains read-only and obtains its actual metadata/state. Empty server lists and malformed entries produce distinct errors.

## Reference-client inventory parity correction

The working reference does not gate reads on `Vendor`. Modern routes are tried first, with per-endpoint HTTP 404 fallback. Home Monitor now follows this behavior. Missing or differently formatted vendor metadata never suppresses sensors. Added the documented `Floors/Rooms/Devices`, `Sections/Places/Components`, flat temperature, and camera legacy shapes. Device health stays unknown where a legacy endpoint supplies no flags. The reference’s synthetic fixture at the pinned commit is preserved in `tests/fixtures/reference-demo.json`; replay tests cover all three properties. This fixture contains fictional data only.

## Verified live response compatibility

A read-only check confirmed that the modern state endpoint returns `Armed` for the connected account, an alias handled by the working reference but missing from the initial implementation. State normalization now accepts the reference aliases and numeric strings; it never manufactures area IDs. Modern sensor reads returned 36 unique devices, including 30 contacts, with no refresh errors. Generic contact names use documented mount/index Spanish labels; meaningful custom names and original values remain intact.

## Mount-type serialization discrepancy

The summary reference describes string `DOOR`/`WINDOW` serialization. Its detailed official-app analysis (§doors/windows, MountTypeDto) also documents DOOR=0 and WINDOW=1. Read-only verification on this account returned the numeric representation, with 29 windows, 1 door and an index for every contact. Both representations are now normalized explicitly; missing/unknown mounts never default to door.

## Camera capture implementation

Based on reference sections 6.7–6.8, the camera panel uses modern `takepicture` or the documented legacy `Panel/TakePicture` route when inventory explicitly identifies a legacy camera and device ID. Physical captures are serialized with 120-second timeouts and no automatic retry. All requests share the existing persisted request budget. A fresh fully-armed state is required before capture; polling is suspended for the batch, with state rechecks between cameras if necessary. Failures stop pending captures except for a definitive per-camera HTTP 405 rejection, and cancellation waits for the in-flight result. Neither endpoint timing nor concurrency limits have been independently measured against the user's cameras. No live captures were performed during implementation.

A user subsequently reported two successful camera photos followed by a 405 for Entrada. The sample client uses the same modern GET route. No global method change is justified by this observation. The client now preserves the camera response explanation and advertised allowed methods, does not retry the rejected camera, and continues remaining cameras on this specific rejection. Unauthenticated OPTIONS inspection returned 401 with no Allow header, so it did not establish an alternative method. The camera-specific cause remains unconfirmed until a response explanation is available.
