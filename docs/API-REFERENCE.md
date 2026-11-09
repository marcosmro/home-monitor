# Sector Alarm · Complete API Reference (My Pages)

> Self-contained document for agents and developers who want to build another client
> or interface on top of the unofficial Sector Alarm API. There is no need to read the rest of the repo.
>
> Last revised: 9 November 2026. Sources: the decompiled official Android app 3.87.0,
> community Home Assistant integrations and real usage against a Spanish account
> with a panel on the SAS platform (every read and write marked
> "verified" was executed successfully against the real server between 7 and 8
> November 2026).

---

## 0. How to read this document

Every endpoint carries a reliability label:

| Label | Meaning |
| --- | --- |
| **verified** | Executed against the real API from this project, and the response matched what is described. No write against the alarm (arming, locks, smart plugs, notifications, skipping rules) has been exercised: the real panel is used read-only. |
| **official app** | Extracted from the code of the Android app 3.87.0 (Retrofit interfaces and Moshi DTOs). It certainly exists; the response shape is reconstructed from the DTOs and may have additional fields. |
| **community** | Taken from Home Assistant integrations (`gjohansson-ST/sector`, `SimWer/ha-sector-alarm`). It worked in 2026, but we have not exercised all of them. |
| **do not implement** | Requires an SMS code (2FA), is dead code in the app, or is not documented well enough to use blind. |

Conventions:

- `{panelId}` is the panel identifier as returned by the panel list (a numeric string).
- Routes are relative to the host `https://mypagesapi.sectoralarm.net`.
- JSON examples marked "observed shape" reproduce the keys and types the real server returned, with made-up serials, names and identifiers. The rest are reconstructions from the app's DTOs.
- **Two route families** coexist. The *legacy* one uses PascalCase (`/api/Panel/GetPanel`, keys such as `PanelId`). The *new* one, the one the official app has used since 2024, uses camelCase (`/api/v3/panels/{id}/state`, keys such as `isOnline`). A panel on the **SAS** platform accepts both; one on the **TC** platform only the legacy one. The `Vendor` field of `GET /api/Panel/GetPanel` tells you which one you have.

---

## 1. Golden rules

1. **Limit of 60 requests per clock hour and per account**, shared with the user's mobile app. It is a community measurement, not a published value. Once exceeded, **all** routes return `429` without a `Retry-After` header until the next full hour. A client must count its requests, leave headroom for the mobile app and stop on a 429 until the hour changes.
2. **There is no push and no websocket.** Everything is polling. The official app does not poll: it refreshes when each screen opens, after each action and when a Firebase push notification arrives. A desktop client has to choose cadences (see §15).
3. **The token is a JWT** with `exp`. Renew it only when it expires or when a request returns 401. Each login costs one request.
4. **403 on arming and locks means a wrong panel code**, not an expired session. Do not retry the login on a 403 from those routes.
5. **404 on a route of the new family means the panel or the account does not have it**, not that the API is down. Switch to the equivalent legacy route and remember it for the rest of the session. On a route with no equivalent (automations, persons, invoices) a 404 means "this account does not have that feature".
6. **Writes are not idempotent for practical purposes** and act on a real alarm. Any client must start in read-only mode and require an explicit user action to enable them.
7. **The API is neither documented nor publicly versioned.** Field names vary between routes (`Serial`, `SerialNo`, `SerialString`; `Temperature` and the misspelled `Temprature`). A tolerant normalizer that accepts aliases is essential.
8. **Everything that requires an SMS code (2FA)** in the app (contacts, users, Wi-Fi, lock settings, video consent) is out of reach for an unattended client. It appears in this document for reference only.

---

## 2. Authentication

### 2.1 Legacy login · **verified**

```
POST /api/Login/Login
Content-Type: application/json
API-Version: 6

{ "UserId": "correo@dominio", "Password": "contraseña" }
```

Response `200`:

```json
{ "AuthorizationToken": "eyJhbGciOi…", "User": { … }, "Resources": { … } }
```

Only `AuthorizationToken` is needed. It is a JWT; decode the `exp` of the payload to know when to renew (in practice it lasts about an hour; if it cannot be decoded, assume 50 minutes). Errors: `401` or `403` = user or password rejected; `429` = hourly limit.

Afterwards, on **all** other requests:

```
Authorization: Bearer <AuthorizationToken>
API-Version: 6
Accept: application/json
Content-Type: application/json
```

`API-Version` accepts `5` or `6` in 2026; the official app sends `6`. The app also adds `Platform: Android`, `Version: 3.87.0 (<build> sectoralarm)` and `culture: es-ES`; they are not required for the routes to respond, but `culture` may influence the texts of some responses.

### 2.2 Official app login (Auth0) · **official app**

The app does not use `/api/Login/Login`. It performs a *Resource Owner Password Grant* against Auth0:

```
POST https://login.sectoralarm.com/oauth/token
Content-Type: application/json

{
  "grant_type": "password",
  "client_id": "PLYVfpV8Y7N3ecZiYSSucLmYfpA5W8oD",
  "audience": "https://minside.sectoralarm.no",
  "scope": "openid profile email offline_access",
  "username": "correo@dominio",
  "password": "contraseña"
}
```

and sends the resulting `access_token` in `Authorization: <access_token>` **without** the word `Bearer`. It also obtains a `refresh_token` (`offline_access`). This is the alternative should the legacy login ever stop working; in the meantime the legacy one is simpler and works against the same backend.

### 2.3 Account data · **official app**

- `GET /api/Login/GetUser` → `{ AuthorizationToken, User, Resources }`. `User` includes `FirstName`, `LastName`, `UserCultureInfo`, `CustomerNo`, `CountryCode`, `Id` (personId), `UserName`, `Roles[]`, `Features[]` (server-side feature flags, see §12), `UnreadMessages`, `CellPhone`. `Resources` carries support URLs: `CustomerServicePhone`, `CustomerServiceFaqUrl`, `PrivacyPolicyUrl`, `TermsUrl`, `TagShopUrl`, `RemoteShopUrl`, `SmartPlugsShopUrl`.
- `POST /api/Account/SetCulture?culture=es-ES` → empty.
- `GET /api/Account/GetTextByCultureAndPlatform?platform=Android&culture=es-ES` → `{ "clave": "texto", … }` · **verified**. Server-side translation dictionary (`history_*`, `notification_*`, `PlaceKey` keys, etc.). One request per session; cache it forever. If you are not interested, §13 provides its own tables in Spanish.

---

## 3. Panels and inventory

### 3.1 Panel list · **verified**

```
GET /api/account/GetPanelList
```

```json
[
  {
    "PanelId": "01234567",
    "DisplayName": "Casa",
    "AccessGroup": "LEGAL_OWNER",
    "Status": "Disarmed",
    "InstallationStatus": "Active",
    "IsDefaultPanel": true
  }
]
```

- `AccessGroup`: `NONE | LEGAL_OWNER | ADMIN | USER`.
- `Status`: `Unknown | Disarmed | ArmedPartial | ArmedTotal` (a snapshot; do not use it to poll the state, use §4).
- `InstallationStatus`: `Planned | Working | CanActivate | Active`. Only `Active` has data.

