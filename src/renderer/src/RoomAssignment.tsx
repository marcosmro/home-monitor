import { roomKey } from "../../shared/climate";
import {
  floorSections,
  location,
  reportsNoRoom,
  type Device,
  type Preferences,
} from "../../shared/model";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

/**
 * Assigns `deviceId` to the inventory room of `source`, or clears the
 * assignment when `source` is undefined. Free-text groups are cleared so the
 * assignment takes effect and the device joins that room's row.
 */
export function assignRoom(
  prefs: Preferences,
  deviceId: string,
  source?: Device,
): Preferences {
  const {
    floor: _floor,
    room: _room,
    placeFloorId: _a,
    placeRoomId: _b,
    placeFloor: _c,
    placeFloorEs: _d,
    placeRoom: _e,
    placeRoomEs: _f,
    ...rest
  } = prefs.aliases[deviceId] || {};
  const alias = source
    ? {
        ...rest,
        placeFloorId: source.floorId,
        placeRoomId: source.roomId,
        placeFloor: source.floor,
        ...(source.floorEs ? { placeFloorEs: source.floorEs } : {}),
        placeRoom: source.room,
        ...(source.roomEs ? { placeRoomEs: source.roomEs } : {}),
      }
    : rest;
  return { ...prefs, aliases: { ...prefs.aliases, [deviceId]: alias } };
}

/** One representative device per inventory room, grouped by floor. */
export function inventoryRooms(devices: Device[]) {
  const rooms = new Map<string, Device>();
  for (const d of devices)
    if (!reportsNoRoom(d) && !rooms.has(roomKey(d))) rooms.set(roomKey(d), d);
  return [...rooms.values()];
}

export function RoomAssignment({
  device,
  devices,
  prefs,
  onSave,
}: {
  device: Device;
  devices: Device[];
  prefs: Preferences;
  onSave: (prefs: Preferences) => void;
}) {
  const { t } = useLanguage();
  const spanish = prefs.names === "spanish";
  // Grouped under the same floor names, in the same order, as the sensor
  // list. Without an id, one sensor's own alias cannot rename its whole room.
  const floorName = (d: Device) => location({ ...d, id: "" }, prefs).floor;
  const roomName = (d: Device) => (spanish && d.roomEs) || d.room;
  const rooms = inventoryRooms(devices);
  const floors = floorSections(
    rooms.map((d) => ({ ...d, id: "" })),
    prefs,
  );
  const alias = prefs.aliases[device.id];
  const custom = !!(alias?.floor || alias?.room);
  const value =
    alias?.placeFloorId && alias.placeRoomId
      ? roomKey({ floorId: alias.placeFloorId, roomId: alias.placeRoomId })
      : reportsNoRoom(device) || custom
        ? ""
        : roomKey(device);
  const missing = reportsNoRoom(device) && !value && !custom;
  return (
    <div className={`room-assignment ${missing ? "is-missing" : ""}`}>
      <label>
        {t("Room")}
        <select
          aria-label={t("Room")}
          value={value}
          onChange={(e) => {
            const source = rooms.find((d) => roomKey(d) === e.target.value);
            onSave(
              assignRoom(
                prefs,
                device.id,
                source && roomKey(source) !== roomKey(device)
                  ? source
                  : undefined,
              ),
            );
          }}
        >
          {(reportsNoRoom(device) || custom) && (
            <option value="">
              {custom ? t("Custom group") : t("Not assigned")}
            </option>
          )}
          {floors.map((floor) => (
            <optgroup key={floor} label={floor}>
              {rooms
                .filter((d) => floorName(d) === floor)
                .map((d) => (
                  <option key={roomKey(d)} value={roomKey(d)}>
                    {roomName(d)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {missing && (
        <p>
          <Icon name="info" size={13} />
          {t(
            "The alarm does not report a room for this device. Choose one here, or place it on the floor plan.",
          )}
        </p>
      )}
    </div>
  );
}
