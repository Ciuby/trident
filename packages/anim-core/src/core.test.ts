import { describe, expect, it } from "bun:test";
import { addPoseAdditive, blendPosesMasked, createBoneMask, createPoseBuffer, createRigDefinition, extractRootMotionDelta, sampleClipPose, setBoneRotation, setBoneScale, setBoneTranslation } from "./index";

describe("@ggez/anim-core", () => {
  const rig = createRigDefinition({
    boneNames: ["root", "hand"],
    parentIndices: [-1, 0],
    rootBoneIndex: 0,
    bindTranslations: [0, 0, 0, 0, 0, 0],
    bindRotations: [0, 0, 0, 1, 0, 0, 0, 1],
    bindScales: [1, 1, 1, 1, 1, 1]
  });

  it("blends masked poses per bone", () => {
    const base = createPoseBuffer(rig.boneNames.length);
    const overlay = createPoseBuffer(rig.boneNames.length);
    const out = createPoseBuffer(rig.boneNames.length);
    const mask = createBoneMask(rig.boneNames.length, 0);
    mask.weights[1] = 1;

    setBoneTranslation(base, 0, 0, 0, 0);
    setBoneTranslation(base, 1, 0, 0, 0);
    setBoneRotation(base, 0, 0, 0, 0, 1);
    setBoneRotation(base, 1, 0, 0, 0, 1);
    setBoneScale(base, 0, 1, 1, 1);
    setBoneScale(base, 1, 1, 1, 1);

    setBoneTranslation(overlay, 0, 10, 0, 0);
    setBoneTranslation(overlay, 1, 5, 0, 0);
    setBoneRotation(overlay, 0, 0, 0, 0, 1);
    setBoneRotation(overlay, 1, 0, 0, 0, 1);
    setBoneScale(overlay, 0, 1, 1, 1);
    setBoneScale(overlay, 1, 1, 1, 1);

    blendPosesMasked(base, overlay, 1, mask, out);

    expect(out.translations[0]).toBe(0);
    expect(out.translations[3]).toBe(5);
  });

  it("applies additive poses relative to bind pose", () => {
    const base = createPoseBuffer(rig.boneNames.length);
    const additive = createPoseBuffer(rig.boneNames.length);
    const out = createPoseBuffer(rig.boneNames.length);

    setBoneTranslation(base, 0, 1, 0, 0);
    setBoneTranslation(additive, 0, 3, 0, 0);
    setBoneRotation(base, 0, 0, 0, 0, 1);
    setBoneRotation(additive, 0, 0, 0, 0, 1);
    setBoneScale(base, 0, 1, 1, 1);
    setBoneScale(additive, 0, 2, 1, 1);

    addPoseAdditive(base, additive, rig, 0.5, undefined, out);

    expect(out.translations[0]).toBeCloseTo(2.5);
    expect(out.scales[0]).toBeCloseTo(1.5);
  });

  it("extracts root motion deltas with xz mode", () => {
    const delta = extractRootMotionDelta(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 2, y: 3, z: 4 },
      { x: 0, y: 0, z: 0, w: 1 },
      "xz"
    );

    expect(Array.from(delta.translation)).toEqual([2, 0, 4]);
  });

  it("samples clip tracks onto a pose buffer", () => {
    const clip = {
      id: "walk",
      name: "Walk",
      duration: 1,
      tracks: [
        {
          boneIndex: 0,
          translationTimes: new Float32Array([0, 1]),
          translationValues: new Float32Array([0, 0, 0, 2, 0, 0])
        }
      ]
    };

    const pose = createPoseBuffer(rig.boneNames.length);
    sampleClipPose(clip, rig, 0.5, pose);

    expect(pose.translations[0]).toBeCloseTo(1);
  });
});
