import { validTemperatureRange } from "../shared/temperature-scale";
import { HouseMapStore } from "./house-map";
import { PhotoStore, CameraController } from "./photos";
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  powerMonitor,
  dialog,
  nativeImage,
  screen,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promises as fs } from "node:fs";
import { SectorApi, type Meter } from "./api";
import { Monitor } from "./service";
import { defaults, type Preferences } from "../shared/model";
let win: BrowserWindow | undefined;
app.setName("Home Monitor");
if (process.env.HOME_MONITOR_TEST_DATA)
  app.setPath("userData", process.env.HOME_MONITOR_TEST_DATA);
async function read(name: string) {
  try {
    return JSON.parse(
      await fs.readFile(join(app.getPath("userData"), name), "utf8"),
    );
  } catch {
    return null;
  }
}
const writeQueues = new Map<string, Promise<void>>();
function write(name: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  const pending = (writeQueues.get(name) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      const path = join(app.getPath("userData"), name);
      await fs.writeFile(path + ".tmp", serialized, { mode: 0o600 });
      await fs.rename(path + ".tmp", path);
    });
  writeQueues.set(name, pending);
  return pending;
}

async function remember(email: string, password: string) {
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw new Error(
      "Secure credential storage is unavailable. Sign in without remembering credentials.",
    );
  const encrypted = await safeStorage.encryptStringAsync(
    JSON.stringify({ email, password }),
  );
  await write("credentials.secure.json", {
    encrypted: encrypted.toString("base64"),
  });
}
function validatePreferences(p: Preferences) {
  if (
    !p ||
    (p.temperatureRange !== undefined &&
      !validTemperatureRange(p.temperatureRange)) ||
    (p.lastPanelId !== undefined && typeof p.lastPanelId !== "string") ||
    (p.homeNames !== undefined &&
      (!p.homeNames ||
        typeof p.homeNames !== "object" ||
        Array.isArray(p.homeNames) ||
        Object.values(p.homeNames).some(
          (name) => typeof name !== "string" || name.length > 500,
        ))) ||
    (p.language !== undefined && !["en", "es"].includes(p.language)) ||
    !["light", "dark", "system"].includes(p.theme) ||
    !["compact", "comfortable"].includes(p.density) ||
    !["original", "spanish"].includes(p.names) ||
    !p.aliases ||
    Array.isArray(p.aliases) ||
    typeof p.aliases !== "object" ||
    Object.values(p.aliases).some(
      (a) =>
        !a ||
        typeof a !== "object" ||
        Object.values(a).some((v) => typeof v !== "string" || v.length > 500),
    ) ||
    JSON.stringify(p).length > 200000
  )
    throw new Error("Invalid display settings.");
  return p;
}
app.whenReady().then(async () => {
  const meter: Meter = (await read("request-budget.json")) || {
    hour: 0,
    used: 0,
    blockedUntil: 0,
  };
  let meterWrite = Promise.resolve();
  const api = new SectorApi(meter, (m) => {
    meterWrite = meterWrite
      .then(() => write("request-budget.json", m))
      .catch(() => {});
  });
  const monitor = new Monitor(api, (s) => win?.webContents.send("snapshot", s));
  const mapStore = new HouseMapStore(
    join(app.getPath("userData"), "house-map"),
  );
  const mapScope = () =>
    `${monitor.snap.demo ? "demo" : "live"}:${monitor.snap.panelId}`;
  const photoStore = new PhotoStore(join(app.getPath("userData"), "photos"));
  const cameras = new CameraController(monitor, photoStore, async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    // A clearly synthetic image; never a screenshot of the user's desktop.
    const width = 640,
      height = 360,
      pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const n = (y * width + x) * 4,
          line = x % 80 < 2 || y % 60 < 2;
        pixels[n] = line ? 100 : 55;
        pixels[n + 1] = line ? 150 : 78;
        pixels[n + 2] = line ? 120 : 60;
        pixels[n + 3] = 255;
      }
    return nativeImage
      .createFromBitmap(pixels, { width, height })
      .toPNG()
      .toString("base64");
  });
  const dev = process.env.ELECTRON_RENDERER_URL;
  const renderer = join(import.meta.dirname, "../renderer/index.html");
  const allowed = dev || pathToFileURL(renderer).href;
  // Electron work areas use logical pixels and exclude the Dock/taskbar.
  // Choose the display being used at launch, including external displays.
  const { workArea } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  const width = Math.min(1800, Math.max(1, workArea.width - 32));
  const height = Math.min(1200, Math.max(1, workArea.height - 32));
  win = new BrowserWindow({
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
    minWidth: Math.min(960, width),
    minHeight: Math.min(680, height),
    title: "Home Monitor",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 19 },
    backgroundColor: "#f5f6f3",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.key === "0" &&
      (process.platform === "darwin" ? input.meta : input.control) &&
      !input.alt &&
      !input.shift
    ) {
      event.preventDefault();
      win?.webContents.setZoomFactor(1);
    }
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== allowed) e.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
    cb(false),
  );
  const handlers: Record<string, (...args: any[]) => any> = {
    resetZoom: () => win?.webContents.setZoomFactor(1),
    houseMap: () => mapStore.load(mapScope()),
    mapImage: (id) => mapStore.image(id),
    saveMapPlacement: (id, placement) => {
      if (
        typeof id !== "string" ||
        !monitor.snap.devices.some((d) => d.id === id)
      )
        throw new Error("Unknown sensor.");
      return mapStore.save(mapScope(), id, placement);
    },
    cameraState: () => cameras.state(),
    captureCameras: (ids) => cameras.start(ids),
    cancelCapture: () => cameras.cancel(),
    photoLibrary: (offset, cameraId) =>
      photoStore.list(cameras.scope(), offset, cameraId),
    photoImage: (id) => photoStore.image(cameras.scope(), id),
    deletePhoto: (id) => photoStore.remove(cameras.scope(), id),
    exportPhoto: async (id) => {
      const data = await photoStore.image(cameras.scope(), id);
      const png = data.startsWith("data:image/png");
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: `Home-Monitor-${id}.${png ? "png" : "jpg"}`,
        filters: [{ name: "Photo", extensions: [png ? "png" : "jpg"] }],
      });
      if (!result.canceled && result.filePath)
        await fs.writeFile(
          result.filePath,
          Buffer.from(data.split(",")[1], "base64"),
          { mode: 0o600 },
        );
    },
    setBudgetOverride: (enabled) => monitor.setBudgetOverride(enabled),
    snapshot: () => monitor.publish(),
    demo: () => monitor.demo(),
    refresh: () => monitor.refresh(true),
    login: async (email, password, save) => {
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 320 ||
        password.length > 2048
      )
        throw new Error("Invalid credentials.");
      const panels = await monitor.login(email, password);
      if (save) await remember(email, password);
      return panels;
    },
    savedAccount: async () => {
      try {
        const stored = await read("credentials.secure.json");
        if (!stored?.encrypted) return null;
        const { result } = await safeStorage.decryptStringAsync(
          Buffer.from(stored.encrypted, "base64"),
        );
        const credentials = JSON.parse(result);
        return typeof credentials.email === "string" &&
          credentials.email &&
          typeof credentials.password === "string" &&
          credentials.password
          ? { email: credentials.email }
          : null;
      } catch {
        return null;
      }
    },
    savedLogin: async () => {
      const stored = await read("credentials.secure.json");
      if (!stored?.encrypted)
        throw new Error("No saved account. Enter your credentials.");
      const { result } = await safeStorage.decryptStringAsync(
        Buffer.from(stored.encrypted, "base64"),
      );
      const c = JSON.parse(result);
      return monitor.login(c.email, c.password);
    },
    select: (id) => monitor.select(id),
    logout: async () => {
      const snap = monitor.logout();
      await fs.rm(join(app.getPath("userData"), "credentials.secure.json"), {
        force: true,
      });
      return snap;
    },
    command: (a, c, id) => monitor.command(a, c, id),
    reconcile: () => monitor.reconcile(),
    readOnly: (v) => monitor.readOnly(v),
    preferences: async () => {
      try {
        return validatePreferences(await read("preferences.json"));
      } catch {
        return defaults;
      }
    },
    savePreferences: (p) => write("preferences.json", validatePreferences(p)),
    scenario: (n) => monitor.scenario(n),
  };
  for (const [name, fn] of Object.entries(handlers))
    ipcMain.handle(name, async (e, ...args) => {
      if (
        e.sender !== win?.webContents ||
        e.senderFrame !== win.webContents.mainFrame ||
        e.senderFrame.url !== allowed
      )
        throw new Error("Untrusted request.");
      try {
        return await fn(...args);
      } catch (error) {
        throw new Error((error as Error).message);
      }
    });
  if (dev) await win.loadURL(dev);
  else await win.loadFile(renderer);
  setInterval(() => void monitor.refresh().catch(() => {}), 30000);
  powerMonitor.on("resume", () => void monitor.refresh(true).catch(() => {}));
  app.on("activate", () => win?.show());
});
app.on("window-all-closed", () => app.quit());
