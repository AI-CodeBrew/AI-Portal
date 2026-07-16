import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOSING_SOON_MS,
  FREE_ENTRY_WINDOW_HOURS,
  SERVICE_WINDOW_HOURS,
  formatWindowCountdown,
  getWindowStatus,
} from "./window-status";

const base = new Date("2026-07-16T12:00:00.000Z");

test("no last message → closed", () => {
  const status = getWindowStatus(null, "service", base);
  assert.equal(status.isOpen, false);
  assert.equal(status.urgency, "closed");
});

test("service window open with safe urgency", () => {
  const last = new Date(base.getTime() - 10 * 60 * 60 * 1000);
  const status = getWindowStatus(last, "service", base);
  assert.equal(status.isOpen, true);
  assert.equal(status.urgency, "safe");
  assert.ok(status.hoursRemaining > 2);
  assert.equal(status.msRemaining, 14 * 60 * 60 * 1000);
});

test("service window closing soon under 2 hours", () => {
  const last = new Date(
    base.getTime() - (SERVICE_WINDOW_HOURS * 60 * 60 * 1000 - 90 * 60 * 1000)
  );
  const status = getWindowStatus(last, "service", base);
  assert.equal(status.isOpen, true);
  assert.equal(status.urgency, "closing_soon");
  assert.ok(status.msRemaining <= CLOSING_SOON_MS);
});

test("service window expired", () => {
  const last = new Date(
    base.getTime() - SERVICE_WINDOW_HOURS * 60 * 60 * 1000 - 1000
  );
  const status = getWindowStatus(last, "service", base);
  assert.equal(status.isOpen, false);
  assert.equal(status.urgency, "closed");
  assert.equal(status.msRemaining, 0);
});

test("free entry point uses 72 hours", () => {
  const last = new Date(base.getTime() - 48 * 60 * 60 * 1000);
  const status = getWindowStatus(last, "free_entry_point", base);
  assert.equal(status.isOpen, true);
  assert.equal(status.urgency, "safe");
  assert.ok(
    status.expiresAt!.getTime() ===
      last.getTime() + FREE_ENTRY_WINDOW_HOURS * 60 * 60 * 1000
  );
});

test("formatWindowCountdown", () => {
  assert.equal(formatWindowCountdown(0), "Template required");
  assert.equal(formatWindowCountdown(47 * 60 * 1000), "47m left");
  assert.equal(formatWindowCountdown(18 * 60 * 60 * 1000 + 42 * 60 * 1000), "18h 42m left");
});
