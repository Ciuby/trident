import type { AnimationTrack } from "@ggez/anim-core";
import type { SerializableRig } from "@ggez/anim-schema";
import type { ImportedPreviewClip } from "@/editor/preview-assets";

type Args = Record<string, unknown>;
type ChannelKind = "translation" | "rotation" | "scale";
type ChannelFrame = {
  time: number;
  values: number[];
};

type ChannelConfig = {
  kind: ChannelKind;
  components: readonly string[];
  timesKey: "translationTimes" | "rotationTimes" | "scaleTimes";
  valuesKey: "translationValues" | "rotationValues" | "scaleValues";
};

const CHANNEL_CONFIGS: readonly ChannelConfig[] = [
  {
    kind: "translation",
    components: ["X", "Y", "Z"],
    timesKey: "translationTimes",
    valuesKey: "translationValues"
  },
  {
    kind: "rotation",
    components: ["X", "Y", "Z", "W"],
    timesKey: "rotationTimes",
    valuesKey: "rotationValues"
  },
  {
    kind: "scale",
    components: ["X", "Y", "Z"],
    timesKey: "scaleTimes",
    valuesKey: "scaleValues"
  }
];

function str(args: Args, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function num(args: Args, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(args: Args, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function numArray(args: Args, key: string): number[] {
  const value = args[key];
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getChannelConfig(channel: ChannelKind): ChannelConfig {
  return CHANNEL_CONFIGS.find((entry) => entry.kind === channel) ?? CHANNEL_CONFIGS[0]!;
}

function cloneTrack(track: AnimationTrack): AnimationTrack {
  return {
    boneIndex: track.boneIndex,
    translationTimes: track.translationTimes ? new Float32Array(track.translationTimes) : undefined,
    translationValues: track.translationValues ? new Float32Array(track.translationValues) : undefined,
    rotationTimes: track.rotationTimes ? new Float32Array(track.rotationTimes) : undefined,
    rotationValues: track.rotationValues ? new Float32Array(track.rotationValues) : undefined,
    scaleTimes: track.scaleTimes ? new Float32Array(track.scaleTimes) : undefined,
    scaleValues: track.scaleValues ? new Float32Array(track.scaleValues) : undefined
  };
}

function cloneImportedClip(clip: ImportedPreviewClip): ImportedPreviewClip {
  return {
    ...clip,
    asset: {
      ...clip.asset,
      tracks: clip.asset.tracks.map(cloneTrack)
    },
    reference: { ...clip.reference }
  };
}

function findTrack(clip: ImportedPreviewClip, boneIndex: number): AnimationTrack | undefined {
  return clip.asset.tracks.find((track) => track.boneIndex === boneIndex);
}

function readChannelData(track: AnimationTrack, channel: ChannelKind): { times: Float32Array; values: Float32Array } | null {
  const config = getChannelConfig(channel);
  const times = track[config.timesKey];
  const values = track[config.valuesKey];
  if (!(times instanceof Float32Array) || !(values instanceof Float32Array) || times.length === 0 || values.length === 0) {
    return null;
  }
  return { times, values };
}

function writeChannelFrames(track: AnimationTrack, channel: ChannelKind, frames: ChannelFrame[]) {
  const config = getChannelConfig(channel);
  const componentCount = config.components.length;

  if (frames.length === 0) {
    track[config.timesKey] = undefined;
    track[config.valuesKey] = undefined;
    return;
  }

  const times = new Float32Array(frames.length);
  const values = new Float32Array(frames.length * componentCount);
  frames.forEach((frame, frameIndex) => {
    times[frameIndex] = frame.time;
    frame.values.forEach((value, componentIndex) => {
      values[frameIndex * componentCount + componentIndex] = value;
    });
  });

  track[config.timesKey] = times;
  track[config.valuesKey] = values;
}

function buildChannelFrames(track: AnimationTrack, channel: ChannelKind): ChannelFrame[] {
  const data = readChannelData(track, channel);
  if (!data) {
    return [];
  }

  const componentCount = getChannelConfig(channel).components.length;
  return Array.from({ length: data.times.length }, (_, index) => ({
    time: data.times[index]!,
    values: Array.from({ length: componentCount }, (_, componentIndex) => data.values[index * componentCount + componentIndex]!)
  }));
}

function hasTrackData(track: AnimationTrack): boolean {
  return Boolean(
    (track.translationTimes?.length ?? 0) > 0 ||
      (track.rotationTimes?.length ?? 0) > 0 ||
      (track.scaleTimes?.length ?? 0) > 0
  );
}

function normalizeQuaternion(values: number[]): number[] {
  const length = Math.hypot(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0) || 1;
  return values.map((value) => value / length);
}

function findFrameIndex(frames: ChannelFrame[], time: number): number {
  if (frames.length <= 1) {
    return 0;
  }

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = frames[mid]!.time;
    if (value <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, Math.min(frames.length - 2, high));
}

function sampleChannelFrames(frames: ChannelFrame[], channel: ChannelKind, time: number): number[] {
  const componentCount = getChannelConfig(channel).components.length;
  if (frames.length === 0) {
    return Array.from({ length: componentCount }, () => 0);
  }

  if (frames.length === 1) {
    return [...frames[0]!.values];
  }

  if (time <= frames[0]!.time) {
    return [...frames[0]!.values];
  }
  if (time >= frames[frames.length - 1]!.time) {
    return [...frames[frames.length - 1]!.values];
  }

  const index = findFrameIndex(frames, time);
  const nextIndex = Math.min(index + 1, frames.length - 1);
  const start = frames[index]!;
  const end = frames[nextIndex]!;
  const alpha = end.time === start.time ? 0 : (time - start.time) / (end.time - start.time);
  const values = start.values.map((value, componentIndex) => value + (end.values[componentIndex]! - value) * alpha);
  return channel === "rotation" ? normalizeQuaternion(values) : values;
}

function ensureBoundaryFrame(frames: ChannelFrame[], channel: ChannelKind, time: number, values: number[]): ChannelFrame[] {
  const normalizedValues = channel === "rotation" ? normalizeQuaternion(values) : values;
  const existingIndex = frames.findIndex((frame) => Math.abs(frame.time - time) <= 1e-4);
  if (existingIndex >= 0) {
    return frames.map((frame, index) => (index === existingIndex ? { ...frame, time, values: normalizedValues } : frame));
  }

  return [...frames, { time, values: normalizedValues }].sort((left, right) => left.time - right.time);
}

function resolveBoneIndices(
  clip: ImportedPreviewClip,
  rig: SerializableRig | undefined,
  boneNames: string[],
  boneIndices: number[],
  allowAll = true
): number[] {
  const resolved = new Set<number>(boneIndices.filter((entry) => Number.isInteger(entry) && entry >= 0));

  boneNames.forEach((boneName) => {
    const index = rig?.boneNames.findIndex((entry) => entry === boneName) ?? -1;
    if (index >= 0) {
      resolved.add(index);
    }
  });

  if (resolved.size > 0) {
    return Array.from(resolved).sort((left, right) => left - right);
  }

  if (!allowAll) {
    return [];
  }

  return clip.asset.tracks.map((track) => track.boneIndex).sort((left, right) => left - right);
}

function buildTimeWeight(time: number, start: number, end: number, feather: number): number {
  if (time < start || time > end) {
    return 0;
  }
  if (feather <= 0) {
    return 1;
  }

  const inWeight = clamp((time - start) / feather, 0, 1);
  const outWeight = clamp((end - time) / feather, 0, 1);
  return Math.min(inWeight, outWeight, 1);
}

function filterFramesByTime(frames: ChannelFrame[], channel: ChannelKind, start?: number, end?: number): ChannelFrame[] {
  if (start === undefined && end === undefined) {
    return frames;
  }

  const minTime = start ?? 0;
  const maxTime = end ?? Number.POSITIVE_INFINITY;
  const filtered = frames.filter((frame) => frame.time >= minTime && frame.time <= maxTime);

  if (filtered.length > 0) {
    return filtered;
  }

  const sampleTime = clamp((minTime + maxTime) * 0.5, 0, frames[frames.length - 1]?.time ?? 0);
  return [{ time: sampleTime, values: sampleChannelFrames(frames, channel, sampleTime) }];
}

function serializeChannelFrames(frames: ChannelFrame[], channel: ChannelKind) {
  const componentLabels = getChannelConfig(channel).components;
  return {
    keyCount: frames.length,
    times: frames.map((frame) => Number(frame.time.toFixed(5))),
    values: frames.map((frame) =>
      frame.values.reduce<Record<string, number>>((entry, value, componentIndex) => {
        entry[componentLabels[componentIndex]!] = Number(value.toFixed(6));
        return entry;
      }, {})
    )
  };
}

export function listClipBones(clips: ImportedPreviewClip[], rig: SerializableRig | undefined, args: Args) {
  const clipId = str(args, "clipId");
  const query = str(args, "query").trim().toLowerCase();
  const clip = clips.find((entry) => entry.id === clipId);
  if (!clip) {
    throw new Error(`Unknown clip "${clipId}".`);
  }

  return {
    clip: {
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      source: clip.source
    },
    bones: clip.asset.tracks
      .map((track) => {
        const boneName = rig?.boneNames[track.boneIndex] ?? `Bone ${track.boneIndex}`;
        return {
          boneIndex: track.boneIndex,
          boneName,
          channels: CHANNEL_CONFIGS.flatMap((config) => {
            const data = readChannelData(track, config.kind);
            if (!data) {
              return [];
            }
            return [
              {
                channel: config.kind,
                keyCount: data.times.length,
                components: config.components
              }
            ];
          })
        };
      })
      .filter((entry) => !query || entry.boneName.toLowerCase().includes(query))
  };
}

export function getClipTrackData(clips: ImportedPreviewClip[], rig: SerializableRig | undefined, args: Args) {
  const clipId = str(args, "clipId");
  const clip = clips.find((entry) => entry.id === clipId);
  if (!clip) {
    throw new Error(`Unknown clip "${clipId}".`);
  }

  const includeAllBones = bool(args, "includeAllBones") ?? false;
  const selectedBoneIndices = resolveBoneIndices(clip, rig, strArray(args, "boneNames"), numArray(args, "boneIndices"), includeAllBones);
  if (selectedBoneIndices.length === 0) {
    throw new Error("No bones selected. Provide boneNames or boneIndices, or explicitly set includeAllBones to true.");
  }

  const requestedChannels = new Set<ChannelKind>(
    strArray(args, "channels").filter((entry): entry is ChannelKind => CHANNEL_CONFIGS.some((config) => config.kind === entry))
  );
  const start = num(args, "timeStart");
  const end = num(args, "timeEnd");

  return {
    clip: {
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      source: clip.source
    },
    bones: selectedBoneIndices.flatMap((boneIndex) => {
      const track = findTrack(clip, boneIndex);
      if (!track) {
        return [];
      }

      const channels = CHANNEL_CONFIGS.flatMap((config) => {
        if (requestedChannels.size > 0 && !requestedChannels.has(config.kind)) {
          return [];
        }

        const frames = buildChannelFrames(track, config.kind);
        if (frames.length === 0) {
          return [];
        }

        const filteredFrames = filterFramesByTime(frames, config.kind, start, end);
        return [
          {
            channel: config.kind,
            components: config.components,
            ...serializeChannelFrames(filteredFrames, config.kind)
          }
        ];
      });

      if (channels.length === 0) {
        return [];
      }

      return [
        {
          boneIndex,
          boneName: rig?.boneNames[boneIndex] ?? `Bone ${boneIndex}`,
          channels
        }
      ];
    })
  };
}

export function adjustClipMotion(
  clips: ImportedPreviewClip[],
  rig: SerializableRig | undefined,
  args: Args,
  updateClip: (clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) => void
) {
  const clipId = str(args, "clipId");
  const operation = str(args, "operation");
  const clip = clips.find((entry) => entry.id === clipId);
  if (!clip) {
    throw new Error(`Unknown clip "${clipId}".`);
  }

  const selectedBoneIndices = resolveBoneIndices(clip, rig, strArray(args, "boneNames"), numArray(args, "boneIndices"), false);
  if (selectedBoneIndices.length === 0) {
    throw new Error("adjust_clip_motion requires at least one target bone.");
  }

  const selectedChannels = strArray(args, "channels").filter((entry): entry is ChannelKind =>
    CHANNEL_CONFIGS.some((config) => config.kind === entry)
  );
  const channelFilter = new Set<ChannelKind>(selectedChannels.length > 0 ? selectedChannels : CHANNEL_CONFIGS.map((config) => config.kind));
  const componentLabels = strArray(args, "components").map((entry) => entry.toUpperCase());
  const start = clamp(num(args, "timeStart") ?? 0, 0, clip.duration);
  const end = clamp(num(args, "timeEnd") ?? clip.duration, start, clip.duration);
  const feather = Math.max(num(args, "feather") ?? 0, 0);
  const factor = num(args, "factor") ?? 1;
  const offset = num(args, "offset") ?? 0;
  const offsets = numArray(args, "offsets");
  const iterations = Math.max(1, Math.floor(num(args, "iterations") ?? 1));
  const pivotTime = clamp(num(args, "pivotTime") ?? start, 0, clip.duration);

  const affectedBones: string[] = [];
  updateClip(clipId, (currentClip) => {
    const nextClip = cloneImportedClip(currentClip);
    nextClip.asset = {
      ...nextClip.asset,
      tracks: nextClip.asset.tracks
        .map((track) => {
          if (!selectedBoneIndices.includes(track.boneIndex)) {
            return track;
          }

          let didChange = false;
          const nextTrack = cloneTrack(track);
          for (const config of CHANNEL_CONFIGS) {
            if (!channelFilter.has(config.kind)) {
              continue;
            }

            let frames = buildChannelFrames(nextTrack, config.kind);
            if (frames.length === 0) {
              continue;
            }

            const selectedComponentIndices =
              componentLabels.length > 0
                ? config.components.flatMap((label, index) => (componentLabels.includes(label) ? [index] : []))
                : config.components.map((_entry, index) => index);
            if (selectedComponentIndices.length === 0) {
              continue;
            }

            if (operation === "scale") {
              const pivotValues = sampleChannelFrames(frames, config.kind, pivotTime);
              frames = frames.map((frame) => {
                const weight = buildTimeWeight(frame.time, start, end, feather);
                if (weight <= 0) {
                  return frame;
                }

                const nextValues = [...frame.values];
                selectedComponentIndices.forEach((componentIndex) => {
                  const pivot = pivotValues[componentIndex] ?? 0;
                  const scaled = pivot + (nextValues[componentIndex]! - pivot) * factor;
                  nextValues[componentIndex] = nextValues[componentIndex]! + (scaled - nextValues[componentIndex]!) * weight;
                });

                return {
                  ...frame,
                  values: config.kind === "rotation" ? normalizeQuaternion(nextValues) : nextValues
                };
              });
              didChange = true;
            } else if (operation === "offset") {
              frames = frames.map((frame) => {
                const weight = buildTimeWeight(frame.time, start, end, feather);
                if (weight <= 0) {
                  return frame;
                }

                const nextValues = [...frame.values];
                selectedComponentIndices.forEach((componentIndex, arrayIndex) => {
                  const offsetValue = offsets[arrayIndex] ?? offset;
                  nextValues[componentIndex] += offsetValue * weight;
                });
                return {
                  ...frame,
                  values: config.kind === "rotation" ? normalizeQuaternion(nextValues) : nextValues
                };
              });
              didChange = true;
            } else if (operation === "smooth") {
              for (let iteration = 0; iteration < iterations; iteration += 1) {
                frames = frames.map((frame, frameIndex) => {
                  const weight = buildTimeWeight(frame.time, start, end, feather);
                  if (weight <= 0) {
                    return frame;
                  }

                  const previous = frames[Math.max(frameIndex - 1, 0)]!;
                  const next = frames[Math.min(frameIndex + 1, frames.length - 1)]!;
                  const nextValues = [...frame.values];
                  selectedComponentIndices.forEach((componentIndex) => {
                    const smoothed = (previous.values[componentIndex]! + frame.values[componentIndex]! + next.values[componentIndex]!) / 3;
                    nextValues[componentIndex] = frame.values[componentIndex]! + (smoothed - frame.values[componentIndex]!) * weight;
                  });

                  return {
                    ...frame,
                    values: config.kind === "rotation" ? normalizeQuaternion(nextValues) : nextValues
                  };
                });
              }
              didChange = true;
            } else {
              throw new Error(`Unsupported adjust_clip_motion operation "${operation}".`);
            }

            writeChannelFrames(nextTrack, config.kind, frames);
          }

          if (didChange) {
            affectedBones.push(rig?.boneNames[track.boneIndex] ?? `Bone ${track.boneIndex}`);
          }
          return nextTrack;
        })
        .filter(hasTrackData)
    };
    nextClip.duration = nextClip.asset.duration;
    nextClip.reference = { ...nextClip.reference, duration: nextClip.asset.duration };
    return nextClip;
  });

  return {
    clipId,
    operation,
    affectedBoneCount: affectedBones.length,
    affectedBones
  };
}

function lerpValues(from: number[], to: number[], alpha: number, channel: ChannelKind): number[] {
  const values = from.map((value, index) => value + (to[index]! - value) * alpha);
  return channel === "rotation" ? normalizeQuaternion(values) : values;
}

export function matchClipTransition(
  clips: ImportedPreviewClip[],
  rig: SerializableRig | undefined,
  args: Args,
  updateClip: (clipId: string, updater: (clip: ImportedPreviewClip) => ImportedPreviewClip) => void
) {
  const fromClipId = str(args, "fromClipId");
  const toClipId = str(args, "toClipId");
  const fromClip = clips.find((entry) => entry.id === fromClipId);
  const toClip = clips.find((entry) => entry.id === toClipId);
  if (!fromClip || !toClip) {
    throw new Error("match_clip_transition requires valid fromClipId and toClipId.");
  }

  const duration = Math.max(num(args, "duration") ?? 0.15, 0.01);
  const editMode = (str(args, "editMode", "to") || "to") as "from" | "to" | "both";
  const selectedChannels = strArray(args, "channels").filter((entry): entry is ChannelKind =>
    CHANNEL_CONFIGS.some((config) => config.kind === entry)
  );
  const channelFilter = new Set<ChannelKind>(selectedChannels.length > 0 ? selectedChannels : CHANNEL_CONFIGS.map((config) => config.kind));
  const requestedBoneIndices = resolveBoneIndices(fromClip, rig, strArray(args, "boneNames"), numArray(args, "boneIndices"), true);
  const targetBoneIndices = requestedBoneIndices.filter((boneIndex) => Boolean(findTrack(toClip, boneIndex)));
  const affectedBones = targetBoneIndices.map((boneIndex) => rig?.boneNames[boneIndex] ?? `Bone ${boneIndex}`);

  const sourceBoundaryTime = fromClip.duration;
  const targetBoundaryTime = 0;

  if (editMode === "from" || editMode === "both") {
    updateClip(fromClip.id, (currentClip) => {
      const nextClip = cloneImportedClip(currentClip);
      nextClip.asset = {
        ...nextClip.asset,
        tracks: nextClip.asset.tracks.map((track) => {
          if (!targetBoneIndices.includes(track.boneIndex)) {
            return track;
          }

          const targetTrack = findTrack(toClip, track.boneIndex);
          if (!targetTrack) {
            return track;
          }

          const nextTrack = cloneTrack(track);
          CHANNEL_CONFIGS.forEach((config) => {
            if (!channelFilter.has(config.kind)) {
              return;
            }

            let frames = buildChannelFrames(nextTrack, config.kind);
            const targetFrames = buildChannelFrames(targetTrack, config.kind);
            if (frames.length === 0 || targetFrames.length === 0) {
              return;
            }

            const sourceEndValues = sampleChannelFrames(frames, config.kind, sourceBoundaryTime);
            const targetStartValues = sampleChannelFrames(targetFrames, config.kind, targetBoundaryTime);
            const matchValues = editMode === "both" ? lerpValues(sourceEndValues, targetStartValues, 0.5, config.kind) : targetStartValues;
            const blendStart = Math.max(0, sourceBoundaryTime - duration);

            frames = frames.map((frame) => {
              if (frame.time < blendStart) {
                return frame;
              }
              const alpha = duration <= 1e-5 ? 1 : clamp((frame.time - blendStart) / duration, 0, 1);
              return {
                ...frame,
                values: lerpValues(frame.values, matchValues, alpha, config.kind)
              };
            });
            frames = ensureBoundaryFrame(frames, config.kind, sourceBoundaryTime, matchValues);
            writeChannelFrames(nextTrack, config.kind, frames);
          });

          return nextTrack;
        })
      };
      nextClip.duration = nextClip.asset.duration;
      nextClip.reference = { ...nextClip.reference, duration: nextClip.asset.duration };
      return nextClip;
    });
  }

  if (editMode === "to" || editMode === "both") {
    updateClip(toClip.id, (currentClip) => {
      const nextClip = cloneImportedClip(currentClip);
      nextClip.asset = {
        ...nextClip.asset,
        tracks: nextClip.asset.tracks.map((track) => {
          if (!targetBoneIndices.includes(track.boneIndex)) {
            return track;
          }

          const sourceTrack = findTrack(fromClip, track.boneIndex);
          if (!sourceTrack) {
            return track;
          }

          const nextTrack = cloneTrack(track);
          CHANNEL_CONFIGS.forEach((config) => {
            if (!channelFilter.has(config.kind)) {
              return;
            }

            let frames = buildChannelFrames(nextTrack, config.kind);
            const sourceFrames = buildChannelFrames(sourceTrack, config.kind);
            if (frames.length === 0 || sourceFrames.length === 0) {
              return;
            }

            const sourceEndValues = sampleChannelFrames(sourceFrames, config.kind, sourceBoundaryTime);
            const targetStartValues = sampleChannelFrames(frames, config.kind, targetBoundaryTime);
            const matchValues = editMode === "both" ? lerpValues(sourceEndValues, targetStartValues, 0.5, config.kind) : sourceEndValues;
            const blendEnd = Math.min(nextClip.duration, duration);

            frames = frames.map((frame) => {
              if (frame.time > blendEnd) {
                return frame;
              }
              const alpha = blendEnd <= 1e-5 ? 1 : 1 - clamp(frame.time / blendEnd, 0, 1);
              return {
                ...frame,
                values: lerpValues(frame.values, matchValues, alpha, config.kind)
              };
            });
            frames = ensureBoundaryFrame(frames, config.kind, 0, matchValues);
            writeChannelFrames(nextTrack, config.kind, frames);
          });

          return nextTrack;
        })
      };
      nextClip.duration = nextClip.asset.duration;
      nextClip.reference = { ...nextClip.reference, duration: nextClip.asset.duration };
      return nextClip;
    });
  }

  return {
    fromClipId,
    toClipId,
    editMode,
    duration,
    affectedBoneCount: affectedBones.length,
    affectedBones
  };
}
