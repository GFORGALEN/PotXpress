import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const TOKEN_EXPIRES_IN = '8h';

export function signToken({ userId, tokenVersion }) {
  return jwt.sign(
    { userId, tokenVersion },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: TOKEN_EXPIRES_IN,
    },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
  });
}
