import type { Bridge } from "../shared/model";
declare global {
  interface Window {
    home?: Bridge;
  }
}
