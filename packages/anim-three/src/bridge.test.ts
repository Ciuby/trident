import { describe, expect, it } from "bun:test";
import { AnimationClip, Bone, QuaternionKeyframeTrack, Skeleton, VectorKeyframeTrack } from "three";
import { createRigFromSkeleton, createClipAssetFromThreeClip } from "./bridge";

describe("@ggez/anim-three", () => {
  it("creates a rig definition from a three skeleton", () => {
    const root = new Bone();
    root.name = "root";
    const child = new Bone();
    child.name = "child";
    root.add(child);
    const skeleton = new Skeleton([root, child]);

    const rig = createRigFromSkeleton(skeleton);

    expect(rig.boneNames).toEqual(["root", "child"]);
    expect(Array.from(rig.parentIndices)).toEqual([-1, 0]);
  });

  it("imports clip tracks from a three animation clip", () => {
    const root = new Bone();
    root.name = "root";
    const skeleton = new Skeleton([root]);
    const clip = new AnimationClip("Walk", 1, [
      new VectorKeyframeTrack(".bones[root].position", [0, 1], [0, 0, 0, 1, 0, 0]),
      new QuaternionKeyframeTrack(".bones[root].quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    ]);

    const asset = createClipAssetFromThreeClip(clip, skeleton);

    expect(asset.tracks).toHaveLength(1);
    expect(Array.from(asset.tracks[0]!.translationValues ?? [])).toEqual([0, 0, 0, 1, 0, 0]);
  });
});
