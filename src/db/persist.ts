/**
 * Persistent store so users survive Railway redeploys.
 * 1) DATABASE_URL (Postgres)  2) DATA_DIR/solclaw.json volume  3) memory (CRITICAL)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type UserRecord = {
  id: string;
  telegramId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  language?: string | null;
  activated: boolean;
  referralCode?: string;
  referrerId?: string;
  paper: boolean;
  buySize: number;
  autoEnabled: boolean;
  autoStrategy: string;
  alerts: boolean;
  webSessionIds?: string[];
  createdAt: number;
  lastSeenAt: number;
};

export type WalletRecord = {
  userId: number;
  publicKey: string;
  encryptedSecret: string;
  createdAt: number;
};

export type PositionRecord = {
  id: string;
  userId: number;
  mint: string;
  symbol: string;
  quantity: number;
  entrySol: number;
  entryPrice: number;
  currentPrice: number;
  mode: string;
  status: string;
  createdAt: number;
  closedAt?: number;
  exitPrice?: number;
  realizedPnl?: number;
  tpPct?: number;
  slPct?: number;
};

export type TelegramSessionRecord = {
  chatId: number;
  userId?: number;
  language: string | null;
  onboardingStep: string;
  activated: boolean;
  referralCode?: string;
  buySize: number;
  pendingToken?: string;
  pendingSellPct?: number;
  autoEnabled: boolean;
  autoStrategy: string;
  paper: boolean;
  alerts: boolean;
  lastScreen?: string;
  updatedAt: number;
};

export type WebSessionRecord = {
  sessionId: string;
  userId: number;
  ref?: string;
  paper: boolean;
  buySize: number;
  createdAt: number;
  lastSeen: number;
};

type DbShape = {
  users: Record<string, UserRecord>;
  wallets: Record<string, WalletRecord>;
  positions: Record<string, PositionRecord>;
  telegramSessions: Record<string, TelegramSessionRecord>;
  webSessions: Record<string, WebSessionRecord>;
};

const emptyDb = (): DbShape => ({
  users: {},
  wallets: {},
  positions: {},
  telegramSessions: {},
  webSessions: {},
});

let db: DbShape = emptyDb();
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let backend: 'postgres' | 'file' | 'memory' = 'memory';
let pgPool: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} | null = null;

function dataPath(): string {
  const dir =
    process.env.DATA_DIR ||
    (existsSync('/data') ? '/data' : join(process.cwd(), 'data'));
  return join(dir, 'solclaw.json');
}

function scheduleSave(): void {
  dirty = true;
  if (backend === 'memory') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flush().catch((e) => console.error('[db] save failed', e));
  }, 400);
}

export async function initDb(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      const pg = await import('pg');
      pgPool = new pg.default.Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost')
          ? undefined
          : { rejectUnauthorized: false },
        max: 5,
      });
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS solclaw_blob (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      const res = await pgPool.query(
        `SELECT payload FROM solclaw_blob WHERE id = 'main'`
      );
      if (res.rows[0] && (res.rows[0] as { payload: DbShape }).payload) {
        db = { ...emptyDb(), ...(res.rows[0] as { payload: DbShape }).payload };
      }
      backend = 'postgres';
      console.log(
        `[db] Postgres ON (${Object.keys(db.users).length} users, ${Object.keys(db.wallets).length} wallets)`
      );
      return;
    } catch (e) {
      console.warn('[db] Postgres unavailable, falling back to file', e);
      pgPool = null;
    }
  }

  const path = dataPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8');
      db = { ...emptyDb(), ...JSON.parse(raw) };
      backend = 'file';
      console.log(
        `[db] File ON → ${path} (${Object.keys(db.users).length} users, ${Object.keys(db.wallets).length} wallets)`
      );
      return;
    }
    writeFileSync(path, JSON.stringify(emptyDb()));
    backend = 'file';
    console.log(`[db] File ON → ${path} (new store)`);
  } catch (e) {
    backend = 'memory';
    console.warn(
      '[db] CRITICAL: MEMORY ONLY — wallets LOST on redeploy. Set DATABASE_URL (Postgres) or mount Railway Volume at /data.',
      e
    );
  }
}

async function flush(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  if (backend === 'postgres' && pgPool) {
    await pgPool.query(
      `INSERT INTO solclaw_blob (id, payload, updated_at)
       VALUES ('main', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(db)]
    );
    return;
  }
  if (backend === 'file') {
    const path = dataPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(db, null, 0));
  }
}

/** Force immediate write — used after wallet create/import */
export async function forceFlush(): Promise<void> {
  dirty = true;
  await flush();
}

