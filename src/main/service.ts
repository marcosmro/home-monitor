import { SectorApi, ApiError } from "./api";
import type { Snapshot, Action, Device } from "../shared/model";
import { demoSnapshot } from "../shared/demo";
import { state, mergeDevices, logs, panelList } from "../shared/normalize";
import { InventoryReader } from "./inventory";
import { CommandGate } from "../shared/commands";
export class Monitor {
  snap = demoSnapshot();
  private contacts: Device[] = [];
  private telemetry: Device[] = [];
  private gate = new CommandGate();
  private busy = false;
  private selecting = false;
  private legacyState = false;
  private inventory?: InventoryReader;
  private extras: Record<string, Device[]> = {};
  private lastAttempt: Record<string, number> = {};
  panels: Array<{ id: string; name: string }> = [];
  constructor(
    private api: SectorApi,
    private emit: (s: Snapshot) => void,
  ) {}
  publish() {
    this.snap.requests = this.snap.demo ? 0 : this.api.used;
    this.emit(structuredClone(this.snap));
    return this.snap;
  }
  async login(email: string, password: string) {
    if (this.gate.blocked || this.busy || this.selecting)
      throw new Error("Wait for the current operation.");
    this.busy = true;
    try {
      await this.api.login(email, password);
      const r = await this.api.request("/api/account/GetPanelList");
      this.panels = panelList(r);
      // A new identity must never poll the previous account's selected property.
      this.snap = demoSnapshot();
      this.contacts = [];
      this.telemetry = [];
      this.publish();
      return this.panels;
    } catch (error) {
      this.api.clear();
      this.panels = [];
      if (!this.snap.demo) {
        this.snap.readOnly = true;
        this.snap.warnings.status =
          "Sign-in failed. Last-known values retained; reconnect to continue.";
        this.publish();
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async select(id: string) {
    if (this.gate.blocked || this.busy || this.selecting)
      throw new Error("Wait for the current operation.");
    if (!this.panels.some((p) => p.id === id))
      throw new Error("Select an available property.");
    this.selecting = true;
    try {
      const p = await this.api.request(
        `/api/Panel/GetPanel?panelId=${encodeURIComponent(id)}`,
      );
      this.legacyState = false;
      this.inventory = new InventoryReader(this.api, id);
      this.extras = {};
      this.contacts = [];
      this.telemetry = [];
      this.lastAttempt = {};
      this.gate = new CommandGate();
      this.snap = {
        demo: false,
        panelId: id,
        name: p.DisplayName || "Home",
        vendor:
          typeof p.Vendor === "string" ? p.Vendor.toUpperCase() : "Unknown",
        mode: "unknown",
        areas: [],
        devices: [],
        events: [],
        totalEvents: 0,
        warnings: {},
        readOnly: true,
        codeLength: p.PanelCodeLength || 4,
        command: { phase: "idle", message: "" },
        requests: 0,
      };
      this.publish();
      return await this.refresh(true);
    } finally {
      this.selecting = false;
    }
  }
  async refresh(force = false) {
    if (this.snap.demo) {
      if (!Object.keys(this.snap.warnings).length) {
        const at = new Date().toISOString();
        this.snap.statusAt = at;
        this.snap.contactsAt = at;
        this.snap.telemetryAt = at;
        this.snap.devices.forEach((d) => {
          d.fetchedAt = at;
          if (d.temperature !== undefined) d.temperatureFetchedAt = at;
        });
      }
      return this.publish();
    }
    if (this.selecting && !force) return this.snap;
    if (this.busy) return this.snap;
    this.busy = true;
    try {
      const now = Date.now();
      const run = async (
        key: string,
        cadence: number,
        fn: () => Promise<void>,
      ) => {
        if (now - (this.lastAttempt[key] || 0) < (force ? 15000 : cadence))
          return;
        this.lastAttempt[key] = now;
        try {
          await fn();
          delete this.snap.warnings[key];
        } catch (e) {
          this.snap.warnings[key] = (e as Error).message;
        }
      };
      await run("status", 180000, () => this.readState());
      if (!this.inventory)
        throw new Error("Select a property to load inventory.");
      await run("contacts", 900000, async () => {
        this.contacts = await this.inventory!.contacts();
        this.snap.contactsAt = new Date().toISOString();
      });
      await run("telemetry", 900000, async () => {
        this.telemetry = await this.inventory!.telemetry();
        this.snap.telemetryAt = new Date().toISOString();
        this.snap.climate = this.inventory!.climate;
      });
      // Camera-only devices must not disappear when absent from telemetry.
      await run("cameras", 1800000, async () => {
        this.extras.cameras = await this.inventory!.cameras();
      });
      if (this.inventory.legacyTelemetry) {
        await run("smoke", 1800000, async () => {
          this.extras.smoke = await this.inventory!.smoke();
        });
        await run("flood", 1800000, async () => {
          this.extras.flood = await this.inventory!.flood();
        });
      }
      await run("events", 600000, async () => {
        const r = await this.api.request(
          `/api/v2/panel/logs?panelId=${encodeURIComponent(this.snap.panelId)}&PageSize=80&PageNumber=1`,
        );
        this.snap.events = logs(
          r,
          mergeDevices(this.contacts, [
            ...this.telemetry,
            ...Object.values(this.extras).flat(),
          ]),
        );
        this.snap.totalEvents =
          Number(r.TotalRecords) || this.snap.events.length;
        this.snap.eventsAt = new Date().toISOString();
      });
      const previousOrder = new Map(this.snap.devices.map((d, i) => [d.id, i]));
      this.snap.devices = mergeDevices(
        this.contacts.map((d) => ({
          ...d,
          stale: !!this.snap.warnings.contacts,
        })),
        [...this.telemetry, ...Object.values(this.extras).flat()].map((d) => ({
          ...d,
          stale: !!this.snap.warnings[d.source],
          temperatureStale:
            d.temperature !== undefined
              ? !!this.snap.warnings[d.source]
              : undefined,
        })),
      );
      this.snap.devices.sort(
        (a, b) =>
          (previousOrder.get(a.id) ?? Infinity) -
          (previousOrder.get(b.id) ?? Infinity),
      );
      return this.publish();
    } finally {
      this.busy = false;
    }
  }
  private async readState() {
    const id = encodeURIComponent(this.snap.panelId);
    let r: any;
    if (this.legacyState)
      r = await this.api.request(`/api/Panel/GetPanelStatus?panelId=${id}`);
    else
      try {
        r = await this.api.request(`/api/v3/panels/${id}/state`);
        if (!Array.isArray(r?.areas))
          throw new ApiError(
            "The modern alarm-state response was not recognized. Last-known state retained.",
          );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          this.legacyState = true;
          r = await this.api.request(`/api/Panel/GetPanelStatus?panelId=${id}`);
        } else throw e;
      }
    Object.assign(this.snap, state(r), { statusAt: new Date().toISOString() });
  }
  readOnly(value: boolean) {
    if (this.gate.blocked) throw new Error("Resolve the command first.");
    if (typeof value !== "boolean") throw new Error("Invalid setting");
    this.snap.readOnly = value;
    return this.publish();
  }
  async command(action: Action, code: string, area: number) {
    if (!["arm", "partialArm", "disarm"].includes(action))
      throw new Error("Unsupported action.");
    if (this.busy || this.selecting)
      throw new Error("Wait for refresh to finish.");
    if (this.snap.readOnly)
      throw new Error("Enable live controls in connection settings first.");
    if (!this.snap.demo && this.legacyState)
      throw new Error("Legacy alarm controls are not supported.");
    const a = this.snap.areas.find((x) => x.id === area);
    if (!a || (action === "partialArm" && !a.partial))
      throw new Error("This alarm mode is not available.");
    if (
      this.snap.online !== true ||
      a.mode === "unknown" ||
      !this.snap.statusAt ||
      !Number.isFinite(Date.parse(this.snap.statusAt)) ||
      Date.now() - Date.parse(this.snap.statusAt) > 240000 ||
      this.snap.warnings.status
    )
      throw new Error("Refresh the alarm state before sending a command.");
    if (
      !this.snap.demo &&
      !new RegExp(`^\\d{${this.snap.codeLength}}$`).test(code)
    )
      throw new Error(`Enter the ${this.snap.codeLength}-digit panel code.`);
    this.gate.begin(action, area);
    this.snap.command = { phase: "sending", message: "Sending command…" };
    this.publish();
    try {
      if (this.snap.demo) {
        await new Promise((r) => setTimeout(r, 600));
        this.snap.command = {
          phase: "awaiting",
          message: "Awaiting simulated system confirmation…",
        };
        this.publish();
        await new Promise((r) => setTimeout(r, 900));
        const mode =
          action === "arm"
            ? "armed"
            : action === "partialArm"
              ? "partial"
              : "disarmed";
        this.snap.mode = mode;
        a.mode = mode;
        this.snap.statusAt = new Date().toISOString();
        this.gate.confirm(mode, true);
      } else {
        const r = await this.api.request(
          `/api/v3/panels/${encodeURIComponent(this.snap.panelId)}/areas/${area}/${action}`,
          { userCode: code },
          true,
          false,
        );
        this.snap.command = {
          phase: "awaiting",
          message: "Checking the returned system state…",
        };
        this.publish();
        if (r && Array.isArray(r.areas)) {
          const s = state(r);
          Object.assign(this.snap, s, { statusAt: new Date().toISOString() });
          this.gate.confirm(
            s.areas.find((x) => x.id === area)?.mode || "unknown",
            s.online,
          );
        } else this.gate.phase = "unknown";
      }
      this.snap.command = {
        phase: this.gate.phase,
        message:
          this.gate.phase === "confirmed"
            ? "Confirmed by the system."
            : "Outcome unknown. Reconcile the system state before another action.",
        at: new Date().toISOString(),
      };
      return this.publish();
    } catch (e) {
      const definitive =
        e instanceof ApiError &&
        [400, 401, 403, 405, 412, 404, 429].includes(e.status);
      this.gate.phase = definitive ? "failed" : "unknown";
      this.snap.command = {
        phase: this.gate.phase,
        message: `${(e as Error).message}${definitive ? "" : " Outcome unknown; reconcile before retrying."}`,
        at: new Date().toISOString(),
      };
      return this.publish();
    }
  }
  async reconcile() {
    if (this.gate.phase !== "unknown") return this.snap;
    if (this.busy) throw new Error("Wait for the refresh.");
    this.busy = true;
    try {
      if (!this.snap.demo) await this.readState();
      const a = this.snap.areas.find((x) => x.id === this.gate.area);
      if (this.snap.online !== true || !a || a.mode === "unknown")
        throw new Error("System state still cannot be confirmed.");
      const ok = this.gate.confirm(a.mode, this.snap.online);
      if (!ok) this.gate.phase = "failed";
      this.snap.command = {
        phase: this.gate.phase,
        message: ok
          ? "Confirmed by a fresh system read."
          : `Reconciled: the requested mode is not active. No command was repeated.`,
        at: new Date().toISOString(),
      };
      delete this.snap.warnings.status;
      return this.publish();
    } finally {
      this.busy = false;
    }
  }
  logout() {
    const s = this.demo();
    this.api.clear();
    this.panels = [];
    return s;
  }
  demo() {
    if (this.gate.blocked || this.busy || this.selecting)
      throw new Error("Resolve the current operation first.");
    this.snap = demoSnapshot();
    this.gate = new CommandGate();
    return this.publish();
  }
  scenario(name: string) {
    if (!this.snap.demo || this.gate.blocked)
      throw new Error("Scenarios are available only in idle demo mode.");
    this.snap = demoSnapshot();
    if (name === "stale") {
      this.snap.statusAt = new Date(Date.now() - 3600000).toISOString();
      this.snap.contactsAt = this.snap.statusAt;
      this.snap.telemetryAt = this.snap.statusAt;
      this.snap.devices.forEach((d) => {
        d.stale = true;
        d.fetchedAt = this.snap.statusAt!;
        d.temperatureFetchedAt = this.snap.statusAt!;
        d.temperatureStale = true;
      });
      this.snap.warnings.status =
        "Connection interrupted. Showing last-known values.";
    }
    if (name === "expired")
      this.snap.warnings.status = "Session expired. Sign in again.";
    if (name === "partial") {
      this.snap.warnings.telemetry =
        "Telemetry refresh failed. Contact data remains available.";
      this.snap.devices
        .filter((d) => d.source === "telemetry")
        .forEach((d) => (d.stale = true));
    }
    if (name === "triggered") this.snap.devices[0].alarm = true;
    if (name === "offline") this.snap.online = false;
    if (name === "unknown-command") {
      this.gate.begin("disarm", 0);
      this.gate.phase = "unknown";
      this.snap.command = {
        phase: "unknown",
        message: "Command timed out. Reconcile before another action.",
      };
    }
    if (name === "failed-command")
      this.snap.command = {
        phase: "failed",
        message: "Panel rejected the code. No change was confirmed.",
      };
    return this.publish();
  }
}
