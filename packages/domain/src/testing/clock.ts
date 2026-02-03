import type { Clock } from "../container/types";
import type { Timestamp } from "../types";

export class FixedClock implements Clock {
  private value: Timestamp;

  constructor(value: Timestamp) {
    this.value = value;
  }

  now(): Timestamp {
    return this.value;
  }
}

export class ManualClock implements Clock {
  private value: Timestamp;

  constructor(value: Timestamp) {
    this.value = value;
  }

  now(): Timestamp {
    return this.value;
  }

  set(value: Timestamp): void {
    this.value = value;
  }
}
