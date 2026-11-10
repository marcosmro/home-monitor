import { useState } from "react";
import type { Preferences } from "../../shared/model";
import {
  temperatureColor,
  temperatureGradient,
  temperatureRange,
  validTemperatureRange,
} from "../../shared/temperature-scale";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";
export function TemperatureSettings({
  prefs,
  onSave,
}: {
  prefs: Preferences;
  onSave: (p: Preferences) => void;
}) {
  const { t } = useLanguage();
  const saved = temperatureRange(prefs.temperatureRange);
  const [min, setMin] = useState(String(saved.min));
  const [max, setMax] = useState(String(saved.max));
  const [applied, setApplied] = useState(false);
  const draft = { min: Number(min), max: Number(max) };
  const valid =
    min.trim() !== "" && max.trim() !== "" && validTemperatureRange(draft);
  const preview = valid ? draft : saved;
  return (
    <section className="temperature-settings">
      <h3>
        <Icon name="temperature" />
        {t("Temperature rings")}
      </h3>
      <p>
        {t(
          "Temperature colors use the original readings. Displayed temperatures are rounded to whole degrees.",
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            onSave({ ...prefs, temperatureRange: draft });
            setApplied(true);
          }
        }}
      >
        <div className="temperature-range-inputs">
          <label>
            {t("Cool end (°C)")}
            <input
              type="number"
              min={-50}
              max={79}
              step="0.5"
              value={min}
              onChange={(e) => {
                setMin(e.target.value);
                setApplied(false);
              }}
              required
            />
          </label>
          <label>
            {t("Warm end (°C)")}
            <input
              type="number"
              min={-49}
              max={80}
              step="0.5"
              value={max}
              onChange={(e) => {
                setMax(e.target.value);
                setApplied(false);
              }}
              required
            />
          </label>
        </div>
        <div className="temperature-preview">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const value = preview.min + f * (preview.max - preview.min);
            return (
              <span key={f}>
                <span
                  className="temperature-glyph"
                  style={{ borderColor: temperatureColor(value, preview) }}
                >
                  <i />
                </span>
                <small>{Math.round(value)}°</small>
              </span>
            );
          })}
        </div>
        <div
          className="temperature-gradient"
          style={{ background: temperatureGradient }}
        />
        <p className="note">
          {t(
            "Blue = cold · green = ideal ({0}°C) · orange = warm · red = hot. The ideal is the midpoint of your range.",
            Math.round((preview.min + preview.max) / 2),
          )}
        </p>
        <p className="note">
          {t(
            "Outside this range, colors stay at the cool or warm end. Missing readings have no ring; stale readings use a dashed ring. This changes the display only.",
          )}
        </p>
        {!valid && (
          <p role="alert">
            {t("Choose a range from −50 to 80°C, at least 1°C apart.")}
          </p>
        )}
        <button type="submit" disabled={!valid}>
          {t("Apply temperature range")}
        </button>
        {applied && (
          <span role="status" className="temperature-applied">
            {t("Temperature range applied")}
          </span>
        )}
      </form>
    </section>
  );
}
