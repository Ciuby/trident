import { createRigDefinition } from "@ggez/anim-core";
import { ANIMATION_ARTIFACT_FORMAT, ANIMATION_ARTIFACT_VERSION, animationArtifactSchema } from "@ggez/anim-schema";
function serializeRig(rig) {
    return {
        boneNames: [...rig.boneNames],
        parentIndices: Array.from(rig.parentIndices),
        rootBoneIndex: rig.rootBoneIndex,
        bindTranslations: Array.from(rig.bindTranslations),
        bindRotations: Array.from(rig.bindRotations),
        bindScales: Array.from(rig.bindScales)
    };
}
function serializeClip(clip) {
    return {
        id: clip.id,
        name: clip.name,
        duration: clip.duration,
        rootBoneIndex: clip.rootBoneIndex,
        tracks: clip.tracks.map((track) => ({
            boneIndex: track.boneIndex,
            translationTimes: track.translationTimes ? Array.from(track.translationTimes) : undefined,
            translationValues: track.translationValues ? Array.from(track.translationValues) : undefined,
            rotationTimes: track.rotationTimes ? Array.from(track.rotationTimes) : undefined,
            rotationValues: track.rotationValues ? Array.from(track.rotationValues) : undefined,
            scaleTimes: track.scaleTimes ? Array.from(track.scaleTimes) : undefined,
            scaleValues: track.scaleValues ? Array.from(track.scaleValues) : undefined
        }))
    };
}
export function createAnimationArtifact(input) {
    return {
        format: ANIMATION_ARTIFACT_FORMAT,
        version: ANIMATION_ARTIFACT_VERSION,
        graph: input.graph,
        rig: input.rig ? serializeRig(input.rig) : input.graph.rig,
        clips: input.clips?.map(serializeClip) ?? []
    };
}
export function serializeAnimationArtifact(artifact) {
    return JSON.stringify(artifact, null, 2);
}
export function parseAnimationArtifactJson(json) {
    return animationArtifactSchema.parse(JSON.parse(json));
}
export function loadRigFromArtifact(artifact) {
    if (!artifact.rig) {
        return undefined;
    }
    return createRigDefinition({
        boneNames: artifact.rig.boneNames,
        parentIndices: artifact.rig.parentIndices,
        rootBoneIndex: artifact.rig.rootBoneIndex,
        bindTranslations: artifact.rig.bindTranslations,
        bindRotations: artifact.rig.bindRotations,
        bindScales: artifact.rig.bindScales
    });
}
export function loadClipsFromArtifact(artifact) {
    return artifact.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        duration: clip.duration,
        rootBoneIndex: clip.rootBoneIndex,
        tracks: clip.tracks.map((track) => ({
            boneIndex: track.boneIndex,
            translationTimes: track.translationTimes ? Float32Array.from(track.translationTimes) : undefined,
            translationValues: track.translationValues ? Float32Array.from(track.translationValues) : undefined,
            rotationTimes: track.rotationTimes ? Float32Array.from(track.rotationTimes) : undefined,
            rotationValues: track.rotationValues ? Float32Array.from(track.rotationValues) : undefined,
            scaleTimes: track.scaleTimes ? Float32Array.from(track.scaleTimes) : undefined,
            scaleValues: track.scaleValues ? Float32Array.from(track.scaleValues) : undefined
        }))
    }));
}
