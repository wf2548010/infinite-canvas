export type GraphSyncPlan =
    | { type: "skip" }
    | { type: "defer" }
    | { type: "commit"; collab: "none" | "position-patch" | "full" };

export function planCanvasGraphSync(input: {
    projectLoaded: boolean;
    historyPaused: boolean;
    dragging: boolean;
    collabHost: boolean;
    positionOnly: boolean;
}): GraphSyncPlan {
    if (!input.projectLoaded || input.historyPaused) return { type: "skip" };
    if (input.dragging) return { type: "defer" };
    if (!input.collabHost) return { type: "commit", collab: "none" };
    return { type: "commit", collab: input.positionOnly ? "position-patch" : "full" };
}

type GraphNode = {
    id: string;
    position: { x: number; y: number };
    [key: string]: unknown;
};

export function isPositionOnlyGraphChange(before: GraphNode[], after: GraphNode[]): boolean {
    if (before.length !== after.length) return false;
    const previous = new Map(before.map((node) => [node.id, node]));
    for (const node of after) {
        const old = previous.get(node.id);
        if (!old) return false;
        const { position: _nextPosition, ...nextRest } = node;
        const { position: _previousPosition, ...previousRest } = old;
        if (JSON.stringify(nextRest) !== JSON.stringify(previousRest)) return false;
    }
    return true;
}
