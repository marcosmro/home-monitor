import { useLanguage } from "./i18n";
import { useState } from "react";
import type { Snapshot } from "../../shared/model";
import { bridge } from "./bridge";
import { madrid } from "../../shared/time";
export function BudgetNotice({
  snap,
  available = false,
}: {
  snap: Snapshot;
  available?: boolean;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const budget = snap.requestBudget;
  if (
    !budget ||
    (!available &&
      !budget.localPaused &&
      !budget.override &&
      !budget.serverPaused)
  )
    return null;
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await bridge.setBudgetOverride(!budget!.override);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="banner warning budget-notice">
      <div>
        <strong>
          {budget.serverPaused
            ? t("Sector Alarm has paused requests")
            : budget.override
              ? t("Local request cap temporarily disabled")
              : budget.localPaused
                ? t("Paused at the app’s hourly request cap")
                : t("Hourly request cap")}
        </strong>
        <p>
          {budget.used} {t("requests this hour.")}{" "}
          {budget.serverPaused
            ? t(
                "The provider’s rate limit still applies; the local override cannot bypass it.",
              )
            : budget.override
              ? t(
                  "The 44-request cap returns at {0} Madrid or when the app restarts. Requests are still counted.",
                  madrid(budget.resetsAt),
                )
              : t(
                  "You can temporarily exceed the app’s 44-request cap. This may consume the allowance shared with your mobile app.",
                )}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      {(!budget.serverPaused || budget.override) && (
        <button disabled={busy} onClick={() => void toggle()}>
          {budget.override
            ? t("Restore request cap")
            : t("Override cap for this hour")}
        </button>
      )}
    </div>
  );
}
