import { useLanguage } from "./i18n";
import { Icon } from "./icons";
import type { Preferences, Snapshot } from "../../shared/model";
import { formatMinutes, powerStatus } from "../../shared/power";
import {
  inferredMinutes,
  type InferredOutage,
  type OutageSignal,
} from "../../shared/outages";
import { madrid } from "../../shared/time";

const signalText: Record<OutageSignal, string> = {
  plugs: "all smart plugs unreachable",
  panel: "alarm panel offline",
  internet: "home internet lost",
};
function useSignals() {
  const { t } = useLanguage();
  return (o: InferredOutage) =>
    o.signals.map((s) => t(signalText[s])).join(" · ");
}

/**
 * Banner for a power cut inferred from reachability. Hidden while the alarm
 * itself reports a mains failure, which is the stronger statement.
 */
export function InferredOutageNotice({
  snap,
  prefs,
  onSave,
}: {
  snap: Snapshot;
  prefs: Preferences;
  onSave: (p: Preferences) => void;
}) {
  const { t } = useLanguage();
  const signals = useSignals();
  const latest = snap.inferredOutages?.[0];
  if (!latest || powerStatus(snap.events)?.state === "out") return null;
  if (!latest.endedAt)
    return (
      <div className="banner error power-notice inferred" role="alert">
        <Icon name="alert" />
        <span>
          <strong>{t("Possible power cut")}</strong>{" "}
          {t(
            "Detected {0} (Madrid time): {1}.",
            madrid(latest.startedAt, true),
            signals(latest),
          )}{" "}
          {latest.lastOkAt &&
            `${t("Last seen reachable {0}.", madrid(latest.lastOkAt, true))} `}
          {t(
            "Inferred by this app; the alarm has not reported a mains failure.",
          )}
        </span>
      </div>
    );
  if (prefs.dismissedInferredCut === latest.startedAt) return null;
  const minutes = inferredMinutes(latest);
  return (
    <div className="banner warning power-notice inferred" role="status">
      <Icon name="alert" />
      <span>
        <strong>{t("Possible power cut ended")}</strong>{" "}
        {t(
          "Unreachable from {0} to {1} (Madrid time): {2}.",
          madrid(latest.startedAt, true),
          madrid(latest.endedAt, true),
          signals(latest),
        )}
        {minutes !== undefined &&
          ` ${t("About {0}, as seen by this app’s checks.", formatMinutes(minutes))}`}
      </span>
      <button
        aria-label={t("Dismiss possible power cut")}
        onClick={() =>
          onSave({ ...prefs, dismissedInferredCut: latest.startedAt })
        }
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

/** Settings section listing every inferred cut recorded on this computer. */
export function InferredOutageHistory({ snap }: { snap: Snapshot }) {
  const { t } = useLanguage();
  const signals = useSignals();
  const outages = snap.inferredOutages || [];
  return (
    <section className="outage-history">
      <h3>
        <Icon name="alert" /> {t("Possible power cuts")}
      </h3>
      <p>
        {t(
          "Inferred when every smart plug becomes unreachable or the alarm panel goes offline. Recorded on this computer only while the app is running; times are when the app checked, so short cuts can be missed.",
        )}
      </p>
      {outages.length === 0 ? (
        <p className="note">{t("None recorded so far.")}</p>
      ) : (
        <ol className="outage-list">
          {outages.map((o) => {
            const minutes = inferredMinutes(o);
            return (
              <li key={o.startedAt}>
                <strong>
                  {madrid(o.startedAt, true)} →{" "}
                  {o.endedAt ? madrid(o.endedAt, true) : t("ongoing")}
                </strong>
                <span>
                  {minutes !== undefined &&
                    `${t("about {0}", formatMinutes(minutes))} · `}
                  {signals(o)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
