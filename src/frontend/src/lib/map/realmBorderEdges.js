export function splitBorderEdges(edges) {
    const back = [];
    const front = [];
    for (const edge of edges)
        (edge[0] < 3 ? back : front).push(edge);
    return { back, front };
}
