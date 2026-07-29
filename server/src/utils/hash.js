import bcrypt from 'bcrypt';

const HASH_ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, HASH_ROUNDS);
}

export function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
