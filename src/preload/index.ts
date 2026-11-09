import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "../shared/model";
const invoke =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args);
const bridge: Bridge = {
  setBudgetOverride: invoke("setBudgetOverride"),
  cameraState: invoke("cameraState"),
  captureCameras: invoke("captureCameras"),
  cancelCapture: invoke("cancelCapture"),
  photoLibrary: invoke("photoLibrary"),
  photoImage: invoke("photoImage"),
  deletePhoto: invoke("deletePhoto"),
  exportPhoto: invoke("exportPhoto"),
  snapshot: invoke("snapshot"),
  demo: invoke("demo"),
  refresh: invoke("refresh"),
  login: invoke("login"),
  savedLogin: invoke("savedLogin"),
  select: invoke("select"),
  logout: invoke("logout"),
  command: invoke("command"),
  reconcile: invoke("reconcile"),
  readOnly: invoke("readOnly"),
  preferences: invoke("preferences"),
  savePreferences: invoke("savePreferences"),
  scenario: invoke("scenario"),
  subscribe(cb) {
    const listener = (_event: unknown, s: Parameters<typeof cb>[0]) => cb(s);
    ipcRenderer.on("snapshot", listener);
    return () => ipcRenderer.removeListener("snapshot", listener);
  },
};
contextBridge.exposeInMainWorld("home", bridge);
