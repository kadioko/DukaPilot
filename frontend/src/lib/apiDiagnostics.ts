export function diagnosticEndpoint(path: string): string {
  const pathname = path.split("?")[0] || "/";
  return pathname.replace(/\/[a-z0-9_-]{18,}(?=\/|$)/gi, "/:id");
}
