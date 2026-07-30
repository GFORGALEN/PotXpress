const PREFIX_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateErrorId() {
  const hex = crypto.randomUUID().replace(/-/g, '');
  const prefix = PREFIX_LETTERS[Math.floor(Math.random() * PREFIX_LETTERS.length)];
  return `${prefix}${hex.slice(0, 8)}`.toUpperCase();
}
