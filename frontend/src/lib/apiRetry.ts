export type ApiRetryFailure = {
  failureType?: string;
  status?: number;
  gatewayError?: string;
};

export function shouldRetryApiFailure(
  error: ApiRetryFailure,
  attempt: number,
  retryGatewayErrors: boolean,
): boolean {
  if (error.failureType === "NETWORK") return attempt < 3;
  if (attempt >= 2) return false;
  if (error.failureType === "TIMEOUT") return true;
  if (!retryGatewayErrors) return false;
  return error.failureType === "INVALID_RESPONSE"
    || error.gatewayError === "ROUTER_EXTERNAL_TARGET_ERROR"
    || [502, 503, 504].includes(error.status || 0);
}

export function apiRetryDelayMs(attempt: number, failureType?: string): number {
  return failureType === "NETWORK" && attempt > 1 ? 900 : 350;
}