The route is accepted with any combination of upper and lower case (`/api/Account/GetPanelList` is the app's form).

### 3.2 Panel detail and inventory · **verified**

```
GET /api/Panel/GetPanel?panelId={panelId}
```

Relevant fields (the response carries more, all in PascalCase):

| Key | Type | Use |
| --- | --- | --- |
| `PanelId`, `DisplayName` | string | |
| `Vendor` | `"SAS"` \| `"TC"` | **Decides which route family to use.** SAS = current platform (accepts `/api/v3`, `/api/vs2`). TC = legacy. |
| `InstallationAddress` | string? | Installation address. |
| `InstallationStatus` | enum | See 3.1. |
| `PanelCodeLength` | int | Length of the user code (normally 4). |
| `QuickArmEnabled`, `QuickArmAllowed` | bool | Full arming without a code enabled / allowed. |
| `CanPartialArm` | bool | The panel supports partial arming. |
| `HasAnnex` | bool | There is a second partition (annex). |
| `HasHumidityReading` | bool | There are humidity sensors (SAS only). **If false, do not request `/humidity`.** |
| `HasVideo`, `Video` | bool, `None\|Ordered\|Installed` | Video product (Alarm.com), outside this API. |
| `Locks` | `[{ Label, Id, Serial, Manufacturer, Model, Status, SoundLevel, AutoLockEnabled, LastChanged, SelectedLanguage, HoldBackLatch }]` | Same content as `GetLockStatus`. |
| `Smartplugs` | `[{ Id, Label, PanelId, SerialNo, Status, Consumption, TimerActive, LastChanged, Manufacturer, … }]` | Same content as `GetSmartplugStatus`. |
| `Temperatures` | `[{ Label, SerialNo, Temprature }]` | Legacy flat list. **The misspelled `Temprature` is the real key.** |
| `Photos` | `[{ Id, Label }]` | Photo cameras (legacy list). `Id` is the `deviceId` for the legacy `TakePicture`. |
| `Access` | string[] | The user's permissions on this panel: `AlarmSystemSettings`, `AppUserSettings`, `CanAdministratePeople`, `ChangeVideoConsent`, `ChimeSettings`, `ContactPersons`, `Directions`, `LockSettings`, `PanelUsers`, `Photos`, `SecurityQuestion`, `SmartplugSettings`, `Smartplugs`, `Wifi`. |
| `Capabilities` | string[] | `CanModifyPanelWhileArmed`, `CanScanForWifi`, `DanalockHoldBackLatch`, `ScheduledSmartPlugs` (automations exist), `WifiScanning`. |
| `Wifi` | `{ WifiExist: bool, Serial }` | |
| `ArcVideoConsent`, `AdcVideoProduct` | | Video. |
| `SupportsPanelUsers`, `SupportsTemporaryPanelUsers`, `SupportsRegisterDevices`, `CanAddDoorLock`, `CanAddSmartplug` | bool | Enrollment capabilities (mostly TC). |
| `PropertyContact` | object? | Contact person. |
| `LockLanguage` | string | Voice language of the locks. |

How the app decides what to show, useful for hiding what the panel does not have:

- Locks: `Locks` not empty. Smart plugs: `Smartplugs` not empty and `Access` contains `Smartplugs`. Photo cameras: `Photos` not empty and `Access` contains `Photos`.
- Temperature: `Temperatures` not empty (TC) or vs2 telemetry (SAS). Humidity: `HasHumidityReading`.
- Doors and windows: SAS only. Automations: SAS with `Capabilities` ⊇ `ScheduledSmartPlugs`.
- Annex: on TC it is a separate product (`HasAnnex`); on SAS it appears as a second area of the state (§4).

Recommended cadence: once per hour. The inventory changes very rarely.

### 3.3 Capabilities · **official app**

`GET /api/vs2/alarmsystems/panels/{panelId}/capabilities` → `["ScheduledSmartPlugs", …]`. Same values as `GetPanel.Capabilities`; it adds nothing new.

### 3.4 House structure without sensors · **official app**

`GET /api/vs2/alarmsystems/panels/{panelId}/properties` →

```json
{ "sections": [ { "id": "1", "name": "Ground floor", "key": "GROUND_FLOOR_PLACE",
  "places": [ { "id": "11", "name": "Kitchen", "friendlyName": "Cocina", "key": "KITCHEN_PLACE", "index": 0 } ] } ] }
```

Floors and rooms only. Devices come in the *property plans* of §6. Renaming a room: `PUT …/properties/places/{placeId}/friendlyname` `{ "friendlyName": "Cocina" }` (write; fails with `panel_is_armed` if armed).

---

## 4. Alarm state

### 4.1 State by areas (new family) · **verified**

```
GET /api/v3/panels/{panelId}/state
```

```json
{
  "isOnline": true,
  "timeZoneName": "Europe/Madrid",
  "panelTimeZoneOffset": 60,
  "areas": [
    {
      "id": 0,
      "state": "Disarmed",
      "stateLastChangedAtUtc": "2026-11-08T09:12:33Z",
      "canPartialArm": true,
      "name": "Area 1",
      "friendlyName": null,
      "translationKey": "AREA_1_KEY"
    }
  ]
}
```

- `areas[].state`: `Unknown | Disarmed | ArmedPartial | ArmedTotal`. Equivalence with the legacy codes: Disarmed = 1, ArmedPartial = 2, ArmedTotal = 3.
- `areas[].translationKey`: `AREA_1_KEY` (main), `AREA_2_KEY`, `ANNEX`. A normal panel has **one** area; with an annex, two. Treat the `AREA_1_KEY` one as the main area or, if it is missing, the first one.
- `areas[].id`: integer that must be sent back when arming (§5). In the app's demo data and in its widget the main area is `0`, but do not take it for granted: always use the `id` returned by this read.
- `isOnline` is the only connectivity indicator. There is **no** "ready to arm" field and no list of open zones: for that you have to look at the sensors (§6).
- `stateLastChangedAtUtc` lets you show "armed for 3 h".
- `timeZoneName` is the panel's time zone. The legacy history timestamps come in that zone.

Validate that `areas` is an array; if not, the panel is TC and you must use 4.2. This is the cheapest read and the one worth polling most frequently.

### 4.2 Legacy state · **verified**

```
GET /api/Panel/GetPanelStatus?panelId={panelId}
```

```json
{
  "IsOnline": true,
  "Status": 1,
  "AnnexStatus": 0,
  "StatusTime": "2026-11-08T10:12:33",
  "StatusTimeUtc": "2026-11-08T09:12:33Z",
  "TimeZoneName": "Europe/Madrid",
  "PanelTimeZoneOffset": 60
}
```

`Status` arrives as an integer (1 disarmed, 2 partial, 3 total) according to the community integrations; the app's DTOs type it as the string `Disarmed | ArmedPartial | ArmedTotal | Unknown`, so accept both. `AnnexStatus` likewise, for the annex (`0`/`Unknown` if there is none). `StatusTime` is in the panel's local time without offset; `StatusTimeUtc` in UTC.

---

## 5. Arming and disarming (write)

### 5.1 New family · **official app** (implemented in this project; not exercised against the real panel, which is used read-only)

```
POST /api/v3/panels/{panelId}/areas/{areaId}/arm
POST /api/v3/panels/{panelId}/areas/{areaId}/partialArm
POST /api/v3/panels/{panelId}/areas/{areaId}/disarm

{ "userCode": "1234" }
```

- `areaId` is the area `id` from §4.1 (the annex is armed with the same endpoint and its own `id`).
- With quick arm (`QuickArmEnabled`) the app sends `{ "userCode": "" }` for `arm`. Disarming always requires a code.
- Response `200`: the **complete new state**, with the same shape as `GET …/state`. There is no need to read the state again.
- `403` = wrong code. `405` or `412` = panel busy (retry in a few seconds). `503`/`504` = systems not responding.

### 5.2 Legacy family · **community**

```
POST /api/Panel/Arm          { "PanelId": "…", "PanelCode": "1234" }
POST /api/Panel/PartialArm   { "PanelId": "…", "PanelCode": "1234" }
POST /api/Panel/Disarm       { "PanelId": "…", "PanelCode": "1234" }
```

Empty response. Use these only if the new family returns 404 (TC panel). App 3.87.0 no longer contains them, but the community integrations were using them in 2026.

---

## 6. The house: doors, windows, sensors, climate and cameras

### 6.1 The "property plan" model (new family)

All device reads of the new family return the same hierarchy:

```
areas[]            alarm partition (integer id, translationKey AREA_1_KEY / ANNEX)
 └ sections[]      floor or zone (string id, name, friendlyName, translationKey PlaceKey)
    └ places[]     room (string id, name, friendlyName, translationKey, placeNumber)
       └ components[]  devices (slotId, serialNumber, name, type, typeName, mountType, mountIndex, info{…})
```

Naming rules (the same as the app):

1. Room or floor: `friendlyName` if not null; otherwise the translation of `translationKey` (table §13.1 or the server dictionary); if the key is `UNKNOWN`/`UNKNOWN_EMPTY` or unknown, the `name` field.
2. Device: `components[].name` is usually **generic English** ("Contact and Shock Detector", "Camera Motion Detector", or the floor and the room: "basement indoor garage"). It is not usable as a user-facing label. Use `mountType` + `mountIndex` ("Ventana 2", "Puerta 1") for doors and windows, and the translated type from `typeName` for the rest.
3. **The same `serialNumber` appears in several plans** because a physical sensor has several functions: the window "CS-01" is in the doors plan as `MagneticContact` (contact) and in the temperature plan as `VibrationSensor` with a temperature reading. A good client merges them into a single physical device with several functions.
4. `type` (integer) exists but the app never uses it; the id-to-name table is not known. Use `typeName`.

`typeName` (the app's `ComponentType` enum, serialized by exact name):

| `typeName` | What it is | Dashboard function |
| --- | --- | --- |
| `MagneticContact` | Magnetic door or window contact | opening |
| `MagAndGate` | Contact for an exterior door or gate | opening |
| `VibrationSensor` | Shock or vibration sensor (in the combined contacts) | shock, temperature |
| `TemperatureFloodMagnetDetector` | Combined temperature + flood + opening sensor | leak, temperature |
| `FloodDetector` | Flood detector | leak, temperature |
| `SmokeDetector`, `SmokeDetectorSync` | Smoke detector (the `Sync` one is interconnected) | smoke, temperature, humidity |
| `InfraredMotionDetector` | Motion detector without camera | motion |
| `CameraPIR`, `OutdoorCameraPIR` | Motion detector with camera (indoor / outdoor) | photo camera |
| `GlassBreakDetector` | Glass break | |
| `PanicButton` | Panic button | |
| `Keypad` | Keypad | |
| `Remote` | Remote control | |
| `Siren`, `SmartSiren`, `SmartSirenV2` | Sirens | |
| `VoiceBox` | Voice module | |
| `Unknown` | Reserved | |

**There is no dedicated endpoint for smoke, flood, motion, sirens or keypads in the new family.** They appear as components inside the temperature telemetry (because they all carry a thermometer) and in the battery plan. To list them you have to walk `/temperature`.

### 6.2 Doors and windows · **verified**

```
GET /api/vs2/alarmsystems/v3/panels/{panelId}/components/doorsandwindows/propertyplan
```

Example (observed shape):

```json
{
  "areas": [ { "id": 0, "name": "Area 1", "friendlyName": null, "translationKey": "AREA_1_KEY",
    "sections": [ { "id": "s-1", "name": "basement", "friendlyName": null, "translationKey": "BASEMENT_PLACE",
      "places": [ { "id": "p-7", "name": "meeting room", "friendlyName": null, "translationKey": "MEETING_ROOM_PLACE", "placeNumber": 7,
        "components": [
          { "slotId": "12", "serialNumber": "1234567", "name": "Contact and Shock Detector", "type": 5, "typeName": "MagneticContact",
            "mountType": "WINDOW", "mountIndex": 2,
            "info": { "batteryLow": false, "closed": false, "alarm": false, "lastChanged": "2026-11-08T08:40:11Z", "chimeSettings": { "enabled": false } } }
        ] } ] } ] } ],
  "totalAreasCount": 1, "totalSectionsCount": 2, "totalPlacesCount": 6
}
```

- `mountType`: `"DOOR"` | `"WINDOW"`. `mountIndex`: number of the door or window within the room.
- `info.closed`: contact state. `info.alarm`: the sensor is in alarm. `info.lastChanged`: last change (ISO UTC). `info.batteryLow`. `info.chimeSettings.enabled`: acoustic chime on opening.
- This `info` does **not** carry `bypass`, `supervision` or `active`; those arrive through the temperature plan for the same `serialNumber`.
- Related write: `PATCH …/doorsandwindows/{serialNumber}` `{ "chimeSettings": { "enabled": true } }` (doors only, SAS only, fails if armed). **official app**.

Legacy fallback · **verified**: `POST /api/housecheck/doorsandwindows` `{ "PanelId": "…" }` →
`{ "Floors": [ { "Name", "Key", "Rooms": [ { "Name", "FriendlyName", "Key", "Index", "Devices": [ { "Id", "Name", "Type": 1, "Closed", "LowBattery", "Alarm", "SerialString", "LastChanged", "MountIndex", "MountType", "ChimeSettings": { "Status", "Sound" } } ] } ] } ] }`. `Type`: 0 unknown, 1 magnetic contact, 2 lock.

### 6.3 Temperature (and the rest of the sensors) · **verified**

```
GET /api/vs2/telemetry/panels/{panelId}/temperature
```

Same hierarchy, with averages per level and an empty series per component:

```json
{
  "averageTemperature": 20.1, "totalAreasCount": 1, "totalSectionsCount": 2, "totalPlacesCount": 6,
  "areas": [ { "id": 0, "translationKey": "AREA_1_KEY", "averageTemperature": 20.1, "query": null,
    "sections": [ { "id": "s-1", "name": "basement", "translationKey": "BASEMENT_PLACE", "averageTemperature": 19.8,
      "places": [ { "id": "p-3", "name": "indoor garage", "translationKey": "INDOOR_GARAGE_PLACE", "placeNumber": 3, "averageTemperature": 19, "temperatures": null,
        "components": [
          { "slotId": "4", "serialNumber": "2345678", "name": "basement indoor garage", "type": 1, "typeName": "SmokeDetector", "mountType": null, "mountIndex": null,
            "info": { "active": true, "batteryLow": false, "batterySent": false, "batteryCritical": false, "bypass": false, "supervision": false, "temperature": 19, "temperatures": null } },
          { "slotId": "9", "serialNumber": "3456789", "name": "Camera Motion Detector", "typeName": "CameraPIR",
            "info": { "active": true, "batteryLow": false, "bypass": false, "supervision": false, "temperature": null } }
        ] } ] } ] } ]
}
```

- `info.temperature`: **integer in °C**, current reading. It can be `null` on devices without a thermometer (cameras, keypads), which still appear here: that is why this read serves to inventory all sensors.
- `info.supervision`: `true` = **the sensor is not communicating with the panel** (supervision failure). Any other data from that sensor is stale; show it as "no data".
- `info.bypass`: bypassed (excluded from arming). `info.active`: active. `info.batteryLow`, `info.batteryCritical`, `info.batterySent` (a replacement battery has already been shipped, see §7).
- `averageTemperature` at area, floor, room and total level. Rooms with several sensors give useful averages.

Legacy fallback (TC) · **verified**: `POST /api/v2/housecheck/temperatures` `{ "PanelId" }` → `{ "Sections": [ { "Name", "Key", "Places": [ { "Name", "Key", "Components": [ { "Label", "SerialNo", "Temperature", "LowBattery", "Type", "MountType", "MountIndex" } ] } ] } ] }` (on some accounts the list arrives directly as an array of floors). Last fallback: `GET /api/Panel/GetTemperatures?panelId=` → `[ { "Label", "SerialNo", "Temprature": "21" } ]` (string, misspelling included). Smoke and leaks on TC: `POST /api/v2/housecheck/smokedetectors` and `POST /api/v2/housecheck/leakagedetectors` with `{ "PanelId" }`, same `Sections/Places/Components` shape.

### 6.4 Humidity · **verified**

```
GET /api/vs2/telemetry/panels/{panelId}/humidity
```

Identical to temperature, replacing `averageTemperature` → `averageHumidity`, `temperatures` → `humidities`, `info.temperature` → `info.humidity` (integer, % RH). Only smoke detectors (`SmokeDetector`) measure humidity. **Request it only if `GetPanel.HasHumidityReading` is true.**

Legacy fallback: `GET /api/housecheck/panels/{panelId}/humidity`.

### 6.5 Temperature and humidity history · **verified**

```
GET /api/vs2/telemetry/panels/{panelId}/temperature/history
      ?From=2026-11-07T10:00:00.000Z&To=2026-11-08T10:00:00.000Z&Granularity=Hourly&IncludeComponents=true
GET /api/vs2/telemetry/panels/{panelId}/humidity/history?…
```

| Parameter | Values | Notes |
| --- | --- | --- |
| `From`, `To` | ISO 8601 with zone (`Z` or `+01:00`) | URL-encoded. |
| `Granularity` | `Hourly` · `Hourly_2h` · `Daily` | The app uses Hourly for 24 h (25 points), Hourly_2h for 6 days (73 points) and Daily for 35 days (36 points). Other combinations are untested. |
| `IncludeComponents` | `true` / `false` | With `true` each component carries its own series. |
| `PlaceId` | room id (optional) | Restricts to one room. |
| `ComponentId` | `serialNumber` (optional) | Restricts to one sensor. |

Response: the same structure as §6.3 with the series filled in: `places[].temperatures: [ { "ts": "2026-11-08T09:00:00Z", "value": 20.5 } ]` (room average) and `components[].info.temperatures: [ … ]` (each sensor), plus an echo of the query in `areas[].query`. For humidity, `humidities`. The `value` fields are decimals.

Cost: one request per range and magnitude. Cache for at least 20 minutes: the server aggregates by the hour.

### 6.6 Temperature alert thresholds · **verified**

```
GET  /api/vs2/telemetry/panels/{panelId}/temperaturealerts            → [ … ]   (404 ⇒ the account does not have them)
GET  /api/vs2/telemetry/panels/{panelId}/temperaturealerts?roomId={placeId}
POST /api/vs2/telemetry/panels/{panelId}/temperaturealerts            { without id }   → alert with id   (write)
PUT  /api/vs2/telemetry/panels/{panelId}/temperaturealerts            { with id }      → empty           (write)
DELETE /api/vs2/telemetry/panels/{panelId}/temperaturealerts/{alertId}            → empty           (write)
```

```json
[ { "id": "7b1c…", "panelId": "01234567", "roomId": "p-3", "sensorId": null, "thresholdHigh": 28, "thresholdLow": 15 } ]
```

- `roomId` = `places[].id`. `sensorId` = the component's `serialNumber`, or `null` to watch the **room average**.
- Integer thresholds in °C, either of the two can be `null`. An alert fires when `t > thresholdHigh` or `t < thresholdLow`.
- The alert is generated by the backend as push or email (type `home.event.type.climate.alert`, §8). **It leaves no trace in the event history**: a client that wants to show it has to compare it with the current reading itself.

### 6.7 Photo cameras · **verified**

```
GET /api/vs2/alarmsystems/v3/panels/{panelId}/components/cameras/propertyplan
```

Same hierarchy. Component: `{ slotId, serialNumber, name, type, typeName: "CameraPIR" | "OutdoorCameraPIR", mountType: null, mountIndex: null, info: { active, batteryLow, bypass, supervisionAlarm } }`. Note that here the communication failure is called `supervisionAlarm`, not `supervision`.

Legacy fallback · **verified**: `GET /api/v2/housecheck/cameras/{panelId}` → flat list or `Floors/Rooms/Devices` tree with `{ Id, Label, SerialNo }`. Alternative: `GetPanel.Photos`.

### 6.8 Photo on demand · **verified**

```
GET /api/vs2/alarmsystems/v3/panels/{panelId}/components/cameras/{serialNumber}/takepicture
```

Response `{ "image": "<JPEG en base64>" }` (about 25 KB). **It takes between 20 and 30 seconds** because the camera takes the photo and uploads it through the panel; the app uses a 120 s read timeout. Make the request in the background with a progress indicator.

- It is only allowed with the system (or the area) **fully armed**; otherwise an error with the text `photo_only_when_fully_armed` or `area_system_must_be_fully_armed`. Other errors: `camera_is_busy`, `systems_are_not_responding`.
- It costs one request of the budget per photo.
- Legacy fallback (TC): `GET /api/Panel/TakePicture?panelId={panelId}&deviceId={Photos[].Id}` → `{ "Image": "<base64>" }`.
- The community endpoint `POST /api/camera/GetCameraImage` **does not exist** (404 in 2026). Do not use it.

Live video is a separate product (Alarm.com) that lives in the "Sector Alarm Video" app; this API only reports its status (`GetPanel.Video`, `AdcVideoProduct`) and its incidents in the history (`adc_*` events).

---

## 7. Batteries: replacement program · **verified**

```
GET /api/vs2/battery-replacement/panels/{panelId}         (SAS)
GET /api/vs1/battery-replacement/panels/{panelId}         (TC)
POST /api/vs2/battery-replacement/panels/{panelId}/sync   → empty; forces a resync (light write)
```

```json
{
  "panelId": "01234567",
  "generatedAt": "2026-11-08T10:00:00Z",
  "shipments": [
    {
      "taskGuid": "…", "taskCreatedAt": "2026-11-01T09:00:00Z", "address": "Calle … 12, Madrid",
      "areas": [ { "id": 0, "translationKey": "AREA_1_KEY", "sections": [ { "id": "s-2", "translationKey": "GROUND_FLOOR_PLACE",
        "places": [ { "id": "p-5", "translationKey": "KITCHEN_PLACE", "components": [
          { "slotId": "6", "serialNumber": "4567890", "name": "ground floor kitchen", "typeName": "SmokeDetector", "mountType": null, "mountIndex": null,
            "info": { "instructionsUri": "https://vimeo.com/868271112", "additionalInstructions": null, "batteryType": "1x CR123A (3 V)", "batterySent": true, "batteryRestored": false, "supervision": false } }
        ] } ] } ] } ]
    }
  ]
}
```

- A panel with no low batteries returns `shipments: []`. A 404 means the account does not have the program.
- Each *shipment* is a delivery of replacement batteries that Sector creates automatically on detecting a low battery. `batterySent` = already shipped; `batteryRestored` = the sensor reported a good battery again.
- `batteryType` and `instructionsUri` (video) are useful for showing instructions.
- The TC variant carries `shipments[].components[] { zoneId, zoneName, serialNumber, typeName, info }` without hierarchy and adds `lowBatteryAt`, `criticallyLowBatteryAt`, `expirationDate`.

The instantaneous battery flags (`batteryLow`, `batteryCritical`) are in the plans of §6; this endpoint adds the logistics. In the history they appear as `low-battery`, `critically-low-battery-reminder`, `battery-status-restored` (program) and `supervisory-status-lowbattery`/`supervisory-status-restored` (the sensor shut down due to a depleted battery), with `SensorInformation.BatterySent`.

---

## 8. Push and email notifications · **verified**

### 8.1 Reading the matrix

```
POST /api/Settings/GetNotificationSettings
{ "panelId": "01234567" }
```

```json
[
  { "Channel": "push", "TranslationKey": "notification_push_header",
    "Events": [
      { "EventType": "home.event.type.local", "TranslationKey": "notification_event_arm_disarm", "Enabled": true },
      { "EventType": "home.event.type.equip.battery", "TranslationKey": "notification_event_battery", "Enabled": true },
      { "EventType": "home.event.type.local.bypass.openEntry", "TranslationKey": "notification_event_armed_with_open_entrance", "Enabled": false },
      { "EventType": "home.event.type.climate.alert", "TranslationKey": "notification_event_climate", "Enabled": true },
      { "EventType": "logs.type.communication", "TranslationKey": "notification_event_internet", "Enabled": true },
      { "EventType": "home.event.type.ddl", "TranslationKey": "notification_event_lock", "Enabled": true },
      { "EventType": "home.event.type.mains", "TranslationKey": "notification_event_power", "Enabled": true },
      { "EventType": "home.event.type.video", "TranslationKey": "notification_event_video", "Enabled": false }
    ] },
  { "Channel": "email", "TranslationKey": "notification_email_header", "Events": [ … ] }
]
```

Channels: `push`, `email`. Event types and meaning:

| `EventType` | Notifies about |
| --- | --- |
| `home.event.type.local` | arming and disarming |
| `home.event.type.equip.battery` | low battery |
| `home.event.type.local.bypass.openEntry` | armed with an open entrance |
| `home.event.type.climate.alert` | temperature alert (§6.6) |
| `logs.type.communication` | loss or recovery of the panel's internet connection |
| `home.event.type.ddl` | locks |
| `home.event.type.mains` | mains power |
| `home.event.type.video` | video camera incidents |

### 8.2 Changing a notification (write) · **official app** (implemented; not exercised against the real account)

```
POST /api/Settings/ToggleNotificationSetting
{ "PanelId": "01234567", "Channel": "push", "EventType": "home.event.type.ddl", "Enabled": false }
```

Empty response. Note the mixed casing: `panelId` when reading, `PanelId` when writing.

---

## 9. Event history · **verified**

```
GET /api/v2/panel/logs?panelId={panelId}&PageSize=80&PageNumber=1
```

Parameter names are case-insensitive (`panelid`, `pageNumber`, `pageSize` also work). `PageNumber` starts at 1. The app requests 80 per page. There are no filters by date or type; filter on the client.

```json
{
  "Records": [
    { "EventType": "armed", "User": "Marcos", "Channel": "App", "LockName": null, "Time": "2026-11-07T07:45:12+01:00",
      "UserTranslationKey": null, "SensorInformation": null,
      "AreaInfo": { "Area": 0, "AreaName": "Casa", "AreaKey": "AREA_1_KEY" } },
    { "EventType": "low-battery", "User": null, "Channel": null, "LockName": null, "Time": "2026-11-06T22:10:00+01:00",
      "UserTranslationKey": null,
      "SensorInformation": { "DeviceType": "MagneticContact", "MountType": "WINDOW", "MountIndex": 2, "SectionKey": "BASEMENT_PLACE", "PlaceKey": "MEETING_ROOM_PLACE", "PlaceIndex": 7, "BatterySent": false },
      "AreaInfo": null },
    { "EventType": "unlock", "User": "Ana", "Channel": "Keypad", "LockName": "Puerta principal", "Time": "2026-11-06T18:02:40+01:00" }
  ],
  "TotalRecords": 523, "TotalPages": 7, "PageSize": 80
}
```

- `Time`: on SAS panels, ISO with offset; on TC panels it may come **without offset**, in the panel's local time (`timeZoneName` from §4). Support both forms.
- `User`: who performed the action. `UserTranslationKey`: key when the "user" is the system (schedule, monitoring center). `Channel`: where it was done from (`App`, `Keypad`, remote, etc.; free-form string).
- `SensorInformation` locates the sensor: `DeviceType` (the `typeName` enum from §6.1), `MountType`, `MountIndex`, `SectionKey` and `PlaceKey` (keys from §13.1), `PlaceIndex`, `BatterySent`.
- `AreaInfo` identifies the partition on panels with an annex.

### 9.1 `EventType` taxonomy

Compare in lower case and without hyphens or underscores: the server mixes `mains_restored` and `mainsrestore`, `low-battery` and `battery_low`.

**Arming and locks**

| `EventType` | Meaning |
| --- | --- |
| `armed` | Fully armed |
| `partialarmed` | Partially armed |
| `disarmed` | Disarmed |
| `armed_and_lock`, `partialarmed_and_lock` | Armed with lock engaged |
| `disarmed_and_unlock` | Disarmed with unlock |
| `armedannex`, `disarmedannex` | Annex armed / disarmed |
| `lock`, `unlock` | Lock locked / unlocked |
| `lock_failed`, `output_failed_to_lock` | Failed to lock |
| `time_zone_bypass` | Scheduled arming skipped ("skip today", §10) |
| `time_zone_arming_fail` | Scheduled arming failed |

**Smart plugs**: `output_activated` (switched on), `output_deactivated` (switched off).

**Batteries and supervision**: `battery_low`, `battery_restored` (locks and door sensors), `low-battery`, `critically-low-battery-reminder`, `battery-status-restored` (replacement program), `supervisory-status-lowbattery` (sensor shut down due to a depleted battery), `supervisory-status-restored`.

**Power and internet**: `mains` (mains power failure), `mains_restored` / `mainsrestore`, `internet_lost`, `internet_restored`.

**Tests**: `zone_fire_test` (smoke detector test).

**Alarms**: `alarm_{burglary|smoke|flood|panic|assistance}_{confirmed|dispatched|not_confirmed}`. `burglary` intrusion, `smoke` smoke, `flood` water leak, `panic` panic, `assistance` voice unit. `confirmed` = emergency confirmed by the monitoring center; `dispatched` = emergency services dispatched; `not_confirmed` = no threat.

**Video (Alarm.com)**: `adc_<problem>` and `adc_<problem>_restore`, with problem ∈ `battery_charging_trouble`, `depleted_battery`, `device_addition`, `device_deletion`, `device_low_battery`, `high_temperature_alert`, `low_battery_and_low_temperature_alert`, `malfunction`, `poor_internet_connectivity_error`, `video_analytics_rule_not_configured`, `video_device_hardware_malfunction`, `video_device_no_ddns_messages`, `video_device_not_responding`, `video_uploads_quota_exceeded`.

The app discards any type it does not know. A custom client does better by showing it with the raw name.

What does **not** appear in the history: door openings and closings (only `lastChanged` in §6.2), temperature readings, temperature alerts, changes to automation rules.

---

## 10. Automations · **verified**

Scheduled rules and event rules from the official app. All routes carry the header **`X-Api-Version: 2`**; without it the server responds with another version or an error. A 404 on `/Rules` means the panel has no automations (no `ScheduledSmartPlugs`, or TC platform).

### 10.1 Scheduled rules

```
GET /api/vs2/automations/panels/{panelId}/Rules
X-Api-Version: 2
```

```json
{
  "restriction": { "maxRules": 10 },
  "rules": [
    {
      "id": "3f2a…", "name": "Noche",
      "when": { "time": "23:00", "weekdays": { "monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": false, "sunday": false } },
      "action": { "type": "ArmStateChange", "stateChange": "DisarmToPartialArm" },
      "isNew": false, "canBeSkipped": true, "willBeSkipped": false, "remainingTime": 43200,
      "smartPlugSlotIds": []
    },
    {
      "id": "9c0e…", "name": "Luz porche",
      "when": { "time": "19:30", "weekdays": { … } },
      "action": { "type": "SmartPlugStateChange", "stateChange": "On" },
      "isNew": false, "canBeSkipped": true, "willBeSkipped": true, "remainingTime": 31000,
      "smartPlugSlotIds": ["9"]
    }
  ]
}
```

- `when.time`: panel local time, `HH:mm`. `weekdays`: seven booleans.
- `action.type`: `ArmStateChange` | `SmartPlugStateChange`. `action.stateChange`: `DisarmToArm`, `DisarmToPartialArm`, `PartialToDisarm` for arming; `On`, `Off` for smart plugs. `smartPlugSlotIds` are the `slotId` values of the affected plugs.
- `canBeSkipped` / `willBeSkipped`: the next execution can be skipped / is skipped. `remainingTime`: seconds until the next execution at the time of the read.
- `restriction.maxRules`: maximum number of rules the server allows.

Writes:

```
PUT    /api/vs2/automations/panels/{panelId}/Rules/{ruleId}/skip   → the updated rule    · official app ("skip today"; implemented, not exercised)
POST   /api/vs2/automations/panels/{panelId}/Rules                 { name, when, action, smartPlugSlotIds } · official app
PUT    /api/vs2/automations/panels/{panelId}/Rules/{ruleId}        { name, when, action, smartPlugSlotIds } · official app
DELETE /api/vs2/automations/panels/{panelId}/Rules/{ruleId}        · official app
```

RFC 7807 errors with `type` `https://id.sectoralarm.cloud/problems/automations/panel_is_armed` or `…/maximum_automation_rules_reached`. A skipped execution appears in the history as `time_zone_bypass`; a failed one as `time_zone_arming_fail`.

### 10.2 Event rules

```
GET /api/vs2/automations/panels/{panelId}/Events
X-Api-Version: 2
```

```json
{
  "arm":        { "smartPlugs": [ { "slotId": "9", "action": "Off" } ] },
  "partialArm": { "smartPlugs": [ { "slotId": "9", "action": "Nothing" } ] },
  "disarm":     { "smartPlugs": [ { "slotId": "9", "action": "On" } ] },
  "alarm":      { "smartPlugs": [ { "slotId": "9", "action": "On" } ] }
}
```

What each smart plug does on arm, partial arm, disarm or when the alarm triggers. `action`: `Nothing | On | Off`. Write: `PATCH …/Events/{arm|partialArm|disarm|alarm}` · **official app**. Only smart plugs can be actions of event rules; there are no conditions, sensors or solar triggers.

---

## 11. Locks and smart plugs (legacy family, also on SAS)

### 11.1 Locks · **verified**

```
GET /api/Panel/GetLockStatus?panelId={panelId}
```

```json
[ { "Label": "Puerta principal", "Id": 1, "Serial": "ABC123", "Manufacturer": "Danalock", "Model": "V3",
    "Status": "lock", "SoundLevel": 2, "AutoLockEnabled": true, "LastChanged": "2026-11-08T09:00:00",
    "SelectedLanguage": { "Id": "1", "Language": "Spanish" }, "HoldBackLatch": 0 } ]
```

- `Status`: `"lock"` | `"unlock"`; any other value is unknown. Some responses carry `BatteryLow`/`LowBattery`; the app's DTO does not have it, so treat it as optional.
- `SoundLevel`: 0 off, 1 low, 2 high, −1 unknown.
- It costs one request. The app reads it when opening the locks screen; the main screen uses `GetPanel.Locks`.

Write · **community**:

```
POST /api/Panel/Lock     { "PanelId": "…", "PanelCode": "1234", "LockSerial": "ABC123", "SerialNo": "ABC123", "Platform": "app" }
POST /api/Panel/Unlock   (same body)
```

App 3.87.0 sends the keys in camelCase (`panelId`, `panelCode`, `lockSerial`, `platform: "app"`); the server accepts both, and sending `LockSerial` and `SerialNo` at the same time covers both historical variants. Empty response; `403` = wrong code. Lock settings (`SetLockSettings`, `SetLockLanguage`) require an SMS code: **do not implement**.

### 11.2 Smart plugs · **verified**

```
GET /api/Panel/GetSmartplugStatus?panelId={panelId}
```

```json
[ { "Id": "9", "Label": "Lámpara porche", "PanelId": "01234567", "SerialNo": "0123ABCD", "Consumption": null,
    "DisplayScenarios": false, "Status": "Off", "TimerActive": false, "LastChanged": "2026-11-08T09:00:00",
    "TimerEvents": [], "TimerEventsSchedule": [], "Manufacturer": "Indoor SmartPlug" } ]
```

`Status` is compared in lower case: `on | off | unreachable | disconnected | unknown`. `Id` is the `switchId` for the commands. `Manufacturer` distinguishes `Indoor SmartPlug` / `Outdoor SmartPlug`.

Write · **community / official app** (no panel code, via query string and without a body):

```
POST /api/Panel/TurnOnSmartplug?switchId={Id}&panelId={panelId}
POST /api/Panel/TurnOffSmartplug?switchId={Id}&panelId={panelId}
```

Other writes in the app: `POST /api/settings/setsmartpluglabel` `{ panelId, serial, label }`; enrollment and removal `POST`/`DELETE /api/vs2/alarmsystems/panels/{panelId}/components/smartplugs[/{plugId}]`. The legacy timer `Settings/SetSmartplugDetails` seems obsolete: the current schedules are the automations of §10.

---

## 12. Persons, invoices and other account data

### 12.1 Persons with access to the panel · **verified**

```
GET /api/persons/panels/{panelId}         (404 ⇒ TC platform; use POST /api/Settings/GetPanelUsers, not implemented)
```

Example (observed shape):

```json
[
  {
    "PersonId": "a1b2…", "FirstName": "Marcos", "LastName": "Martínez", "Initials": "MM",
    "PhoneNumber": "+34600000000", "HasVerifiedEmail": true,
    "RemoteControlSerialNumber": 4471022,
    "Tag": { "Color": "blue" },
    "Accesses": { "IsLegalOwner": true, "IsAdminUser": true, "IsAppUser": true, "IsSystemUser": true, "IsChild": false, "FeatureAccesses": ["Smartplugs"] }
  },
  { "PersonId": "c3d4…", "FirstName": "Ana", "LastName": "López", "Initials": "AL", "Tag": null, "RemoteControlSerialNumber": null, "HasVerifiedEmail": false,
    "Accesses": { "IsLegalOwner": false, "IsAdminUser": false, "IsAppUser": true, "IsSystemUser": true, "IsChild": false, "FeatureAccesses": [] } }
]
```

On the observed account the server responded in **PascalCase** (`PersonId`, `Accesses`), although the app's DTOs are in camelCase (`id`, `access`): accept both. Role: `IsLegalOwner` legal owner, `IsAdminUser` administrator, `IsChild` minor, otherwise user. `IsAppUser` can sign in to the app; `IsSystemUser` has a panel code. `Tag.Color` is the key tag color (`BLACK | BLUE | GREEN | RED | YELLOW`, may arrive in lower case). `RemoteControlSerialNumber` is the assigned remote control.

Related (**official app**, read): `GET /api/persons/me` → `{ PersonId, FirstName, LastName, Initials, Email, PhoneNumber }`; `GET /api/vs2/alarmsystems/v3/panels/{panelId}/users/{personId}/remotecontrols` → `{ active, enabled, lowBattery, serialNumber }`; `GET /api/panels/{panelId}/persons/{personId}/keytag` → `{ KeytagColor }`. All person writes require SMS: **do not implement**.

### 12.2 Invoices · **verified**

```
GET /api/Account/GetInvoices
```

```json
[ { "invoiceNumber": "F2026-11-0001", "year": 2026, "month": 11, "status": "NOT_PAID", "Overdue": false, "hasDebt": false },
  { "invoiceNumber": "F2026-10-0001", "year": 2026, "month": 10, "status": "PAID", "Overdue": false, "hasDebt": false } ]
```

`status`: `PAID | NOT_PAID | ENDED | UNKNOWN`. Note the capitalized `Overdue` next to the lower-case `hasDebt`: accept both spellings on every field. It belongs to the account, not the panel. Related · **official app**: `GET /api/Account/GetInvoice?id={invoiceNumber}` (PDF), `GET /api/account/invoice/payments/current` → `[ { "InvoiceId" } ]`, `POST …/payments/initiate { invoiceId }` → `{ PaymentLink }`.

### 12.3 In-app notices (communications hub) · **official app, do not implement blind**

`GET /api/notifications/panels/{panelId}/communications?ff={featureFlags}&vendor={SAS|TC}` → `[ { id, panelId, type: INFO|WARNING|ERROR, priority, headlineKey, shortDescriptionKey, closable, enabled, code, campaignCode, action } ]`; `POST …/communications/dismiss { ids: [] }`. These are marketing and status banners (2G/3G shutdown, invoices, campaigns). The format of the `ff` parameter could not be determined.

### 12.4 Account feature flags · **official app**

`GetUser.User.Features[]` may contain, among others: `AlarmsInAppHistory`, `BatteryReplacement`, `ChimeSettings`, `InvoiceInApp`, `MultipleAreaArming`, `PropertyPlaceFriendlyName`, `ScheduledFullArming`, `SmartPlugAlarmAutomation`, `SupervisionInApp`, `VideoEventsInApp`, `VideoRecordingAutomation`. They tell you which history events and which screens make sense for that account.

### 12.5 Out of scope for an unattended client · **do not implement**

Everything that asks for an SMS code (`ValidationCode`, `smsCode`, `X-Validation-Code` header): monitoring center contacts (`Settings/GetContactPersons`), panel users and codes, Wi-Fi (`GetWifiNetworks`, `ConnectToWifi`, `…/connections/wifi/scan` with a 180 s wait), lock settings, video consent, per-person video access, security question, SOS button (`/api/emergencies/*`, needs GPS), registration and onboarding.

---

## 13. Translation tables

### 13.1 `PlaceKey` (rooms, floors and areas)

Value that arrives in `translationKey` (or `key`, `SectionKey`, `PlaceKey`, `AreaKey`). Serialized by exact name; the first four floors start with a digit and `2RD_FLOOR_PLACE` carries the misspelling on the server.

| Key | Spanish label | Key | Spanish label |
| --- | --- | --- | --- |
| `AREA_1_KEY` | Casa | `AREA_2_KEY`, `ANNEX`, `ANNEX_PLACE` | Anexo |
| `GROUND_FLOOR_PLACE` | Planta baja | `FIRST_FLOOR_PLACE`, `1ST_FLOOR_PLACE` | Primera planta |
| `SECOND_FLOOR_PLACE`, `2RD_FLOOR_PLACE` | Segunda planta | `THIRD_FLOOR_PLACE`, `3RD_FLOOR_PLACE` | Tercera planta |
| `FOURTH_FLOOR_PLACE`, `4TH_FLOOR_PLACE` | Cuarta planta | `BASEMENT_PLACE` | Sótano |
| `ATTIC_PLACE` | Buhardilla | `OUTDOOR_PLACE` | Exterior |
| `LIVING_ROOM_PLACE` | Salón | `DRAWING_ROOM_PLACE` | Sala de estar |
| `TV_ROOM_PLACE` | Sala de TV | `HOME_THEATER_PLACE` | Cine en casa |
| `KITCHEN_PLACE` | Cocina | `DINING_ROOM_PLACE` | Comedor |
| `DINING_AREA_PLACE` | Zona de comedor | `FOOD_STORAGE_PLACE` | Despensa |
| `BEDROOM_PLACE` | Dormitorio | `MASTER_BEDROOM_PLACE` | Dormitorio principal |
| `GUEST_BEDROOM_PLACE` | Dormitorio de invitados | `KIDS_ROOM_PLACE` | Cuarto de los niños |
| `BEDROOM_HALLWAY_PLACE` | Pasillo de dormitorios | `HALLWAY_PLACE` | Pasillo |
| `ENTRYWAY_PLACE` | Entrada | `STAIRS_PLACE` | Escalera |
| `BATHROOM_PLACE` | Baño | `TOILET_PLACE` | Aseo |
| `OFFICE_PLACE` | Despacho | `LIBRARY_PLACE` | Biblioteca |
| `PLAY_ROOM_PLACE` | Cuarto de juegos | `CRAFTS_ROOM_PLACE` | Cuarto de manualidades |
| `GYM_PLACE` | Gimnasio | `BAR_PLACE` | Bar |
| `FIREPLACE_PLACE` | Chimenea | `LAUNDRY_ROOM_PLACE` | Lavadero |
| `DRESSING_ROOM_PLACE`, `WALK_IN_CLOSET_PLACE` | Vestidor | `WARDROBE_PLACE` | Armario |
| `STORAGE_ROOM_PLACE` | Trastero | `GUN_SAFE_PLACE` | Armero |
| `CELLAR_PLACE` | Bodega | `WINE_CELLAR_PLACE` | Bodega de vinos |
| `BOILER_HOUSE_PLACE` | Cuarto de calderas | `TECHNICAL_ROOM_PLACE` | Cuarto técnico |
| `IT_SERVER_ROOM_PLACE` | Sala de servidores | `GARAGE_PLACE` | Garaje |
| `INDOOR_GARAGE_PLACE` | Garaje interior | `WORKSHOP_PLACE` | Taller |
| `SHED_PLACE` | Cobertizo | `BIKE_SHED_PLACE` | Caseta de bicis |
| `GUEST_HOUSE_PLACE` | Casa de invitados | `RENTAL_PLACE` | Alquiler |
| `GARDEN_ROOM_PLACE` | Cuarto de jardín | `CONSERVATORY_PLACE` | Galería |
| `TERRACE_PLACE` | Terraza | `BALCONY_PLACE` | Balcón |
| `FRONT_GARDEN_PLACE` | Jardín delantero | `BACK_GARDEN_PLACE` | Jardín trasero |
| `POOL_PLACE` | Piscina | `RECEPTION_PLACE` | Recepción |
| `SHOP_PLACE` | Tienda | `RESTAURANT_PLACE` | Restaurante |
| `EMPLOYEE_LOUNGE_PLACE` | Sala de empleados | `MEETING_ROOM_PLACE` | Sala de reuniones |
| `SHOWROOM_PLACE` | Exposición | `WAITING_ROOM_PLACE` | Sala de espera |
| `OTHER_PLACE` | Otro | `UNPLACED_PLACE` | Sin ubicar |
| `UNKNOWN`, `UNKNOWN_EMPTY` | use the `name` field | | |

### 13.2 `typeName` Spanish labels

| `typeName` | Spanish label |
| --- | --- |
| `MagneticContact` | Contacto magnético |
| `MagAndGate` | Contacto de puerta exterior |
| `VibrationSensor` | Sensor de vibración |
| `TemperatureFloodMagnetDetector` | Sensor de temperatura, inundación y apertura |
| `FloodDetector` | Detector de inundación |
| `SmokeDetector` | Detector de humo |
| `SmokeDetectorSync` | Detector de humo interconectado |
| `InfraredMotionDetector` | Detector de movimiento |
| `CameraPIR` | Detector con cámara |
| `OutdoorCameraPIR` | Detector exterior con cámara |
| `GlassBreakDetector` | Detector de rotura de cristal |
| `PanicButton` | Botón de pánico |
| `Keypad` | Teclado |
| `Remote` | Mando a distancia |
| `Siren`, `SmartSiren`, `SmartSirenV2` | Sirena |
| `VoiceBox` | Módulo de voz |

Generic `components[].name` values seen on the real panel and their type: "Contact and Shock Detector" → contact and shock; "Camera Motion Detector" → camera with motion detector; "Flood Detector"; "Keypad"; `<floor> <room>` (e.g. "basement indoor garage") → smoke detector with climate.

---

## 14. Errors

| HTTP | Meaning | What to do |
| --- | --- | --- |
| 401 | Expired session or invalid credentials | Renew the token once and retry; if it repeats, ask for credentials. |
| 403 | **Wrong panel code** (arming, locks) or, on login, blocked account | Show "wrong code"; do not renew the session. |
| 404 | The route does not exist for this panel or account | Switch to the legacy route or treat the feature as nonexistent. Remember it for the session. |
| 405, 412 | Panel busy | Retry after a few seconds. |
| 408 | Timeout | Retry. |
| 426 | The client (the app) must be updated | Try another `API-Version`. |
| 429 | Hourly request limit | Stop until the next full hour. There is no `Retry-After`. |
| 503, 504 | Systems not responding | Retry later. |

Observed error bodies: RFC 7807 `{ "type", "title", "status", "detail", "instance" }` with a `type` such as `https://id.sectoralarm.cloud/problems/crow-alarm-system/panel_is_armed`, `…/automations/maximum_automation_rules_reached`, `…/2fa/wrong_pincode`; or the legacy `{ "StatusCode", "IsSuccessStatusCode", "ReasonPhrase", "Error" }`; or `{ "error", "error_description" }`. 403 error keys the app recognizes: `wrong_pincode`, `invalid_or_expired_pin`, `to_many_attempts`, `user_blocked`.

Success responses without a body (empty `200`/`204`) are normal on writes. Some routes return plain text instead of JSON: try `JSON.parse` and, if it fails, keep the text.

---

## 15. Budget and recommended cadences

With 60 requests per hour shared with the mobile app, a client should stay below about 40. What this project uses:

| Block | Routes | Cost | Cadence | Requests/hour |
| --- | --- | --- | --- | --- |
| State | `/api/v3/panels/{id}/state` | 1 | 150 s | 24 |
| Locks and smart plugs | `GetLockStatus`, `GetSmartplugStatus` | 2 | 10 min | 12 |
| House | `doorsandwindows/propertyplan`, `/temperature`, `/humidity` (when applicable), `cameras/propertyplan` | 3 to 4 | 30 min | 6 to 8 |
| History | `/api/v2/panel/logs` | 1 | 10 min | 6 |
| Inventory and batteries | `GetPanel`, `battery-replacement` | 2 | 60 min | 2 |
| **Total** | | | | **≈ 50** |

On-demand reads, cached: climate history (20 min), temperature alerts (20 min), automations (30 min, 2 requests), notifications (1 h), persons (1 h), invoices (1 h), text dictionary (session). A camera photo costs 1.

Tips:

- Read **`doorsandwindows/propertyplan` first**: if it returns 404 the panel is TC and you save the other new routes; go straight to the legacy ones (which cost 6 instead of 4).
- With the new family, the house reads are independent: fire them in parallel.
- After arming, do not read the state again: the response already carries it.
- A full startup cycle costs about 10 requests. If the user switches panels, another 10.
- Never poll per second or per render. A single timer that decides which blocks are due on each tick avoids overlaps.

---

## 16. Client skeleton

Pseudocode of the minimal flow this project uses, valid for any language:

```
login()                                   # POST /api/Login/Login → token
panels = GET /api/account/GetPanelList
panel  = GET /api/Panel/GetPanel?panelId=…        # vendor, hasHumidity, inventory
texts  = GET /api/Account/GetTextByCultureAndPlatform?platform=Android&culture=es-ES   # optional

every 150 s:   state = GET /api/v3/panels/{id}/state   (404 → GET /api/Panel/GetPanelStatus)
every 10 min:  locks = GET /api/Panel/GetLockStatus ; plugs = GET /api/Panel/GetSmartplugStatus
every 30 min:  doors = GET …/doorsandwindows/propertyplan      (404 → legacy: housecheck ×5 + cameras)
               temp  = GET …/telemetry/…/temperature
               hum   = GET …/telemetry/…/humidity              (only if panel.HasHumidityReading)
               cams  = GET …/cameras/propertyplan
               merge by serialNumber → physical devices; supervision=true ⇒ "no data"
every 10 min:  logs  = GET /api/v2/panel/logs?panelId=…&PageSize=50&PageNumber=1
every 60 min:  panel = GET /api/Panel/GetPanel ; batteries = GET …/battery-replacement/panels/{id}

arm action: POST /api/v3/panels/{id}/areas/{areaId}/arm {userCode}  → apply the response as the state
any 429: block everything until the next full hour
any 401: login() and retry once
```

The TypeScript reference implementation is in `src/shared/sector/client.ts` (HTTP), `normalize.ts` and `normalize-v2.ts` (response shapes and field aliases), `places.ts` (tables) and `session.ts` (cadences and cache). `docs/official-app-api.md` contains the exhaustive analysis of the decompiled app, with APK file paths, for anyone who needs to go further.

---

## 17. What remains unknown

1. The table between the numeric component `type` and `typeName`.
2. The format of the communications hub's `ff` parameter.
3. The possible values of `Channel` and `UserTranslationKey` in the history (free-form strings).
4. Whether the legacy routes `POST /api/Panel/Arm|PartialArm|Disarm` still exist for SAS panels (it was never necessary to test them: v3 responds).
5. Whether `GET /api/Account/GetTextByCultureAndPlatform` includes the `PlaceKey` keys among its texts (the dictionary loads, but the key-by-key check has not been done).
6. Exactly how long the legacy login token lasts (`exp` is decoded on every session instead of assuming it).
