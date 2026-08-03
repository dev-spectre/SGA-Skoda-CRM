import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hashes a plain text password using scrypt with a random 16-byte salt.
 * Returns string formatted as "salt:hash".
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hashedPassword = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashedPassword}`;
}

/**
 * Verifies a plain text password strictly against a stored password hash ("salt:hash").
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.includes(':')) return false;

  try {
    const [salt, expectedKeyHex] = storedHash.split(':');
    if (!salt || !expectedKeyHex) return false;

    const actualBuffer = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expectedKeyHex, 'hex');

    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
