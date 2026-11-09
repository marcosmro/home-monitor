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
            ? "Sector Alarm has paused requests"
            : budget.override
              ? "Local request cap temporarily disabled"
              : budget.localPaused
                ? "Paused at the app’s hourly request cap"
                : "Hourly request cap"}
        </strong>
        <p>
          {budget.used} requests this hour.{" "}
          {budget.serverPaused
            ? "The provider’s rate limit still applies; the local override cannot bypass it."
            : budget.override
              ? `The 44-request cap returns at ${madrid(budget.resetsAt)} Madrid or when the app restarts. Requests are still counted.`
              : "You can temporarily exceed the app’s 44-request cap. This may consume the allowance shared with your mobile app."}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      {(!budget.serverPaused || budget.override) && (
        <button disabled={busy} onClick={() => void toggle()}>
          {budget.override
            ? "Restore request cap"
            : "Override cap for this hour"}
        </button>
      )}
    </div>
  );
}
