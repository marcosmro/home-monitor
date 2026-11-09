export class CaptureOutcomeUnknown extends Error {}
const BASE = "https://mypagesapi.sectoralarm.net";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public details?: { serverMessage?: string; allowedMethods?: string[] },
  ) {
    super(message);
  }
}
export interface Meter {
  hour: number;
  used: number;
  blockedUntil: number;
}
export class SectorApi {
  private token = "";
  private overrideHour = -1;
  private expires = 0;
  private credentials?: { email: string; password: string };
  private renewing?: Promise<void>;
  constructor(
    private meter: Meter,
    private saveMeter: (m: Meter) => void = () => {},
    private fetcher: typeof fetch = fetch,
  ) {}
  clear() {
    this.overrideHour = -1;
    this.token = "";
    this.expires = 0;
    this.credentials = undefined;
  }
  get budget() {
    this.roll();
    const override = this.overrideHour === this.meter.hour;
    return {
      used: this.meter.used,
      limit: 44,
      override,
      localPaused: this.meter.used >= 44 && !override,
      serverPaused: Date.now() < this.meter.blockedUntil,
      resetsAt: new Date((this.meter.hour + 1) * 3600000).toISOString(),
    };
  }
  setBudgetOverride(enabled: boolean) {
    if (typeof enabled !== "boolean")
      throw new Error("Invalid budget setting.");
    this.roll();
    this.overrideHour = enabled ? this.meter.hour : -1;
  }
  get used() {
    this.roll();
    return this.meter.used;
  }
  private roll() {
    const hour = Math.floor(Date.now() / 3600000);
    if (this.meter.hour !== hour) {
      this.meter.hour = hour;
      this.meter.used = 0;
    }
  }
  async login(email: string, password: string) {
    this.credentials = { email, password };
    await this.authenticate();
  }
  private async authenticate() {
    if (this.renewing) return this.renewing;
    this.renewing = (async () => {
      const r = await this.request(
        "/api/Login/Login",
        {
          UserId: this.credentials?.email,
          Password: this.credentials?.password,
        },
        false,
        false,
      );
      if (typeof r?.AuthorizationToken !== "string")
        throw new ApiError(
          "The login requires an unsupported authentication step. Use the official app; no security step was bypassed.",
          401,
        );
      this.token = r.AuthorizationToken;
      try {
        this.expires =
          JSON.parse(
            atob(
              this.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
            ),
          ).exp * 1000 || Date.now() + 3000000;
      } catch {
        this.expires = Date.now() + 3000000;
      }
    })();
    try {
      await this.renewing;
    } finally {
      this.renewing = undefined;
    }
  }
  async request(
    path: string,
    body?: unknown,
    auth = true,
    retry = true,
    timeoutMs = 20000,
  ): Promise<any> {
    if (auth && (!this.token || Date.now() >= this.expires)) {
      if (!this.credentials) throw new ApiError("Sign in to reconnect.", 401);
      await this.authenticate();
    }
    this.roll();
    if (Date.now() < this.meter.blockedUntil)
      throw new ApiError(
        "Sector Alarm has paused requests. The local override cannot bypass its rate limit. Wait until the next hour.",
        429,
      );
    if (this.budget.localPaused)
      throw new ApiError(
        "Request budget paused until the next hour. Last-known data remains visible.",
        429,
      );
    this.meter.used++;
    this.saveMeter({ ...this.meter });
    let response: Response;
    try {
      response = await this.fetcher(BASE + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "API-Version": "6",
          culture: "es-ES",
          ...(auth ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      throw new ApiError(
        "Sector Alarm did not respond. Check your connection and refresh.",
      );
    }
    if (response.status === 429) {
      this.meter.blockedUntil =
        (Math.floor(Date.now() / 3600000) + 1) * 3600000;
      this.saveMeter({ ...this.meter });
    }
    // Only GET reads may be repeated after reauthentication. Never replay a security command.
    if (response.status === 401 && auth && retry && body === undefined) {
      await this.authenticate();
      return this.request(path, undefined, true, false);
    }
    if (!response.ok) {
      let details: ApiError["details"];
      if (
        path.includes("/takepicture") ||
        path.startsWith("/api/Panel/TakePicture?")
      ) {
        // Capture diagnostics stay in memory/UI, never in request logs or photo metadata.
        const body = (await response.text().catch(() => "")).slice(0, 4096);
        let message = "";
        try {
          let value = JSON.parse(body);
          for (let i = 0; i < 2 && typeof value === "string"; i++) {
            try {
              value = JSON.parse(value);
            } catch {
              break;
            }
          }
          message =
            typeof value === "string"
              ? value
              : [
                  value?.detail,
                  value?.message,
                  value?.Message,
                  value?.title,
                  value?.error?.message,
                  value?.error,
                  value?.code,
                ].find((v) => typeof v === "string") || "";
        } catch {
          if (!body.trim().startsWith("<")) message = body;
        }
        details = {
          serverMessage:
            message.replace(/[\r\n\t]+/g, " ").slice(0, 300) || undefined,
          allowedMethods: (response.headers.get("allow") || "")
            .split(",")
            .map((v) => v.trim().toUpperCase())
            .filter((v) =>
              [
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS",
                "HEAD",
              ].includes(v),
            ),
        };
      }
      throw new ApiError(
        response.status === 401
          ? "Session expired. Sign in again."
          : response.status === 403
            ? "Access denied. For alarm commands, check the panel code."
            : response.status === 429
              ? "Sector Alarm rate limit reached. Refresh resumes next hour."
              : response.status === 404
                ? "This panel does not support this capability."
                : `Sector Alarm request failed (${response.status}).`,
        response.status,
        details,
      );
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError("Sector Alarm returned an unreadable response.");
    }
  }
}
