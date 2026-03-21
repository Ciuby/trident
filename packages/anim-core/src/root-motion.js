export function createRootMotionDelta() {
    return {
        translation: new Float32Array(3),
        yaw: 0
    };
}
export function resetRootMotionDelta(delta) {
    delta.translation[0] = 0;
    delta.translation[1] = 0;
    delta.translation[2] = 0;
    delta.yaw = 0;
    return delta;
}
export function extractRootMotionDelta(previousTranslation, previousRotation, nextTranslation, nextRotation, mode, out = createRootMotionDelta()) {
    resetRootMotionDelta(out);
    if (mode === "none") {
        return out;
    }
    out.translation[0] = nextTranslation.x - previousTranslation.x;
    out.translation[1] = nextTranslation.y - previousTranslation.y;
    out.translation[2] = nextTranslation.z - previousTranslation.z;
    if (mode === "xz" || mode === "xz-yaw") {
        out.translation[1] = 0;
    }
    if (mode === "xz-yaw" || mode === "full") {
        out.yaw = getYawFromQuaternion(nextRotation) - getYawFromQuaternion(previousRotation);
    }
    return out;
}
export function getYawFromQuaternion(rotation) {
    const { x, y, z, w } = rotation;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}
