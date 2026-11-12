import { useLanguage } from "./i18n";
import { Icon } from "./icons";
import type { Preferences, Snapshot } from "../../shared/model";
import { formatMinutes, outageMinutes, powerStatus } from "../../shared/power";
import { eventTime } from "../../shared/time";

/**
 * Mains power banner. An ongoing outage cannot be dismissed; a finished one
 * stays until dismissed, remembered per outage in the local preferences.
 */
export function PowerNotice({
  snap,
  prefs,
  onSave,
}: {
  snap: Snapshot;
  prefs: Preferences;
  onSave: (p: Preferences) => void;
}) {
  const { t } = useLanguage();
  const status = powerStatus(snap.events);
  if (!status) return null;
  if (status.state === "out")
    return (
      <div className="banner error power-notice" role="alert">
        <Icon name="alert" />
        <span>
          <strong>{t("Power is out")}</strong>{" "}
          {t(
            "The alarm reported a mains power failure on {0} (Madrid time) and no restoration since.",
            eventTime(status.lost!),
          )}{" "}
          {t("Activity checked")} {eventTime({ time: snap.eventsAt })}.
        </span>
      </div>
    );
  if (prefs.dismissedPower === status.key) return null;
  const minutes = outageMinutes(status);
  return (
    <div className="banner warning power-notice" role="status">
      <Icon name="alert" />
      <span>
        <strong>{t("Power was out")}</strong>{" "}
        {status.lost
          ? t(
              "Mains power failed on {0} and came back on {1} (Madrid time).",
              eventTime(status.lost),
              eventTime(status.restored!),
            )
          : t(
              "Mains power came back on {0} (Madrid time).",
              eventTime(status.restored!),
            )}
        {minutes !== undefined &&
          ` ${t("Out for {0}.", formatMinutes(minutes))}`}
      </span>
      <button
        aria-label={t("Dismiss power notice")}
        onClick={() => onSave({ ...prefs, dismissedPower: status.key })}
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
