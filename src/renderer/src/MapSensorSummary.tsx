import {
  deviceHealth,
  deviceIsStale,
  deviceState,
  deviceTone,
  displayDevice,
  isHealthy,
  reportsNoRoom,
  location,
  type Device,
  type Preferences,
  type Snapshot,
} from "../../shared/model";
import { temperatureIsStale, temperatureText } from "../../shared/climate";
import { madrid } from "../../shared/time";
import { Icon, deviceIcon, typeLabel } from "./icons";
import { useLanguage } from "./i18n";

export function MapSensorSummary({
  device,
  prefs,
  snap,
  now,
  onDetails,
}: {
  device: Device;
  prefs: Preferences;
  snap: Snapshot;
  now: number;
  onDetails: () => void;
}) {
  const { t } = useLanguage();
  const health = deviceHealth(device);
  const state = deviceState(device);
  const stale = deviceIsStale(device, snap.online, now);
  const tone = deviceTone(device, { stale, armed: snap.mode === "armed" });
  // The health pill reports the device itself; being open is not a fault.
  const healthTone =
    tone === "open" || tone === "open-armed"
      ? isHealthy(device)
        ? "healthy"
        : "attention"
      : tone;
  return (
    <aside className="map-sensor-summary" aria-label={t("Selected sensor")}>
      <span className={`map-sensor-symbol ${tone}`}>
        <Icon name={deviceIcon(device.type)} size={24} />
      </span>
      <span className="map-sensor-type">{t(typeLabel(device.type))}</span>
      <h3>{displayDevice(device, prefs)}</h3>
      <p className="map-sensor-room">
        {location(device, prefs).room} · {location(device, prefs).floor}
      </p>
      {reportsNoRoom(device) && !prefs.aliases[device.id]?.placeRoomId && (
        <p className="map-sensor-unassigned">
          {t("No room assigned yet. Choose one in Details or edit the plan.")}
        </p>
      )}
      <span className={`map-sensor-health ${healthTone}`}>
        {t(stale ? "Stale" : isHealthy(device) ? "Healthy" : health)}
      </span>
      {device.temperature !== undefined && (
        <div className="map-sensor-reading">
          <span>{t("Temperature")}</span>
          <strong>
            {temperatureText(device.temperature)}
            <small>C</small>
          </strong>
          <small>
            {t(
              temperatureIsStale(device, snap, now)
                ? "Last known"
                : "Latest reading",
            )}
          </small>
        </div>
      )}
      <dl>
        {state !== "Not reported" && (
          <div>
            <dt>{t("Activity")}</dt>
            <dd
              className={
                tone === "open" || tone === "open-armed" || tone === "alarm"
                  ? `map-sensor-state ${tone}`
                  : undefined
              }
            >
              {t(state)}
            </dd>
          </div>
        )}
        {stale && (
          <div>
            <dt>{t("Device health")}</dt>
            <dd>{t(health)}</dd>
          </div>
        )}
        {device.changedAt && (
          <div>
            <dt>{t("Last change")}</dt>
            <dd>{madrid(device.changedAt, true)}</dd>
          </div>
        )}
      </dl>
      <button onClick={onDetails}>
        {t("View details")}
        <Icon name="chevron" size={13} />
      </button>
    </aside>
  );
}
