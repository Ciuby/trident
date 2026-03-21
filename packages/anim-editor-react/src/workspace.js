import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createAnimationArtifact, serializeAnimationArtifact } from "@ggez/anim-exporter";
import { useMemo, useState } from "react";
import { useEditorStoreValue } from "./hooks";
function useSelectedGraph(store) {
    return useEditorStoreValue(store, () => {
        const state = store.getState();
        return state.document.graphs.find((graph) => graph.id === state.selection.graphId) ?? state.document.graphs[0];
    }, ["graphs", "selection"]);
}
function toCanvasNode(node, selected = false) {
    return {
        id: node.id,
        position: node.position,
        data: {
            label: `${node.name}\n${node.kind}`
        },
        selected,
        type: "default",
        style: {
            border: selected ? "2px solid #101828" : "1px solid #D0D5DD",
            borderRadius: 16,
            background: "#ffffff",
            padding: 12,
            width: 180,
            whiteSpace: "pre-wrap"
        }
    };
}
function buildCanvasEdges(nodes, graphEdges) {
    const edges = [...graphEdges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId }))];
    nodes.forEach((node) => {
        if (node.kind === "blend1d") {
            node.children.forEach((child) => {
                edges.push({
                    id: `${child.nodeId}->${node.id}`,
                    source: child.nodeId,
                    target: node.id,
                    label: child.threshold.toString()
                });
            });
        }
        else if (node.kind === "blend2d") {
            node.children.forEach((child) => {
                edges.push({
                    id: `${child.nodeId}->${node.id}`,
                    source: child.nodeId,
                    target: node.id,
                    label: `${child.x}, ${child.y}`
                });
            });
        }
    });
    const deduped = new Map();
    edges.forEach((edge) => deduped.set(edge.id, edge));
    return Array.from(deduped.values());
}
function Panel(props) {
    return (_jsxs("section", { style: {
            border: "1px solid #E4E7EC",
            borderRadius: 16,
            padding: 12,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: 10
        }, children: [_jsx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }, children: props.title }), props.children] }));
}
function TextInput(props) {
    return (_jsx("input", { value: props.value, type: props.type ?? "text", onChange: (event) => props.onChange(event.target.value), style: {
            width: "100%",
            border: "1px solid #D0D5DD",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13
        } }));
}
function SelectInput(props) {
    return (_jsx("select", { value: props.value, onChange: (event) => props.onChange(event.target.value), style: {
            width: "100%",
            border: "1px solid #D0D5DD",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            background: "#fff"
        }, children: props.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }));
}
function ToolbarButton(props) {
    return (_jsx("button", { onClick: props.onClick, style: {
            border: "1px solid #D0D5DD",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600
        }, children: props.label }));
}
function NodeInspector({ store }) {
    const state = useEditorStoreValue(store, () => store.getState(), ["selection", "graphs", "parameters"]);
    const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
    const node = graph?.nodes.find((entry) => entry.id === state.selection.nodeIds[0]);
    if (!graph || !node) {
        return _jsx("div", { style: { color: "#667085", fontSize: 13 }, children: "Select a node to edit its properties." });
    }
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Name" }), _jsx(TextInput, { value: node.name, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, name: value })) })] }), node.kind === "clip" ? (_jsxs(_Fragment, { children: [_jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Clip" }), _jsx(SelectInput, { value: node.clipId, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, clipId: value })), options: state.document.clips.map((clip) => ({ label: clip.name, value: clip.id })) })] }), _jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Speed" }), _jsx(TextInput, { type: "number", value: node.speed, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, speed: Number(value) })) })] })] })) : null, node.kind === "blend1d" ? (_jsxs(_Fragment, { children: [_jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Parameter" }), _jsx(SelectInput, { value: node.parameterId, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, parameterId: value })), options: state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id })) })] }), _jsx("div", { style: { fontSize: 12, color: "#475467" }, children: "Children are created by connecting clip nodes into this blend node on the canvas." })] })) : null, node.kind === "blend2d" ? (_jsxs(_Fragment, { children: [_jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "X Parameter" }), _jsx(SelectInput, { value: node.xParameterId, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, xParameterId: value })), options: state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id })) })] }), _jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Y Parameter" }), _jsx(SelectInput, { value: node.yParameterId, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, yParameterId: value })), options: state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id })) })] })] })) : null, node.kind === "subgraph" ? (_jsxs("label", { children: [_jsx("div", { style: { fontSize: 12, marginBottom: 4 }, children: "Graph" }), _jsx(SelectInput, { value: node.graphId, onChange: (value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, graphId: value })), options: state.document.graphs.map((entry) => ({ label: entry.name, value: entry.id })) })] })) : null, node.kind === "output" ? (_jsx("div", { style: { fontSize: 12, color: "#475467" }, children: "Connect a motion node into the output node to define the graph result." })) : null, node.kind === "stateMachine" ? (_jsx("div", { style: { fontSize: 12, color: "#475467" }, children: "State machine data is present in the schema and compiler. Rich editing UI can be expanded on this store without changing runtime contracts." })) : null] }));
}
export function AnimationEditorWorkspace(props) {
    const { store } = props;
    const state = useEditorStoreValue(store, () => store.getState(), ["document", "selection", "compile", "clipboard"]);
    const graph = useSelectedGraph(store);
    const [artifactJson, setArtifactJson] = useState("");
    const nodes = useMemo(() => graph.nodes.map((node) => toCanvasNode(node, state.selection.nodeIds.includes(node.id))), [graph, state.selection.nodeIds]);
    const edges = useMemo(() => buildCanvasEdges(graph.nodes, graph.edges), [graph]);
    function handleConnect(connection) {
        if (!connection.source || !connection.target) {
            return;
        }
        store.connectNodes(graph.id, connection.source, connection.target);
    }
    function handleCompile() {
        const result = store.compile();
        if (result.graph) {
            setArtifactJson(serializeAnimationArtifact(createAnimationArtifact({
                graph: result.graph
            })));
        }
        else {
            setArtifactJson("");
        }
    }
    return (_jsx(ReactFlowProvider, { children: _jsxs("div", { style: {
                display: "grid",
                gridTemplateColumns: "280px minmax(0, 1fr) 320px",
                gridTemplateRows: "auto minmax(0, 1fr)",
                gap: 16,
                height: "100%",
                minHeight: 0
            }, children: [_jsxs("div", { style: { gridColumn: "1 / span 3", display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx(ToolbarButton, { label: "Compile", onClick: handleCompile }), _jsx(ToolbarButton, { label: "Undo", onClick: () => store.undo() }), _jsx(ToolbarButton, { label: "Redo", onClick: () => store.redo() }), _jsx(ToolbarButton, { label: "Copy", onClick: () => store.copySelection() }), _jsx(ToolbarButton, { label: "Paste", onClick: () => store.pasteSelection() }), _jsx(ToolbarButton, { label: "Duplicate", onClick: () => store.duplicateSelection() }), _jsx(ToolbarButton, { label: "Delete", onClick: () => store.deleteSelectedNodes() }), _jsx(ToolbarButton, { label: "Add Clip Node", onClick: () => store.addNode(graph.id, "clip") }), _jsx(ToolbarButton, { label: "Add Blend1D", onClick: () => store.addNode(graph.id, "blend1d") }), _jsx(ToolbarButton, { label: "Add Blend2D", onClick: () => store.addNode(graph.id, "blend2d") }), _jsx(ToolbarButton, { label: "Add Subgraph", onClick: () => store.addNode(graph.id, "subgraph") }), _jsx(ToolbarButton, { label: "Add Graph", onClick: () => store.addGraph() })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }, children: [_jsx(Panel, { title: "Graphs", children: state.document.graphs.map((entry) => (_jsx("button", { onClick: () => store.selectGraph(entry.id), style: {
                                    border: entry.id === state.selection.graphId ? "2px solid #101828" : "1px solid #D0D5DD",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    textAlign: "left",
                                    background: "#fff",
                                    cursor: "pointer"
                                }, children: entry.name }, entry.id))) }), _jsxs(Panel, { title: "Parameters", children: [state.document.parameters.map((parameter) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }, children: [_jsx(TextInput, { value: parameter.name, onChange: (value) => store.updateParameter(parameter.id, { name: value }) }), _jsx(SelectInput, { value: parameter.type, onChange: (value) => store.updateParameter(parameter.id, { type: value }), options: [
                                                { label: "Float", value: "float" },
                                                { label: "Int", value: "int" },
                                                { label: "Bool", value: "bool" },
                                                { label: "Trigger", value: "trigger" }
                                            ] })] }, parameter.id))), _jsx(ToolbarButton, { label: "Add Parameter", onClick: () => store.addParameter() })] }), _jsxs(Panel, { title: "Layers", children: [state.document.layers.map((layer) => (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(TextInput, { value: layer.name, onChange: (value) => store.updateLayer(layer.id, { name: value }) }), _jsx(SelectInput, { value: layer.graphId, onChange: (value) => store.updateLayer(layer.id, { graphId: value }), options: state.document.graphs.map((entry) => ({ label: entry.name, value: entry.id })) })] }, layer.id))), _jsx(ToolbarButton, { label: "Add Layer", onClick: () => store.addLayer() })] }), _jsxs(Panel, { title: "Masks", children: [state.document.masks.map((mask) => (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx(TextInput, { value: mask.name, onChange: (value) => store.updateMask(mask.id, { name: value }) }), _jsx(TextInput, { value: mask.rootBoneName ?? "", onChange: (value) => store.updateMask(mask.id, { rootBoneName: value || undefined }) })] }, mask.id))), _jsx(ToolbarButton, { label: "Add Mask", onClick: () => store.addMask() })] })] }), _jsx("div", { style: {
                        border: "1px solid #E4E7EC",
                        borderRadius: 20,
                        overflow: "hidden",
                        minHeight: 0,
                        background: "linear-gradient(180deg, #FCFCFD 0%, #F8FAFC 100%)"
                    }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, fitView: true, onSelectionChange: (selection) => {
                            store.selectNodes(selection.nodes.map((node) => node.id));
                        }, onNodeDragStop: (_, draggedNode) => {
                            store.moveNodes(graph.id, {
                                [draggedNode.id]: draggedNode.position
                            });
                        }, onConnect: handleConnect, children: [_jsx(MiniMap, { pannable: true, zoomable: true }), _jsx(Controls, {}), _jsx(Background, {})] }) }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }, children: [_jsx(Panel, { title: "Inspector", children: _jsx(NodeInspector, { store: store }) }), _jsx(Panel, { title: "Diagnostics", children: state.diagnostics.length === 0 ? (_jsx("div", { style: { color: "#667085", fontSize: 13 }, children: "No diagnostics yet. Compile to validate the document." })) : (state.diagnostics.map((diagnostic, index) => (_jsxs("div", { style: {
                                    borderLeft: diagnostic.severity === "error" ? "3px solid #D92D20" : "3px solid #F79009",
                                    paddingLeft: 8,
                                    fontSize: 13
                                }, children: [_jsx("strong", { style: { textTransform: "capitalize" }, children: diagnostic.severity }), ": ", diagnostic.message] }, `${diagnostic.message}-${index}`)))) }), _jsx(Panel, { title: "Artifact Preview", children: _jsx("textarea", { value: artifactJson, readOnly: true, style: {
                                    width: "100%",
                                    minHeight: 240,
                                    border: "1px solid #D0D5DD",
                                    borderRadius: 12,
                                    padding: 10,
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                    fontSize: 12
                                } }) })] })] }) }));
}
