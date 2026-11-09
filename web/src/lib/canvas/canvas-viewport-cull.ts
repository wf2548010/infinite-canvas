export type WorldRect = { left: number; top: number; right: number; bottom: number };

type Box = { position: { x: number; y: number }; width: number; height: number };

export function nodeIntersectsRect(node: Box, rect: WorldRect): boolean {
    return node.position.x + node.width > rect.left && node.position.x < rect.right && node.position.y + node.height > rect.top && node.position.y < rect.bottom;
}

export function connectionTouchesRect(from: Box, to: Box, rect: WorldRect): boolean {
    return nodeIntersectsRect(from, rect) || nodeIntersectsRect(to, rect);
}
