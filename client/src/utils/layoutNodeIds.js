export const DECORATION_NODE_PREFIX = 'decoration:';

export function decorationNodeId(id) {
  return `${DECORATION_NODE_PREFIX}${id}`;
}

export function decorationIdFromNode(id) {
  return id.startsWith(DECORATION_NODE_PREFIX)
    ? id.slice(DECORATION_NODE_PREFIX.length)
    : null;
}

export function layoutItemIdFromNode(id) {
  return decorationIdFromNode(id) ?? id;
}
