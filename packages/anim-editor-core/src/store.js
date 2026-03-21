import { compileAnimationEditorDocument } from "@ggez/anim-compiler";
import { createStableId, Emitter } from "@ggez/anim-utils";
import { createDefaultAnimationEditorDocument, createDefaultNode } from "./defaults";
function cloneSnapshot(state) {
    return {
        document: structuredClone(state.document),
        selection: structuredClone(state.selection)
    };
}
function replaceNode(graph, nodeId, nextNode) {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === nodeId ? nextNode : node))
    };
}
function deriveGraphTopics(graphId, nodeIds = []) {
    return ["document", "graphs", `graph:${graphId}`, ...nodeIds.map((nodeId) => `node:${nodeId}`)];
}
export function createAnimationEditorStore(initialDocument = createDefaultAnimationEditorDocument()) {
    const emitter = new Emitter();
    const historyPast = [];
    const historyFuture = [];
    const state = {
        document: initialDocument,
        selection: {
            graphId: initialDocument.entryGraphId,
            nodeIds: []
        },
        diagnostics: []
    };
    function notify(topics) {
        emitter.emit(new Set(topics));
    }
    function commit(topics, mutator) {
        historyPast.push(cloneSnapshot(state));
        historyFuture.length = 0;
        mutator();
        notify(topics);
    }
    function getSelectedGraph() {
        const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
        if (!graph) {
            throw new Error(`Unknown selected graph "${state.selection.graphId}".`);
        }
        return graph;
    }
    function updateGraph(graphId, updater) {
        state.document = {
            ...state.document,
            graphs: state.document.graphs.map((graph) => (graph.id === graphId ? updater(graph) : graph))
        };
    }
    function setStateFromSnapshot(snapshot) {
        state.document = snapshot.document;
        state.selection = snapshot.selection;
    }
    return {
        getState() {
            return state;
        },
        subscribe(listener, topics = ["document"]) {
            return emitter.subscribe((changedTopics) => {
                if (topics.some((topic) => changedTopics.has(topic))) {
                    listener();
                }
            });
        },
        selectGraph(graphId) {
            state.selection = { graphId, nodeIds: [] };
            notify(["selection", "graphs", `graph:${graphId}`]);
        },
        selectNodes(nodeIds) {
            state.selection = {
                ...state.selection,
                nodeIds
            };
            notify(["selection", `graph:${state.selection.graphId}`, ...nodeIds.map((nodeId) => `node:${nodeId}`)]);
        },
        addGraph(name = "New Graph") {
            const outputNode = createDefaultNode("output", "Output");
            const graphId = createStableId("graph");
            commit(["document", "graphs", `graph:${graphId}`], () => {
                state.document = {
                    ...state.document,
                    graphs: [
                        ...state.document.graphs,
                        {
                            id: graphId,
                            name,
                            outputNodeId: outputNode.id,
                            nodes: [
                                {
                                    ...outputNode,
                                    position: { x: 320, y: 120 }
                                }
                            ],
                            edges: []
                        }
                    ]
                };
                state.selection = { graphId, nodeIds: [] };
            });
            return graphId;
        },
        renameGraph(graphId, name) {
            commit(["document", "graphs", `graph:${graphId}`], () => {
                updateGraph(graphId, (graph) => ({ ...graph, name }));
            });
        },
        addNode(graphId, kind) {
            const node = createDefaultNode(kind, kind === "blend1d" ? "Blend 1D" : kind === "blend2d" ? "Blend 2D" : kind);
            const graph = state.document.graphs.find((entry) => entry.id === graphId);
            if (!graph) {
                throw new Error(`Unknown graph "${graphId}".`);
            }
            commit(deriveGraphTopics(graphId, [node.id]), () => {
                updateGraph(graphId, (currentGraph) => ({
                    ...currentGraph,
                    nodes: [
                        ...currentGraph.nodes,
                        {
                            ...node,
                            position: {
                                x: 120 + currentGraph.nodes.length * 24,
                                y: 120 + currentGraph.nodes.length * 24
                            }
                        }
                    ]
                }));
                state.selection = { graphId, nodeIds: [node.id] };
            });
            return node.id;
        },
        updateNode(graphId, nodeId, updater) {
            commit(deriveGraphTopics(graphId, [nodeId]), () => {
                updateGraph(graphId, (graph) => {
                    const node = graph.nodes.find((entry) => entry.id === nodeId);
                    if (!node) {
                        return graph;
                    }
                    return replaceNode(graph, nodeId, updater(node));
                });
            });
        },
        moveNodes(graphId, positions) {
            commit(deriveGraphTopics(graphId, Object.keys(positions)), () => {
                updateGraph(graphId, (graph) => ({
                    ...graph,
                    nodes: graph.nodes.map((node) => positions[node.id]
                        ? {
                            ...node,
                            position: positions[node.id]
                        }
                        : node)
                }));
            });
        },
        connectNodes(graphId, sourceNodeId, targetNodeId) {
            commit(deriveGraphTopics(graphId, [sourceNodeId, targetNodeId]), () => {
                updateGraph(graphId, (graph) => {
                    const targetNode = graph.nodes.find((node) => node.id === targetNodeId);
                    if (!targetNode) {
                        return graph;
                    }
                    let nextGraph = graph;
                    if (targetNode.kind === "output") {
                        nextGraph = replaceNode(graph, targetNodeId, {
                            ...targetNode,
                            sourceNodeId
                        });
                    }
                    else if (targetNode.kind === "blend1d") {
                        nextGraph = replaceNode(graph, targetNodeId, {
                            ...targetNode,
                            children: [
                                ...targetNode.children.filter((child) => child.nodeId !== sourceNodeId),
                                {
                                    nodeId: sourceNodeId,
                                    threshold: targetNode.children.length
                                }
                            ]
                        });
                    }
                    else if (targetNode.kind === "blend2d") {
                        nextGraph = replaceNode(graph, targetNodeId, {
                            ...targetNode,
                            children: [
                                ...targetNode.children.filter((child) => child.nodeId !== sourceNodeId),
                                {
                                    nodeId: sourceNodeId,
                                    x: targetNode.children.length,
                                    y: 0
                                }
                            ]
                        });
                    }
                    const edgeId = `${sourceNodeId}->${targetNodeId}`;
                    return {
                        ...nextGraph,
                        edges: [
                            ...nextGraph.edges.filter((edge) => edge.id !== edgeId),
                            {
                                id: edgeId,
                                sourceNodeId,
                                targetNodeId
                            }
                        ]
                    };
                });
            });
        },
        deleteSelectedNodes() {
            const { graphId, nodeIds } = state.selection;
            if (nodeIds.length === 0) {
                return;
            }
            commit(deriveGraphTopics(graphId, nodeIds), () => {
                updateGraph(graphId, (graph) => ({
                    ...graph,
                    nodes: graph.nodes.filter((node) => !nodeIds.includes(node.id)),
                    edges: graph.edges.filter((edge) => !nodeIds.includes(edge.sourceNodeId) && !nodeIds.includes(edge.targetNodeId))
                }));
                state.selection = { graphId, nodeIds: [] };
            });
        },
        duplicateSelection() {
            const { graphId, nodeIds } = state.selection;
            const graph = getSelectedGraph();
            const nodes = graph.nodes.filter((node) => nodeIds.includes(node.id));
            if (nodes.length === 0) {
                return;
            }
            commit(deriveGraphTopics(graphId), () => {
                const duplicatedNodes = nodes.map((node) => ({
                    ...structuredClone(node),
                    id: createStableId(node.kind),
                    position: {
                        x: node.position.x + 32,
                        y: node.position.y + 32
                    }
                }));
                updateGraph(graphId, (currentGraph) => ({
                    ...currentGraph,
                    nodes: [...currentGraph.nodes, ...duplicatedNodes]
                }));
                state.selection = { graphId, nodeIds: duplicatedNodes.map((node) => node.id) };
            });
        },
        copySelection() {
            const graph = getSelectedGraph();
            state.clipboard = {
                graphId: graph.id,
                nodes: graph.nodes.filter((node) => state.selection.nodeIds.includes(node.id)).map((node) => structuredClone(node))
            };
            notify(["clipboard"]);
        },
        pasteSelection() {
            if (!state.clipboard || state.clipboard.nodes.length === 0) {
                return;
            }
            const graphId = state.selection.graphId;
            commit(deriveGraphTopics(graphId), () => {
                const pastedNodes = state.clipboard.nodes.map((node) => ({
                    ...structuredClone(node),
                    id: createStableId(node.kind),
                    position: {
                        x: node.position.x + 40,
                        y: node.position.y + 40
                    }
                }));
                updateGraph(graphId, (graph) => ({
                    ...graph,
                    nodes: [...graph.nodes, ...pastedNodes]
                }));
                state.selection = { graphId, nodeIds: pastedNodes.map((node) => node.id) };
            });
        },
        addParameter(parameter = {}) {
            commit(["document", "parameters"], () => {
                state.document = {
                    ...state.document,
                    parameters: [
                        ...state.document.parameters,
                        {
                            id: createStableId("param"),
                            name: parameter.name ?? `param_${state.document.parameters.length}`,
                            type: parameter.type ?? "float",
                            defaultValue: parameter.defaultValue ?? 0
                        }
                    ]
                };
            });
        },
        updateParameter(parameterId, patch) {
            commit(["document", "parameters"], () => {
                state.document = {
                    ...state.document,
                    parameters: state.document.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...patch } : parameter)
                };
            });
        },
        addLayer(layer = {}) {
            commit(["document", "layers"], () => {
                state.document = {
                    ...state.document,
                    layers: [
                        ...state.document.layers,
                        {
                            id: createStableId("layer"),
                            name: layer.name ?? `Layer ${state.document.layers.length + 1}`,
                            graphId: layer.graphId ?? state.selection.graphId,
                            weight: layer.weight ?? 1,
                            blendMode: layer.blendMode ?? "override",
                            rootMotionMode: layer.rootMotionMode ?? "none",
                            enabled: layer.enabled ?? true,
                            maskId: layer.maskId
                        }
                    ]
                };
            });
        },
        updateLayer(layerId, patch) {
            commit(["document", "layers"], () => {
                state.document = {
                    ...state.document,
                    layers: state.document.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer))
                };
            });
        },
        addMask(mask = {}) {
            commit(["document", "masks"], () => {
                state.document = {
                    ...state.document,
                    masks: [
                        ...state.document.masks,
                        {
                            id: createStableId("mask"),
                            name: mask.name ?? `Mask ${state.document.masks.length + 1}`,
                            rootBoneName: mask.rootBoneName,
                            includeChildren: mask.includeChildren ?? true,
                            weights: mask.weights ?? []
                        }
                    ]
                };
            });
        },
        updateMask(maskId, patch) {
            commit(["document", "masks"], () => {
                state.document = {
                    ...state.document,
                    masks: state.document.masks.map((mask) => (mask.id === maskId ? { ...mask, ...patch } : mask))
                };
            });
        },
        addClip(clip = {}) {
            commit(["document"], () => {
                state.document = {
                    ...state.document,
                    clips: [
                        ...state.document.clips,
                        {
                            id: clip.id ?? createStableId("clip-ref"),
                            name: clip.name ?? `Clip ${state.document.clips.length + 1}`,
                            duration: clip.duration ?? 1,
                            source: clip.source
                        }
                    ]
                };
            });
        },
        updateClip(clipId, patch) {
            commit(["document"], () => {
                state.document = {
                    ...state.document,
                    clips: state.document.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip))
                };
            });
        },
        compile() {
            const result = compileAnimationEditorDocument(state.document);
            state.compileResult = result;
            state.diagnostics = result.diagnostics;
            notify(["compile"]);
            return result;
        },
        undo() {
            const snapshot = historyPast.pop();
            if (!snapshot) {
                return;
            }
            historyFuture.push(cloneSnapshot(state));
            setStateFromSnapshot(snapshot);
            notify(["document", "selection", "graphs"]);
        },
        redo() {
            const snapshot = historyFuture.pop();
            if (!snapshot) {
                return;
            }
            historyPast.push(cloneSnapshot(state));
            setStateFromSnapshot(snapshot);
            notify(["document", "selection", "graphs"]);
        }
    };
}
