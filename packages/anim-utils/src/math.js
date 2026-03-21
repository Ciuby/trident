export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function inverseLerp(a, b, value) {
    if (a === b) {
        return 0;
    }
    return (value - a) / (b - a);
}
export function nearlyEqual(a, b, epsilon = 1e-5) {
    return Math.abs(a - b) <= epsilon;
}
