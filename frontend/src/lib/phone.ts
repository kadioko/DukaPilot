export function normalizeWhatsAppNumber(value: string | null | undefined): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^[1-9]\d{8,14}$/.test(digits)) return digits;
  return null;
}
