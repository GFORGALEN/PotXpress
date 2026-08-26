export const FRONT_DESK_PATH = '/?mode=frontdesk';

export function isFrontDeskMode(search = '') {
  return new URLSearchParams(search).get('mode') === 'frontdesk';
}

export function defaultAuthenticatedPath(role) {
  return role === 'store_staff' ? FRONT_DESK_PATH : '/';
}
