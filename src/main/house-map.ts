import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  validatePlacement,
  type MapProject,
  type MapPlacement,
  type HouseMapData,
} from "../shared/house-map";
export class HouseMapStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  private async project(): Promise<MapProject> {
    try {
      return JSON.parse(
        await fs.readFile(join(this.root, "project.json"), "utf8"),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { plans: [], rooms: [] };
      throw e;
    }
  }
  private placementFile(scope: string) {
    return join(
      this.root,
      `placements-${createHash("sha256").update(scope).digest("hex")}.json`,
    );
  }
  async load(scope: string): Promise<HouseMapData> {
    const project = await this.project();
    let placements = {};
    try {
      placements = JSON.parse(
        await fs.readFile(this.placementFile(scope), "utf8"),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return { ...project, placements };
  }
  async image(id: string) {
    if (
      typeof id !== "string" ||
      !/^[a-z0-9-]+$/.test(id) ||
      !(await this.project()).plans.some((p) => p.id === id)
    )
      throw new Error("Unknown plan.");
    const data = await fs.readFile(join(this.root, `${id}.jpg`));
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  }
  save(
    scope: string,
    deviceId: string,
    placement: MapPlacement | null,
  ): Promise<void> {
    const job = this.pending
      .catch(() => {})
      .then(async () => {
        const data = await this.load(scope);
        data.placements[deviceId] = validatePlacement(placement, data);
        const path = this.placementFile(scope);
        await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
        await fs.writeFile(path + ".tmp", JSON.stringify(data.placements), {
          mode: 0o600,
        });
        await fs.rename(path + ".tmp", path);
      });
    this.pending = job;
    return job;
  }
}
