/**
 * Referral validation (in-memory).
 * Codes: r_XXXX form.
 */

const validCodes = new Set<string>(['r_DEMO', 'r_SOLCLAW', 'r_ADMIN']);
const codeOwners = new Map<string, number>();
const userReferrals = new Map<number, string>();

export function normalizeReferralCode(raw: string): string {
  let c = raw.trim();
  if (!c.startsWith('r_')) c = `r_${c.replace(/^r_?/i, '')}`;
  return c;
}

export function isValidReferralCode(code: string): boolean {
  const n = normalizeReferralCode(code);
  if (validCodes.has(n)) return true;
  return /^r_[A-Za-z0-9]{3,32}$/.test(n);
}

export function registerReferralCode(code: string, ownerUserId: number): string {
  const n = normalizeReferralCode(code);
  validCodes.add(n);
  codeOwners.set(n, ownerUserId);
  return n;
}

export function applyReferral(
  userId: number,
  code: string
): { ok: boolean; reason?: string; referrerId?: number } {
  const n = normalizeReferralCode(code);
  if (!isValidReferralCode(n)) {
    return { ok: false, reason: 'invalid' };
  }
  if (userReferrals.has(userId)) {
    return { ok: true, referrerId: codeOwners.get(userReferrals.get(userId)!) };
  }
  userReferrals.set(userId, n);
  validCodes.add(n);
  return { ok: true, referrerId: codeOwners.get(n) };
}

export function getUserReferral(userId: number): string | undefined {
  return userReferrals.get(userId);
}

export function hasReferral(userId: number): boolean {
  return userReferrals.has(userId);
}

export function parseStartPayload(payload?: string): string | null {
  if (!payload) return null;
  const p = payload.trim();
  if (p.startsWith('r_') || /^[A-Za-z0-9]{3,32}$/.test(p)) {
    return normalizeReferralCode(p);
  }
  return null;
}
