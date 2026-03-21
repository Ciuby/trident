let nextIdCounter = 0;
export function createStableId(prefix = "id") {
    nextIdCounter += 1;
    return `${prefix}-${nextIdCounter.toString(36)}`;
}
