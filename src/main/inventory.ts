import { ApiError, type SectorApi } from "./api";
import { plan, legacyPlan } from "../shared/normalize";
import { climatePlan, type Climate } from "../shared/climate";
import type { Device } from "../shared/model";

/** Capability detection follows the working reference client: modern reads
 * first, remember a 404 per endpoint, never infer availability from Vendor. */
export class InventoryReader {
  private legacy = new Set<string>();
  climate?: Climate;
  constructor(
    private api: SectorApi,
    private panelId: string,
  ) {}
  get legacyTelemetry() {
    return this.legacy.has("telemetry");
  }
  private get id() {
    return encodeURIComponent(this.panelId);
  }
  private async read(
    key: string,
    modern: () => Promise<Device[]>,
    fallback: () => Promise<Device[]>,
  ) {
    if (this.legacy.has(key)) return fallback();
    try {
      return await modern();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
      this.legacy.add(key);
      return fallback();
    }
  }
  contacts() {
    return this.read(
      "contacts",
      async () =>
        plan(
          await this.api.request(
            `/api/vs2/alarmsystems/v3/panels/${this.id}/components/doorsandwindows/propertyplan`,
          ),
          "contacts",
          new Date().toISOString(),
        ),
      async () =>
        legacyPlan(
          await this.api.request("/api/housecheck/doorsandwindows", {
            PanelId: this.panelId,
          }),
          "contacts",
          new Date().toISOString(),
          "MagneticContact",
        ),
    );
  }
  telemetry() {
    return this.read(
      "telemetry",
      async () => {
        const raw = await this.api.request(
          `/api/vs2/telemetry/panels/${this.id}/temperature`,
        );
        const at = new Date().toISOString();
        const devices = plan(raw, "telemetry", at);
        this.climate = climatePlan(raw, at);
        return devices;
      },
      async () => {
        this.climate = undefined;
        if (!this.legacy.has("temperature-v2")) {
          try {
            const devices = legacyPlan(
              await this.api.request("/api/v2/housecheck/temperatures", {
                PanelId: this.panelId,
              }),
              "telemetry",
              new Date().toISOString(),
              "Temperature",
            );
            if (devices.length) return devices;
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 404) throw e;
            this.legacy.add("temperature-v2");
          }
        }
        return legacyPlan(
          await this.api.request(
            `/api/Panel/GetTemperatures?panelId=${this.id}`,
          ),
          "telemetry",
          new Date().toISOString(),
          "Temperature",
        );
      },
    );
  }
  cameras() {
    return this.read(
      "cameras",
      async () =>
        plan(
          await this.api.request(
            `/api/vs2/alarmsystems/v3/panels/${this.id}/components/cameras/propertyplan`,
          ),
          "cameras",
          new Date().toISOString(),
        ),
      async () =>
        legacyPlan(
          await this.api.request(`/api/v2/housecheck/cameras/${this.id}`),
          "cameras",
          new Date().toISOString(),
          "CameraPIR",
        ),
    );
  }
  async smoke() {
    return legacyPlan(
      await this.api.request("/api/v2/housecheck/smokedetectors", {
        PanelId: this.panelId,
      }),
      "smoke",
      new Date().toISOString(),
      "SmokeDetector",
    );
  }
  async flood() {
    return legacyPlan(
      await this.api.request("/api/v2/housecheck/leakagedetectors", {
        PanelId: this.panelId,
      }),
      "flood",
      new Date().toISOString(),
      "FloodDetector",
    );
  }
}