export function getBackend(): string {
  return backend;
}

export function registerTelegramUser(input: {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): UserRecord {
  const id = `tg:${input.telegramId}`;
  const existing = db.users[id];
  const now = Date.now();
  const user: UserRecord = {
    id,
    telegramId: input.telegramId,
    username: input.username ?? existing?.username,
    firstName: input.firstName ?? existing?.firstName,
    lastName: input.lastName ?? existing?.lastName,
    language: existing?.language ?? null,
    activated: existing?.activated ?? true,
    referralCode: existing?.referralCode,
    referrerId: existing?.referrerId,
    paper: existing?.paper ?? false,
    buySize: existing?.buySize ?? 0.05,
    autoEnabled: existing?.autoEnabled ?? false,
    autoStrategy: existing?.autoStrategy ?? 'balanced',
    alerts: existing?.alerts ?? false,
    webSessionIds: existing?.webSessionIds,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  };
  db.users[id] = user;
  scheduleSave();
  return user;
}

export function registerWebUser(sessionId: string, ref?: string): UserRecord {
  const id = `web:${sessionId}`;
  const existing = db.users[id];
  const now = Date.now();
  const user: UserRecord = {
    id,
    language: existing?.language ?? 'en',
    activated: true,
    referralCode: existing?.referralCode,
    referrerId: existing?.referrerId ?? ref,
    paper: existing?.paper ?? true,
    buySize: existing?.buySize ?? 0.05,
    autoEnabled: false,
    autoStrategy: 'balanced',
    alerts: false,
    webSessionIds: [sessionId],
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  };
  db.users[id] = user;
  scheduleSave();
  return user;
}

export function touchUser(id: string): void {
  const u = db.users[id];
  if (!u) return;
  u.lastSeenAt = Date.now();
  scheduleSave();
}

export function updateUser(
  id: string,
  patch: Partial<UserRecord>
): UserRecord | null {
  const u = db.users[id];
  if (!u) return null;
  Object.assign(u, patch, { lastSeenAt: Date.now() });
  scheduleSave();
  return u;
}

export function getUser(id: string): UserRecord | null {
  return db.users[id] ?? null;
}

export function listUsers(): UserRecord[] {
  return Object.values(db.users);
}

export function userCount(): number {
  return Object.keys(db.users).length;
}

export function loadTelegramSession(
  chatId: number
): TelegramSessionRecord | null {
  return db.telegramSessions[String(chatId)] ?? null;
}

export function saveTelegramSession(s: TelegramSessionRecord): void {
  db.telegramSessions[String(s.chatId)] = s;
  scheduleSave();
}

export function loadWebSession(sessionId: string): WebSessionRecord | null {
  return db.webSessions[sessionId] ?? null;
}

export function saveWebSession(s: WebSessionRecord): void {
  db.webSessions[s.sessionId] = s;
  scheduleSave();
}

export function loadWallet(userId: number): WalletRecord | null {
  return db.wallets[String(userId)] ?? null;
}

/** Always flush wallets immediately — never debounce funds. */
export function saveWallet(w: WalletRecord): void {
  db.wallets[String(w.userId)] = w;
  dirty = true;
  void forceFlush().catch((e) => console.error('[db] wallet flush failed', e));
}

export function deleteWallet(userId: number): void {
  delete db.wallets[String(userId)];
  dirty = true;
  void forceFlush().catch((e) => console.error('[db] wallet delete flush failed', e));
}

export function allWallets(): WalletRecord[] {
  return Object.values(db.wallets);
}

export function loadAllPositions(): PositionRecord[] {
  return Object.values(db.positions);
}

export function savePosition(p: PositionRecord): void {
  db.positions[p.id] = p;
  scheduleSave();
}

export function deletePosition(id: string): void {
  delete db.positions[id];
  scheduleSave();
}
