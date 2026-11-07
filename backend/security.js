import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
const passwordOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, passwordKeyLength, passwordOptions);
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(key).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, saltValue, keyValue] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, 'base64url');
  if (expected.length !== passwordKeyLength) return false;
  try {
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    }));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}
