import type { Snapshot, Device } from "./model";
export function demoSnapshot(): Snapshot {
  const now = Date.now(),
    at = new Date(now).toISOString();
  const devices: Device[] = [];
  const floors = [
    [
      "Ground floor",
      "Planta baja",
      ["Entrance", "Living room", "Kitchen", "Dining room"],
      ["Entrada", "Salón", "Cocina", "Comedor"],
    ],
    [
      "First floor",
      "Primera planta",
      ["Main bedroom", "Guest bedroom", "Study", "Landing"],
      [
        "Dormitorio principal",
        "Dormitorio de invitados",
        "Despacho",
        "Distribuidor",
      ],
    ],
    [
      "Lower ground",
      "Sótano",
      ["Garage", "Laundry", "Storage", "Garden access"],
      ["Garaje", "Lavadero", "Trastero", "Acceso al jardín"],
    ],
  ] as const;
  for (let f = 0; f < 3; f++)
    for (let r = 0; r < 4; r++)
      for (let j = 0; j < 4; j++) {
        const n = f * 16 + r * 4 + j;
        const types = [
          "MagneticContact",
          "MagneticContact",
          r % 2 ? "InfraredMotionDetector" : "SmokeDetector",
          "CameraPIR",
        ];
        const names = [
          "Window · left",
          "Window · right",
          r % 2 ? "Motion detector" : "Smoke detector",
          "Camera detector",
        ];
        const es = [
          "Ventana izquierda",
          "Ventana derecha",
          r % 2 ? "Detector de movimiento" : "Detector de humo",
          "Detector con cámara",
        ];
        devices.push({
          id: `demo-${n}`,
          original: n === 0 ? "Front door" : names[j],
          spanish: n === 0 ? "Puerta principal" : es[j],
          type: types[j],
          floorId: `f${f}`,
          floor: floors[f][0],
          floorEs: floors[f][1],
          roomId: `f${f}r${r}`,
          room: floors[f][2][r],
          roomEs: floors[f][3][r],
          closed: j < 2 ? ![5, 20, 45].includes(n) : undefined,
          alarm: false,
          batteryLow: [10, 26].includes(n),
          offline: n === 38 ? true : n === 46 ? undefined : false,
          active: true,
          changedAt:
            j < 2 ? new Date(now - (n + 1) * 720000).toISOString() : undefined,
          fetchedAt: at,
          source: j < 2 ? "contacts" : "telemetry",
          temperature: j === 2 ? 20 + f : undefined,
        });
      }
  return {
    demo: true,
    panelId: "demo-casa",
    name: "Casa en España",
    vendor: "SAS",
    online: true,
    mode: "armed",
    areas: [
      {
        id: 0,
        name: "Casa",
        mode: "armed",
        partial: true,
        changedAt: new Date(now - 7200000).toISOString(),
      },
    ],
    devices,
    keyTagPeople: [
      { name: "Marcos", firstName: "Marcos", color: "blue" },
      { name: "Ana", firstName: "Ana", color: "yellow" },
    ],
    events: [
      {
        id: "e1",
        type: "armed",
        description: "System fully armed",
        user: "Marcos",
        channel: "App",
        time: new Date(now - 7200000).toISOString(),
      },
      {
        id: "e2",
        type: "low-battery",
        description: "Low sensor battery",
        deviceId: "demo-10",
        time: new Date(now - 10800000).toISOString(),
      },
      {
        id: "e3",
        type: "disarmed",
        description: "System disarmed",
        user: "Ana",
        channel: "Keytag",
        time: new Date(now - 18000000).toISOString(),
      },
      {
        id: "e4",
        type: "internet_restored",
        description: "Internet connection restored",
        time: new Date(now - 30000000).toISOString(),
      },
    ],
    totalEvents: 4,
    statusAt: at,
    contactsAt: at,
    telemetryAt: at,
    eventsAt: at,
    warnings: {},
    readOnly: false,
    codeLength: 4,
    command: { phase: "idle", message: "" },
    requests: 0,
  };
}
