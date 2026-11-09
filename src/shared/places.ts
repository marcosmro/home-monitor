/**
 * Room and floor names from the new API ("property plan").
 *
 * For areas, sections (floors) and places (rooms) the API returns a
 * `translationKey` with one of these values and, if the user renamed it,
 * a `friendlyName`. The official app shows `friendlyName`, otherwise the
 * translation of the key and, if the key is unknown, the `name` field.
 * List extracted from the Android app 3.87.0 (PlaceKey enum).
 */
export const PLACE_NAMES: Record<string, string> = {
  OTHER_PLACE: "Otro",
  UNPLACED_PLACE: "Sin ubicar",
  AREA_1_KEY: "Casa",
  AREA_2_KEY: "Anexo",
  ANNEX: "Anexo",
  ANNEX_PLACE: "Anexo",
  BIKE_SHED_PLACE: "Caseta de bicis",
  GARAGE_PLACE: "Garaje",
  INDOOR_GARAGE_PLACE: "Garaje interior",
  WORKSHOP_PLACE: "Taller",
  SHED_PLACE: "Cobertizo",
  RENTAL_PLACE: "Alquiler",
  GUEST_HOUSE_PLACE: "Casa de invitados",
  GARDEN_ROOM_PLACE: "Cuarto de jardín",
  CONSERVATORY_PLACE: "Galería",
  TERRACE_PLACE: "Terraza",
  BALCONY_PLACE: "Balcón",
  FRONT_GARDEN_PLACE: "Jardín delantero",
  BACK_GARDEN_PLACE: "Jardín trasero",
  ATTIC_PLACE: "Buhardilla",
  BAR_PLACE: "Bar",
  BASEMENT_PLACE: "Sótano",
  BATHROOM_PLACE: "Baño",
  BEDROOM_PLACE: "Dormitorio",
  MASTER_BEDROOM_PLACE: "Dormitorio principal",
  GUEST_BEDROOM_PLACE: "Dormitorio de invitados",
  KIDS_ROOM_PLACE: "Cuarto de los niños",
  BEDROOM_HALLWAY_PLACE: "Pasillo de dormitorios",
  BOILER_HOUSE_PLACE: "Cuarto de calderas",
  CELLAR_PLACE: "Bodega",
  WINE_CELLAR_PLACE: "Bodega de vinos",
  CRAFTS_ROOM_PLACE: "Cuarto de manualidades",
  DINING_ROOM_PLACE: "Comedor",
  DINING_AREA_PLACE: "Zona de comedor",
  DRAWING_ROOM_PLACE: "Sala de estar",
  LIVING_ROOM_PLACE: "Salón",
  TV_ROOM_PLACE: "Sala de TV",
  HOME_THEATER_PLACE: "Cine en casa",
  DRESSING_ROOM_PLACE: "Vestidor",
  WALK_IN_CLOSET_PLACE: "Vestidor",
  WARDROBE_PLACE: "Armario",
  ENTRYWAY_PLACE: "Entrada",
  HALLWAY_PLACE: "Pasillo",
  STAIRS_PLACE: "Escalera",
  FIREPLACE_PLACE: "Chimenea",
  FOOD_STORAGE_PLACE: "Despensa",
  STORAGE_ROOM_PLACE: "Trastero",
  GUN_SAFE_PLACE: "Armero",
  GYM_PLACE: "Gimnasio",
  KITCHEN_PLACE: "Cocina",
  LAUNDRY_ROOM_PLACE: "Lavadero",
  LIBRARY_PLACE: "Biblioteca",
  OFFICE_PLACE: "Despacho",
  PLAY_ROOM_PLACE: "Cuarto de juegos",
  POOL_PLACE: "Piscina",
  TECHNICAL_ROOM_PLACE: "Cuarto técnico",
  IT_SERVER_ROOM_PLACE: "Sala de servidores",
  TOILET_PLACE: "Aseo",
  RECEPTION_PLACE: "Recepción",
  SHOP_PLACE: "Tienda",
  RESTAURANT_PLACE: "Restaurante",
  EMPLOYEE_LOUNGE_PLACE: "Sala de empleados",
  MEETING_ROOM_PLACE: "Sala de reuniones",
  SHOWROOM_PLACE: "Exposición",
  WAITING_ROOM_PLACE: "Sala de espera",
  OUTDOOR_PLACE: "Exterior",
  GROUND_FLOOR_PLACE: "Planta baja",
  FIRST_FLOOR_PLACE: "Primera planta",
  "1ST_FLOOR_PLACE": "Primera planta",
  SECOND_FLOOR_PLACE: "Segunda planta",
  "2RD_FLOOR_PLACE": "Segunda planta",
  THIRD_FLOOR_PLACE: "Tercera planta",
  "3RD_FLOOR_PLACE": "Tercera planta",
  FOURTH_FLOOR_PLACE: "Cuarta planta",
  "4TH_FLOOR_PLACE": "Cuarta planta",
};

/**
 * Server text dictionary (`GET /api/Account/GetTextByCultureAndPlatform`),
 * the same one the official app uses. When loaded, it takes precedence over the
 * tables in this file; otherwise the built-in translations are used.
 */
let serverTexts: Record<string, string> = {};

export function setServerTexts(
  dict: Record<string, string> | null | undefined,
): void {
  serverTexts = dict && typeof dict === "object" ? dict : {};
}

export const serverTextCount = (): number => Object.keys(serverTexts).length;

/** Server text for a key (tries the key as is and in lowercase). */
export function serverText(key: unknown): string | undefined {
  if (typeof key !== "string" || !key) return undefined;
  const v = serverTexts[key] ?? serverTexts[key.toLowerCase()];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Display name of an area, section or place, with the same priority as the official app. */
export function placeName(
  p: { friendlyName?: unknown; translationKey?: unknown; name?: unknown },
  fallback = "",
): string {
  const friendly =
    typeof p.friendlyName === "string" ? p.friendlyName.trim() : "";
  if (friendly) return friendly;
  const key = typeof p.translationKey === "string" ? p.translationKey : "";
  const fromServer = serverText(key);
  if (fromServer) return fromServer;
  if (key && PLACE_NAMES[key]) return PLACE_NAMES[key];
  const name = typeof p.name === "string" ? p.name.trim() : "";
  return name || fallback;
}

/**
 * Component types (`typeName`) returned by the new API, with their Spanish
 * names. List from the official app's ComponentType enum.
 */
export const COMPONENT_NAMES: Record<string, string> = {
  CameraPIR: "Detector con cámara",
  OutdoorCameraPIR: "Detector exterior con cámara",
  FloodDetector: "Detector de inundación",
  GlassBreakDetector: "Detector de rotura de cristal",
  Keypad: "Teclado",
  MagAndGate: "Contacto de puerta exterior",
  MagneticContact: "Contacto magnético",
  InfraredMotionDetector: "Detector de movimiento",
  PanicButton: "Botón de pánico",
  Remote: "Mando a distancia",
  Siren: "Sirena",
  SmartSiren: "Sirena inteligente",
  SmokeDetector: "Detector de humo",
  SmokeDetectorSync: "Detector de humo interconectado",
  TemperatureFloodMagnetDetector:
    "Sensor de temperatura, inundación y apertura",
  VibrationSensor: "Sensor de vibración",
  VoiceBox: "Módulo de voz",
  Unknown: "Dispositivo",
};

export const componentName = (
  typeName: unknown,
  fallback = "Dispositivo",
): string =>
  (typeof typeName === "string" && COMPONENT_NAMES[typeName]) || fallback;
