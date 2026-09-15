import { api, ApiError } from "@/lib/api";
import { readPendingCropOperations, writePendingCropOperations, type PendingCropOperation } from "@/lib/offlineCropStorage";
import type { Lang } from "@/lib/i18n";

const SYNC_DEVICE_KEY = "dukapilot_sync_device_id";
const SYNC_DEVICE_LABEL_KEY = "dukapilot_sync_device_label";

function newLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deviceId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SYNC_DEVICE_KEY);
  if (existing) return existing;
  const next = newLocalId();
  window.localStorage.setItem(SYNC_DEVICE_KEY, next);
  return next;
}

function deviceLabel() {
  if (typeof window === "undefined") return "Server device";
  const existing = window.localStorage.getItem(SYNC_DEVICE_LABEL_KEY);
  if (existing) return existing;
  const next = `Shop phone ${deviceId().slice(0, 4)}`;
  window.localStorage.setItem(SYNC_DEVICE_LABEL_KEY, next);
  return next;
}

function report(operation: PendingCropOperation, status: "SYNCED" | "FAILED", attempts: number, message?: string) {
  api.post("/sync/events", {
    operationKind: "CROP_FIELD",
    status,
    attempts,
    localId: operation.id,
    message: message || operation.label || "Crop field record",
    deviceId: deviceId(),
    deviceLabel: deviceLabel(),
  }).catch(() => {});
}

export function shouldQueueCropOperation(scope: string | null, error: unknown) {
  const status = error instanceof ApiError ? error.status : undefined;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return Boolean(scope && (offline || !status));
}

export async function sendCropOperation(operation: PendingCropOperation, lang: Lang) {
  if (operation.method === "PATCH") return api.patch(operation.path, operation.payload, lang);
  return api.post(operation.path, operation.payload, lang);
}

export async function syncPendingCropOperations(scope: string, lang: Lang) {
  const pending = readPendingCropOperations(scope);
  const remaining: PendingCropOperation[] = [];
  let synced = 0;
  let needsAttention = 0;

  for (const operation of pending) {
    try {
      await sendCropOperation(operation, lang);
      synced += 1;
      report(operation, "SYNCED", operation.attempts);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      const permanent = Boolean(status && status >= 400 && status < 500);
      const next = {
        ...operation,
        attempts: operation.attempts + 1,
        needsAttention: permanent,
        lastError: error instanceof Error ? error.message : "Could not sync crop record",
      };
      remaining.push(next);
      if (permanent) {
        needsAttention += 1;
        report(operation, "FAILED", next.attempts, next.lastError);
      }
    }
  }

  writePendingCropOperations(scope, remaining);
  return { remaining, synced, needsAttention };
}
