import { describe, it, expect, vi, afterEach } from "vitest";
import { SectorApi, ApiError } from "../src/main/api";
import { Monitor } from "../src/main/service";
const state = (mode = "ArmedTotal") => ({
  isOnline: true,
  areas: [{ id: 7, name: "House", state: mode, canPartialArm: true }],
});
const plan = (info: any) => ({
  areas: [
    {
      sections: [
        {
          id: "f",
          name: "Floor",
          places: [
            {
              id: "r",
              name: "Room",
              components: [
                {
                  serialNumber: "x",
                  typeName: "MagneticContact",
                  name: "Window",
                  info,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
function setup() {
  let current = "ArmedTotal";
  let failTelemetry = false;
  let commandError: Error | undefined;
  let posts = 0;
  const api = {
    used: 0,
    clear: vi.fn(),
    login: vi.fn(),
    request: vi.fn(async (path: string, body?: unknown) => {
      if (path.includes("GetPanelList"))
        return [
          { PanelId: "1", DisplayName: "Casa", InstallationStatus: "Active" },
        ];
      if (path.includes("GetPanel?"))
        return { Vendor: "SAS", DisplayName: "Casa", PanelCodeLength: 4 };
      if (path.endsWith("/state")) return state(current);
      if (path.includes("propertyplan"))
        return plan({ closed: false, batteryLow: false });
      if (path.endsWith("temperature")) {
        if (failTelemetry) throw new Error("Telemetry interrupted");
        return plan({ supervision: false, batteryLow: false });
      }
      if (path.includes("/logs")) return { Records: [] };
      if (body) {
        posts++;
        if (commandError) throw commandError;
        return state(current);
      }
      throw new Error("Unexpected route");
    }),
  };
  const monitor = new Monitor(api as unknown as SectorApi, () => {});
  return {
    monitor,
    api,
    setMode: (m: string) => (current = m),
    fail: () => (failTelemetry = true),
    commandError: (e: Error) => (commandError = e),
    posts: () => posts,
  };
}
async function connected() {
  const t = setup();
  await t.monitor.login("e", "p");
  await t.monitor.select("1");
  return t;
}
afterEach(() => vi.useRealTimers());
describe("live monitor using injected transport", () => {
  it("connecting is read-only and sends no security commands", async () => {
    const t = await connected();
    expect(t.monitor.snap.readOnly).toBe(true);
    expect(t.posts()).toBe(0);
    await expect(t.monitor.command("disarm", "1234", 7)).rejects.toThrow(
      "Enable live",
    );
    expect(t.posts()).toBe(0);
  });
  it("does not report success merely because the POST returned 200", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    await t.monitor.command("disarm", "1234", 7);
    expect(t.monitor.snap.command.phase).toBe("unknown");
    await expect(t.monitor.command("arm", "1234", 7)).rejects.toThrow();
    expect(t.posts()).toBe(1);
  });
  it("reconciles unknown outcomes with a read, never an automatic command retry", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    t.commandError(new ApiError("Timeout"));
    await t.monitor.command("disarm", "1234", 7);
    t.setMode("Disarmed");
    await t.monitor.reconcile();
    expect(t.monitor.snap.command.phase).toBe("confirmed");
    expect(t.posts()).toBe(1);
  });
  it("treats wrong codes as failures without renewing or retrying writes", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    t.commandError(new ApiError("Wrong code", 403));
    await t.monitor.command("disarm", "1234", 7);
    expect(t.monitor.snap.command.phase).toBe("failed");
    expect(t.posts()).toBe(1);
  });
  it("requires the actual returned area ID and valid code", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    await expect(t.monitor.command("disarm", "1234", 0)).rejects.toThrow(
      "not available",
    );
    await expect(t.monitor.command("disarm", "123", 7)).rejects.toThrow(
      "4-digit",
    );
    expect(t.posts()).toBe(0);
  });
  it("preserves last-known telemetry on partial failures", async () => {
    vi.useFakeTimers();
    const t = await connected();
    const at = t.monitor.snap.telemetryAt;
    t.fail();
    vi.setSystemTime(Date.now() + 901000);
    await t.monitor.refresh();
    expect(t.monitor.snap.devices).toHaveLength(1);
    expect(t.monitor.snap.devices[0].closed).toBe(false);
    expect(t.monitor.snap.devices[0].stale).toBe(true);
    expect(t.monitor.snap.telemetryAt).toBe(at);
    expect(t.monitor.snap.warnings.telemetry).toContain("interrupted");
  });
  it("prevents duplicate clicks while a request is unresolved", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    let resolve!: (value: any) => void;
    t.api.request.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const first = t.monitor.command("disarm", "1234", 7);
    await expect(t.monitor.command("arm", "1234", 7)).rejects.toThrow();
    resolve(state("Disarmed"));
    await first;
    expect(t.monitor.snap.command.phase).toBe("confirmed");
  });
  it("blocks commands with stale, offline or unknown state", async () => {
    const t = await connected();
    t.monitor.readOnly(false);
    t.monitor.snap.statusAt = "2020-01-01T00:00:00Z";
    await expect(t.monitor.command("disarm", "1234", 7)).rejects.toThrow(
      "Refresh",
    );
    expect(t.posts()).toBe(0);
  });
  it("logout forgets in-memory credentials and property access", async () => {
    const t = await connected();
    t.monitor.logout();
    expect(t.api.clear).toHaveBeenCalled();
    expect(t.monitor.panels).toEqual([]);
    expect(t.monitor.snap.demo).toBe(true);
  });
});
describe("HTTP safety", () => {
  const jwt = `x.${btoa(JSON.stringify({ exp: 9999999999 }))}.x`;
  it("refreshes expired authentication on a GET only once", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ AuthorizationToken: jwt })),
      )
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ AuthorizationToken: jwt })),
      )
      .mockResolvedValueOnce(new Response("{}"));
    const a = new SectorApi(
      { hour: Math.floor(Date.now() / 3600000), used: 0, blockedUntil: 0 },
      () => {},
      f,
    );
    await a.login("a", "b");
    await a.request("/read");
    expect(f).toHaveBeenCalledTimes(4);
  });
  it("never retries a write after a 401", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ AuthorizationToken: jwt })),
      )
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    const a = new SectorApi(
      { hour: Math.floor(Date.now() / 3600000), used: 0, blockedUntil: 0 },
      () => {},
      f,
    );
    await a.login("a", "b");
    await expect(a.request("/command", { userCode: "1234" })).rejects.toThrow(
      "Session expired",
    );
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("honors the shared-budget backoff without further requests", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const m = {
      hour: Math.floor(Date.now() / 3600000),
      used: 0,
      blockedUntil: 0,
    };
    const a = new SectorApi(m, () => {}, f);
    await expect(a.login("a", "b")).rejects.toThrow();
    await expect(a.login("a", "b")).rejects.toThrow("budget");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("account property discovery", () => {
  it.each([undefined, null, 3, "active", "Working"])(
    "keeps a valid property when InstallationStatus is %s",
    async (installationStatus) => {
      const t = setup();
      t.api.request.mockResolvedValueOnce([
        {
          PanelId: "1",
          DisplayName: "Casa",
          InstallationStatus: installationStatus,
        },
      ]);
      expect(await t.monitor.login("e", "p")).toEqual([
        { id: "1", name: "Casa" },
      ]);
      await t.monitor.select("1");
      expect(t.monitor.snap.readOnly).toBe(true);
      expect(t.posts()).toBe(0);
    },
  );
  it("distinguishes an empty server list from malformed property entries", async () => {
    const t = setup();
    t.api.request.mockResolvedValueOnce([]);
    await expect(t.monitor.login("e", "p")).rejects.toThrow(
      "returned no properties for this account",
    );
    t.api.request.mockResolvedValueOnce([{ DisplayName: "Casa" }]);
    await expect(t.monitor.login("e", "p")).rejects.toThrow(
      "none contained a usable PanelId",
    );
  });
  it("accepts numeric IDs but does not fabricate IDs from malformed entries", async () => {
    const t = setup();
    t.api.request.mockResolvedValueOnce([
      null,
      {},
      { PanelId: "" },
      { PanelId: 42, Name: "Casa" },
    ]);
    expect(await t.monitor.login("e", "p")).toEqual([
      { id: "42", name: "Casa" },
    ]);
  });
});
