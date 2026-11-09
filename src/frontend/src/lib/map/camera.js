export function screenToWorld(camera, screen, viewport) {
    return {
        x: (screen.x - viewport.width / 2) / camera.zoom + camera.x,
        y: (screen.y - viewport.height / 2) / camera.zoom + camera.y,
    };
}
export function worldToScreen(camera, world, viewport) {
    return {
        x: (world.x - camera.x) * camera.zoom + viewport.width / 2,
        y: (world.y - camera.y) * camera.zoom + viewport.height / 2,
    };
}
export function visibleWorldRect(camera, viewport, margin = 0) {
    const halfW = viewport.width / 2 / camera.zoom + margin;
    const halfH = viewport.height / 2 / camera.zoom + margin;
    return {
        minX: camera.x - halfW,
        maxX: camera.x + halfW,
        minY: camera.y - halfH,
        maxY: camera.y + halfH,
    };
}
