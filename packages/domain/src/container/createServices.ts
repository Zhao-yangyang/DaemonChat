import type { Ports, Services } from "./types";

export function createServices(ports: Ports): Services {
  return { ports };
}
