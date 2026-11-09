import type { Action, Mode, Phase } from "./model";
export const target: Record<Action, Mode> = {
  arm: "armed",
  partialArm: "partial",
  disarm: "disarmed",
};
export class CommandGate {
  phase: Phase = "idle";
  action?: Action;
  area?: number;
  get blocked() {
    return ["sending", "awaiting", "unknown"].includes(this.phase);
  }
  begin(action: Action, area: number) {
    if (this.blocked)
      throw new Error("Reconcile the pending command before another action.");
    this.phase = "sending";
    this.action = action;
    this.area = area;
  }
  confirm(mode: Mode, online?: boolean) {
    if (online === true && mode === target[this.action!]) {
      this.phase = "confirmed";
      return true;
    }
    this.phase = "unknown";
    return false;
  }
}
