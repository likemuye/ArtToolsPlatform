import { AuthSession, PlatformUser } from './types';
import { PLATFORM_USERS, LOGIN_WHITELIST, CURRENT_USER_DEPARTMENT } from './data';

const AUTH_STORAGE_KEY = 'art-launcher-auth-v1';
const PERSONAL_SPACE_SEEDED_KEY = 'art-launcher-personal-space-seeded-v1';

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天有效
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 过期前 1 天静默续期
export const QR_TTL_SECONDS = 120; // 二维码 120s 过期自动刷新

export type WhitelistResult =
  | { ok: true; user: PlatformUser }
  | { ok: false; reason: string };

// 白名单校验：邮箱须在企业白名单内、且非离职人员。
export function checkWhitelist(email: string): WhitelistResult {
  const normalized = email.trim().toLowerCase();
  const user = PLATFORM_USERS.find(u => u.email.toLowerCase() === normalized);
  if (!user) {
    return { ok: false, reason: '该钉钉账号未在平台注册，请联系管理员开通。' };
  }
  if (user.isFormer) {
    return { ok: false, reason: '该账号已离职，访问权限已被冻结。' };
  }
  if (!LOGIN_WHITELIST.has(user.email)) {
    return { ok: false, reason: '该账号不在本项目访问白名单内，无法登录。' };
  }
  return { ok: true, user };
}

// 生成会话 Token（模拟：随机串 + 用户标识 + 时间戳）。
export function createSession(user: PlatformUser, now: number): AuthSession {
  const token = `dt_${user.id}_${now.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  return {
    token,
    userId: user.id,
    name: user.name,
    email: user.email,
    department: user.department ?? CURRENT_USER_DEPARTMENT,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS
  };
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage 不可用时忽略——演示环境不影响主流程。
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isExpired(session: AuthSession, now: number): boolean {
  return now >= session.expiresAt;
}

// 是否进入续期窗口（仍有效，但距过期不足 1 天）。
export function needsRenewal(session: AuthSession, now: number): boolean {
  return !isExpired(session, now) && session.expiresAt - now <= RENEW_THRESHOLD_MS;
}

// 静默续期：保持 userId/资料，重置签发与过期时间。
export function renewSession(session: AuthSession, now: number): AuthSession {
  return { ...session, issuedAt: now, expiresAt: now + TOKEN_TTL_MS };
}

// 首次登录自动创建个人空间：按用户标识记录是否已建，返回 true 表示本次为首次。
export function ensurePersonalSpace(userId: string): boolean {
  try {
    const raw = localStorage.getItem(PERSONAL_SPACE_SEEDED_KEY);
    const seeded: string[] = raw ? JSON.parse(raw) : [];
    if (seeded.includes(userId)) return false;
    seeded.push(userId);
    localStorage.setItem(PERSONAL_SPACE_SEEDED_KEY, JSON.stringify(seeded));
    return true;
  } catch {
    return false;
  }
}
