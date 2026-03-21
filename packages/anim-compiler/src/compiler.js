import { createBoneMaskFromBranch, createRigDefinition, findBoneIndexByName } from "@ggez/anim-core";
import { ANIMATION_GRAPH_VERSION, animationEditorDocumentSchema } from "@ggez/anim-schema";
function error(message, path) {
    return { severity: "error", message, path };
}
function warning(message, path) {
    return { severity: "warning", message, path };
}
function toRig(document) {
    if (!document.rig) {
        return undefined;
    }
    return createRigDefinition({
        boneNames: document.rig.boneNames,
        parentIndices: document.rig.parentIndices,
        rootBoneIndex: document.rig.rootBoneIndex,
        bindTranslations: document.rig.bindTranslations,
        bindRotations: document.rig.bindRotations,
        bindScales: document.rig.bindScales
    });
}
function compileMasks(document, rig, diagnostics) {
    if (!rig) {
        if (document.masks.length > 0) {
            diagnostics.push(warning("Masks were authored without rig data; compiled masks will be empty.", "masks"));
        }
        return document.masks.map((mask) => ({
            name: mask.name,
            weights: []
        }));
    }
    return document.masks.map((mask, maskIndex) => {
        const compiledMask = new Float32Array(rig.boneNames.length);
        if (mask.rootBoneName) {
            const rootBoneIndex = findBoneIndexByName(rig, mask.rootBoneName);
            if (rootBoneIndex < 0) {
                diagnostics.push(error(`Mask "${mask.name}" references unknown root bone "${mask.rootBoneName}".`, `masks.${maskIndex}.rootBoneName`));
            }
            else if (mask.includeChildren) {
                compiledMask.set(createBoneMaskFromBranch(rig, rootBoneIndex, 1, 0).weights);
            }
            else {
                compiledMask[rootBoneIndex] = 1;
            }
        }
        mask.weights.forEach((weight, weightIndex) => {
            const boneIndex = findBoneIndexByName(rig, weight.boneName);
            if (boneIndex < 0) {
                diagnostics.push(error(`Mask "${mask.name}" references unknown bone "${weight.boneName}".`, `masks.${maskIndex}.weights.${weightIndex}`));
                return;
            }
            compiledMask[boneIndex] = weight.weight;
        });
        return {
            name: mask.name,
            weights: Array.from(compiledMask)
        };
    });
}
function compileConditions(document, conditions, parameterIndexById, diagnostics, pathPrefix) {
    return conditions.flatMap((condition, index) => {
        const parameterIndex = parameterIndexById.get(condition.parameterId);
        if (parameterIndex === undefined) {
            diagnostics.push(error(`Unknown parameter "${condition.parameterId}" in transition condition.`, `${pathPrefix}.${index}.parameterId`));
            return [];
        }
        return [
            {
                parameterIndex,
                operator: condition.operator,
                value: condition.value
            }
        ];
    });
}
function detectSubgraphCycles(document, diagnostics) {
    const graphMap = new Map(document.graphs.map((graph) => [graph.id, graph]));
    const visiting = new Set();
    const visited = new Set();
    function visit(graphId) {
        if (visited.has(graphId)) {
            return;
        }
        if (visiting.has(graphId)) {
            diagnostics.push(error(`Illegal circular subgraph reference detected at graph "${graphId}".`, "graphs"));
            return;
        }
        visiting.add(graphId);
        const graph = graphMap.get(graphId);
        graph?.nodes.forEach((node) => {
            if (node.kind === "subgraph") {
                visit(node.graphId);
            }
        });
        visiting.delete(graphId);
        visited.add(graphId);
    }
    document.graphs.forEach((graph) => visit(graph.id));
}
export function compileAnimationEditorDocument(input) {
    const diagnostics = [];
    const parsed = animationEditorDocumentSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            diagnostics: parsed.error.issues.map((issue) => error(issue.message, issue.path.join(".")))
        };
    }
    const document = parsed.data;
    const graphIndexById = new Map(document.graphs.map((graph, index) => [graph.id, index]));
    const parameterIndexById = new Map(document.parameters.map((parameter, index) => [parameter.id, index]));
    const clipIndexById = new Map(document.clips.map((clip, index) => [clip.id, index]));
    const rig = toRig(document);
    const masks = compileMasks(document, rig, diagnostics);
    detectSubgraphCycles(document, diagnostics);
    let machineIndexCounter = 0;
    const compiledGraphs = document.graphs.map((graph, graphIndex) => {
        const nodeIdToCompiledIndex = new Map();
        const motionNodes = graph.nodes.filter((node) => node.kind !== "output");
        motionNodes.forEach((node, index) => {
            nodeIdToCompiledIndex.set(node.id, index);
        });
        const outputNode = graph.nodes.find((node) => node.id === graph.outputNodeId && node.kind === "output");
        if (!outputNode) {
            diagnostics.push(error(`Graph "${graph.name}" is missing its output node.`, `graphs.${graphIndex}.outputNodeId`));
        }
        const outputSourceNodeId = outputNode?.sourceNodeId ??
            graph.edges.find((edge) => edge.targetNodeId === graph.outputNodeId)?.sourceNodeId;
        if (!outputSourceNodeId) {
            diagnostics.push(error(`Graph "${graph.name}" output node is not connected.`, `graphs.${graphIndex}.outputNodeId`));
        }
        const compiledNodes = [];
        motionNodes.forEach((node, nodeIndex) => {
            switch (node.kind) {
                case "clip": {
                    const clipIndex = clipIndexById.get(node.clipId);
                    if (clipIndex === undefined) {
                        diagnostics.push(error(`Clip node "${node.name}" references missing clip "${node.clipId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.clipId`));
                        return;
                    }
                    compiledNodes.push({
                        type: "clip",
                        clipIndex,
                        speed: node.speed,
                        loop: node.loop
                    });
                    return;
                }
                case "blend1d": {
                    const parameterIndex = parameterIndexById.get(node.parameterId);
                    if (parameterIndex === undefined) {
                        diagnostics.push(error(`Blend1D node "${node.name}" references missing parameter "${node.parameterId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.parameterId`));
                        return;
                    }
                    const children = node.children.flatMap((child, childIndex) => {
                        const target = nodeIdToCompiledIndex.get(child.nodeId);
                        if (target === undefined) {
                            diagnostics.push(error(`Blend1D node "${node.name}" references unknown child node "${child.nodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.children.${childIndex}.nodeId`));
                            return [];
                        }
                        return [
                            {
                                nodeIndex: target,
                                threshold: child.threshold
                            }
                        ];
                    });
                    if (children.length === 0) {
                        diagnostics.push(error(`Blend1D node "${node.name}" has no valid children.`, `graphs.${graphIndex}.nodes.${nodeIndex}.children`));
                    }
                    compiledNodes.push({
                        type: "blend1d",
                        parameterIndex,
                        children
                    });
                    return;
                }
                case "blend2d": {
                    const xParameterIndex = parameterIndexById.get(node.xParameterId);
                    const yParameterIndex = parameterIndexById.get(node.yParameterId);
                    if (xParameterIndex === undefined || yParameterIndex === undefined) {
                        diagnostics.push(error(`Blend2D node "${node.name}" references missing parameters.`, `graphs.${graphIndex}.nodes.${nodeIndex}`));
                        return;
                    }
                    const children = node.children.flatMap((child, childIndex) => {
                        const target = nodeIdToCompiledIndex.get(child.nodeId);
                        if (target === undefined) {
                            diagnostics.push(error(`Blend2D node "${node.name}" references unknown child node "${child.nodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.children.${childIndex}.nodeId`));
                            return [];
                        }
                        return [
                            {
                                nodeIndex: target,
                                x: child.x,
                                y: child.y
                            }
                        ];
                    });
                    compiledNodes.push({
                        type: "blend2d",
                        xParameterIndex,
                        yParameterIndex,
                        children
                    });
                    return;
                }
                case "subgraph": {
                    const targetGraphIndex = graphIndexById.get(node.graphId);
                    if (targetGraphIndex === undefined) {
                        diagnostics.push(error(`Subgraph node "${node.name}" references missing graph "${node.graphId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.graphId`));
                        return;
                    }
                    compiledNodes.push({
                        type: "subgraph",
                        graphIndex: targetGraphIndex
                    });
                    return;
                }
                case "stateMachine": {
                    const stateIndexById = new Map(node.states.map((state, index) => [state.id, index]));
                    const states = node.states.flatMap((state, stateIndex) => {
                        const motionNodeIndex = nodeIdToCompiledIndex.get(state.motionNodeId);
                        if (motionNodeIndex === undefined) {
                            diagnostics.push(error(`State "${state.name}" references missing motion node "${state.motionNodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.states.${stateIndex}.motionNodeId`));
                            return [];
                        }
                        return [
                            {
                                name: state.name,
                                motionNodeIndex,
                                speed: state.speed,
                                cycleOffset: state.cycleOffset
                            }
                        ];
                    });
                    const entryStateIndex = stateIndexById.get(node.entryStateId);
                    if (entryStateIndex === undefined) {
                        diagnostics.push(error(`State machine "${node.name}" references missing entry state "${node.entryStateId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.entryStateId`));
                    }
                    const compileTransitionList = (transitions, pathPrefix, isAnyState = false) => transitions.flatMap((transition, transitionIndex) => {
                        const toStateIndex = stateIndexById.get(transition.toStateId);
                        const fromStateIndex = transition.fromStateId
                            ? stateIndexById.get(transition.fromStateId)
                            : isAnyState
                                ? -1
                                : undefined;
                        if (toStateIndex === undefined || fromStateIndex === undefined) {
                            diagnostics.push(error(`Transition "${transition.id}" in state machine "${node.name}" references missing states.`, `${pathPrefix}.${transitionIndex}`));
                            return [];
                        }
                        return [
                            {
                                fromStateIndex,
                                toStateIndex,
                                duration: transition.duration,
                                hasExitTime: transition.hasExitTime,
                                exitTime: transition.exitTime,
                                interruptionSource: transition.interruptionSource,
                                conditions: compileConditions(document, transition.conditions, parameterIndexById, diagnostics, `${pathPrefix}.${transitionIndex}.conditions`)
                            }
                        ];
                    });
                    const machineIndex = machineIndexCounter;
                    machineIndexCounter += 1;
                    compiledNodes.push({
                        type: "stateMachine",
                        machineIndex,
                        entryStateIndex: entryStateIndex ?? 0,
                        states,
                        transitions: compileTransitionList(node.transitions, `graphs.${graphIndex}.nodes.${nodeIndex}.transitions`),
                        anyStateTransitions: compileTransitionList(node.anyStateTransitions, `graphs.${graphIndex}.nodes.${nodeIndex}.anyStateTransitions`, true)
                    });
                    return;
                }
            }
        });
        const rootNodeIndex = outputSourceNodeId ? nodeIdToCompiledIndex.get(outputSourceNodeId) : undefined;
        if (rootNodeIndex === undefined) {
            diagnostics.push(error(`Graph "${graph.name}" output points to an invalid node.`, `graphs.${graphIndex}.outputNodeId`));
        }
        return {
            name: graph.name,
            rootNodeIndex: rootNodeIndex ?? 0,
            nodes: compiledNodes
        };
    });
    document.layers.forEach((layer, layerIndex) => {
        if (graphIndexById.get(layer.graphId) === undefined) {
            diagnostics.push(error(`Layer "${layer.name}" references missing graph "${layer.graphId}".`, `layers.${layerIndex}.graphId`));
        }
        if (layer.maskId && !document.masks.some((mask) => mask.id === layer.maskId)) {
            diagnostics.push(error(`Layer "${layer.name}" references missing mask "${layer.maskId}".`, `layers.${layerIndex}.maskId`));
        }
    });
    const entryGraphIndex = graphIndexById.get(document.entryGraphId);
    if (entryGraphIndex === undefined) {
        diagnostics.push(error(`Entry graph "${document.entryGraphId}" does not exist.`, "entryGraphId"));
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        return {
            ok: false,
            diagnostics
        };
    }
    return {
        ok: true,
        diagnostics,
        graph: {
            version: ANIMATION_GRAPH_VERSION,
            name: document.name,
            rig: document.rig,
            parameters: document.parameters.map((parameter) => ({
                name: parameter.name,
                type: parameter.type,
                defaultValue: parameter.defaultValue
            })),
            clipSlots: document.clips.map((clip) => ({
                id: clip.id,
                name: clip.name,
                duration: clip.duration
            })),
            masks,
            graphs: compiledGraphs,
            layers: document.layers.map((layer) => ({
                name: layer.name,
                graphIndex: graphIndexById.get(layer.graphId),
                weight: layer.weight,
                blendMode: layer.blendMode,
                maskIndex: layer.maskId ? document.masks.findIndex((mask) => mask.id === layer.maskId) : undefined,
                rootMotionMode: layer.rootMotionMode,
                enabled: layer.enabled
            })),
            entryGraphIndex: entryGraphIndex
        }
    };
}
export function compileAnimationEditorDocumentOrThrow(input) {
    const result = compileAnimationEditorDocument(input);
    if (!result.ok || !result.graph) {
        throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    return result.graph;
}
