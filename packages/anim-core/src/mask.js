export function createBoneMask(boneCount, fill = 1) {
    const weights = new Float32Array(boneCount);
    weights.fill(fill);
    return { weights };
}
export function cloneBoneMask(mask) {
    return { weights: Float32Array.from(mask.weights) };
}
export function createBoneMaskFromBranch(rig, rootBoneIndex, weight = 1, fill = 0) {
    const mask = createBoneMask(rig.boneNames.length, fill);
    const queue = [rootBoneIndex];
    while (queue.length > 0) {
        const current = queue.shift();
        mask.weights[current] = weight;
        for (let index = 0; index < rig.parentIndices.length; index += 1) {
            if (rig.parentIndices[index] === current) {
                queue.push(index);
            }
        }
    }
    return mask;
}
export function findBoneIndexByName(rig, boneName) {
    return rig.boneNames.indexOf(boneName);
}
