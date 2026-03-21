import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AnimationEditorStore } from "@ggez/anim-editor-core";
import { createAnimationArtifact, serializeAnimationArtifact } from "@ggez/anim-exporter";
import type { EditorGraphNode, ParameterDefinition } from "@ggez/anim-schema";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { AnimationPreviewPanel } from "./animation-preview-panel";
import { importAnimationFiles, importCharacterFile, type ImportedCharacterAsset, type ImportedPreviewClip } from "./preview-assets";
import { useEditorStoreValue } from "./use-editor-store-value";

const theme = {
  panelBorder: "rgba(167, 243, 208, 0.12)",
  panelBackground: "linear-gradient(180deg, rgba(8, 16, 13, 0.92) 0%, rgba(6, 11, 9, 0.98) 100%)",
  panelBackgroundSolid: "rgba(8, 16, 13, 0.94)",
  panelText: "#ecfdf5",
  panelMutedText: "rgba(236, 253, 245, 0.62)",
  fieldBorder: "rgba(167, 243, 208, 0.16)",
  fieldBackground: "rgba(255, 255, 255, 0.04)",
  fieldBackgroundStrong: "rgba(255, 255, 255, 0.06)",
  fieldText: "#ecfdf5",
  accent: "#6ee7b7",
  accentStrong: "#34d399",
  accentSoft: "rgba(52, 211, 153, 0.18)",
  danger: "#fca5a5",
  warning: "#fcd34d",
  canvasBackground: "linear-gradient(180deg, rgba(5, 8, 7, 0.98) 0%, rgba(7, 12, 10, 1) 100%)",
  canvasGrid: "rgba(110, 231, 183, 0.12)",
  edge: "rgba(167, 243, 208, 0.56)",
  edgeLabelBackground: "rgba(5, 8, 7, 0.86)",
} as const;

const panelStyle: CSSProperties = {
  border: `1px solid ${theme.panelBorder}`,
  borderRadius: 16,
  padding: 12,
  background: theme.panelBackground,
  color: theme.panelText,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${theme.fieldBorder}`,
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  color: theme.panelText,
  background: theme.fieldBackgroundStrong,
};

const helperTextStyle: CSSProperties = {
  fontSize: 12,
  color: theme.panelMutedText,
};

function useSelectedGraph(store: AnimationEditorStore) {
  return useEditorStoreValue(
    store,
    () => {
      const state = store.getState();
      return state.document.graphs.find((graph) => graph.id === state.selection.graphId) ?? state.document.graphs[0]!;
    },
    ["graphs", "selection"]
  );
}

function toCanvasNode(node: EditorGraphNode, selected = false): Node {
  return {
    id: node.id,
    position: node.position,
    data: {
      label: `${node.name}\n${node.kind}`,
    },
    selected,
    type: "default",
    style: {
      border: selected ? `2px solid ${theme.accent}` : `1px solid ${theme.fieldBorder}`,
      borderRadius: 16,
      background: "linear-gradient(180deg, rgba(10, 21, 17, 0.98) 0%, rgba(8, 16, 13, 0.98) 100%)",
      color: theme.panelText,
      padding: 12,
      width: 180,
      whiteSpace: "pre-wrap",
      boxShadow: selected
        ? "0 0 0 1px rgba(110, 231, 183, 0.18), 0 16px 40px rgba(0, 0, 0, 0.28)"
        : "0 12px 32px rgba(0, 0, 0, 0.22)",
    },
  };
}

function buildCanvasEdges(nodes: EditorGraphNode[], graphEdges: { id: string; sourceNodeId: string; targetNodeId: string }[]): Edge[] {
  const edges: Edge[] = [...graphEdges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId }))];

  nodes.forEach((node) => {
    if (node.kind === "blend1d") {
      node.children.forEach((child) => {
        edges.push({
          id: `${child.nodeId}->${node.id}`,
          source: child.nodeId,
          target: node.id,
          label: child.threshold.toString(),
        });
      });
    } else if (node.kind === "blend2d") {
      node.children.forEach((child) => {
        edges.push({
          id: `${child.nodeId}->${node.id}`,
          source: child.nodeId,
          target: node.id,
          label: `${child.x}, ${child.y}`,
        });
      });
    }
  });

  const deduped = new Map<string, Edge>();
  edges.forEach((edge) => deduped.set(edge.id, edge));
  return Array.from(deduped.values());
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>{props.title}</h3>
      {props.children}
    </section>
  );
}

function TextInput(props: {
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return <input value={props.value} type={props.type ?? "text"} onChange={(event) => props.onChange(event.target.value)} style={fieldStyle} />;
}

function SelectInput(props: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      style={{
        ...fieldStyle,
        appearance: "none",
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ToolbarButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        border: `1px solid ${theme.fieldBorder}`,
        borderRadius: 999,
        padding: "8px 12px",
        background: theme.accentSoft,
        color: theme.panelText,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
    >
      {props.label}
    </button>
  );
}

function NodeInspector({ store }: { store: AnimationEditorStore }) {
  const state = useEditorStoreValue(store, () => store.getState(), ["selection", "graphs", "parameters"]);
  const graph = state.document.graphs.find((entry) => entry.id === state.selection.graphId);
  const node = graph?.nodes.find((entry) => entry.id === state.selection.nodeIds[0]);

  if (!graph || !node) {
    return <div style={{ color: theme.panelMutedText, fontSize: 13 }}>Select a node to edit its properties.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Name</div>
        <TextInput value={node.name} onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, name: value }))} />
      </label>

      {node.kind === "clip" ? (
        <>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Clip</div>
            <SelectInput
              value={node.clipId}
              onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, clipId: value }))}
              options={state.document.clips.map((clip) => ({ label: clip.name, value: clip.id }))}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Speed</div>
            <TextInput
              type="number"
              value={node.speed}
              onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, speed: Number(value) }))}
            />
          </label>
        </>
      ) : null}

      {node.kind === "blend1d" ? (
        <>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Parameter</div>
            <SelectInput
              value={node.parameterId}
              onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, parameterId: value }))}
              options={state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id }))}
            />
          </label>
          <div style={helperTextStyle}>Children are created by connecting clip nodes into this blend node on the canvas.</div>
        </>
      ) : null}

      {node.kind === "blend2d" ? (
        <>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>X Parameter</div>
            <SelectInput
              value={node.xParameterId}
              onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, xParameterId: value }))}
              options={state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id }))}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Y Parameter</div>
            <SelectInput
              value={node.yParameterId}
              onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, yParameterId: value }))}
              options={state.document.parameters.map((parameter) => ({ label: parameter.name, value: parameter.id }))}
            />
          </label>
        </>
      ) : null}

      {node.kind === "subgraph" ? (
        <label>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Graph</div>
          <SelectInput
            value={node.graphId}
            onChange={(value) => store.updateNode(graph.id, node.id, (current) => ({ ...current, graphId: value }))}
            options={state.document.graphs.map((entry) => ({ label: entry.name, value: entry.id }))}
          />
        </label>
      ) : null}

      {node.kind === "output" ? <div style={helperTextStyle}>Connect a motion node into the output node to define the graph result.</div> : null}

      {node.kind === "stateMachine" ? (
        <div style={helperTextStyle}>
          State machine data is present in the schema and compiler. Rich editing UI can be expanded on this store without changing runtime contracts.
        </div>
      ) : null}
    </div>
  );
}

export function AnimationEditorWorkspace(props: { store: AnimationEditorStore }) {
  const { store } = props;
  const state = useEditorStoreValue(store, () => store.getState(), ["document", "selection", "compile", "clipboard"]);
  const graph = useSelectedGraph(store);
  const [artifactJson, setArtifactJson] = useState("");
  const [character, setCharacter] = useState<ImportedCharacterAsset | null>(null);
  const [importedClips, setImportedClips] = useState<ImportedPreviewClip[]>([]);
  const [assetStatus, setAssetStatus] = useState("Import a rigged character to unlock preview and rig-aware compilation.");
  const [assetError, setAssetError] = useState<string | null>(null);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const animationInputRef = useRef<HTMLInputElement | null>(null);

  const nodes = useMemo(() => graph.nodes.map((node) => toCanvasNode(node, state.selection.nodeIds.includes(node.id))), [graph, state.selection.nodeIds]);
  const edges = useMemo(() => buildCanvasEdges(graph.nodes, graph.edges), [graph]);

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    store.connectNodes(graph.id, connection.source, connection.target);
  }

  function handleCompile() {
    const result = store.compile();
    if (result.graph) {
      setArtifactJson(
        serializeAnimationArtifact(
          createAnimationArtifact({
            graph: result.graph,
          })
        )
      );
      return;
    }

    setArtifactJson("");
  }

  async function handleCharacterImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing character "${file.name}"...`);
      const nextCharacter = await importCharacterFile(file, state.document.clips.map((clip) => clip.id));
      setCharacter(nextCharacter);
      setImportedClips(nextCharacter.clips);
      store.setRig(nextCharacter.documentRig);
      store.upsertClips(nextCharacter.clips.map((clip) => clip.reference));
      setAssetStatus(`Loaded "${file.name}" with ${nextCharacter.rig.boneNames.length} bones and ${nextCharacter.clips.length} embedded clips.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import character.";
      setAssetError(message);
      setAssetStatus("Character import failed.");
    }
  }

  async function handleAnimationImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (!character) {
      setAssetError("Import a rigged character first so external animation files can be mapped onto its skeleton.");
      return;
    }

    try {
      setAssetError(null);
      setAssetStatus(`Importing ${files.length} animation file(s)...`);
      const nextClips = await importAnimationFiles(
        files,
        character.skeleton,
        new Set([...state.document.clips.map((clip) => clip.id), ...importedClips.map((clip) => clip.id)])
      );
      setImportedClips((current) => {
        const merged = new Map(current.map((clip) => [clip.id, clip]));
        nextClips.forEach((clip) => merged.set(clip.id, clip));
        return Array.from(merged.values());
      });
      store.upsertClips(nextClips.map((clip) => clip.reference));
      setAssetStatus(`Imported ${nextClips.length} animation clip(s) from ${files.length} file(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import animation files.";
      setAssetError(message);
      setAssetStatus("Animation import failed.");
    }
  }

  return (
    <ReactFlowProvider>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px minmax(0, 1fr) 320px",
          gridTemplateRows: "auto minmax(0, 1fr)",
          gap: 16,
          height: "100%",
          minHeight: 0,
        }}
      >
        <div style={{ gridColumn: "1 / span 3", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ToolbarButton label="Compile" onClick={handleCompile} />
          <ToolbarButton label="Import Character" onClick={() => characterInputRef.current?.click()} />
          <ToolbarButton label="Import Animations" onClick={() => animationInputRef.current?.click()} />
          <ToolbarButton label="Undo" onClick={() => store.undo()} />
          <ToolbarButton label="Redo" onClick={() => store.redo()} />
          <ToolbarButton label="Copy" onClick={() => store.copySelection()} />
          <ToolbarButton label="Paste" onClick={() => store.pasteSelection()} />
          <ToolbarButton label="Duplicate" onClick={() => store.duplicateSelection()} />
          <ToolbarButton label="Delete" onClick={() => store.deleteSelectedNodes()} />
          <ToolbarButton label="Add Clip Node" onClick={() => store.addNode(graph.id, "clip")} />
          <ToolbarButton label="Add Blend1D" onClick={() => store.addNode(graph.id, "blend1d")} />
          <ToolbarButton label="Add Blend2D" onClick={() => store.addNode(graph.id, "blend2d")} />
          <ToolbarButton label="Add Subgraph" onClick={() => store.addNode(graph.id, "subgraph")} />
          <ToolbarButton label="Add Graph" onClick={() => store.addGraph()} />
          <input ref={characterInputRef} type="file" accept=".glb,.gltf,.fbx" hidden onChange={handleCharacterImport} />
          <input ref={animationInputRef} type="file" accept=".glb,.gltf,.fbx" multiple hidden onChange={handleAnimationImport} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <Panel title="Assets">
            <div style={helperTextStyle}>
              This is where your rigged character and animation files go. Import a character first, then optional extra animation files.
            </div>
            <ToolbarButton label="Choose Character File" onClick={() => characterInputRef.current?.click()} />
            <ToolbarButton label="Choose Animation Files" onClick={() => animationInputRef.current?.click()} />
            <div style={{ ...helperTextStyle, color: assetError ? theme.danger : theme.panelMutedText }}>
              {assetError ?? assetStatus}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: theme.panelText }}>
                Character: {character ? character.fileName : "none"}
              </div>
              <div style={{ fontSize: 12, color: theme.panelText }}>
                Imported clips: {importedClips.length}
              </div>
            </div>
          </Panel>

          <Panel title="Graphs">
            {state.document.graphs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => store.selectGraph(entry.id)}
                style={{
                  border: entry.id === state.selection.graphId ? `2px solid ${theme.accent}` : `1px solid ${theme.fieldBorder}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  textAlign: "left",
                  background: entry.id === state.selection.graphId ? theme.accentSoft : theme.fieldBackground,
                  color: theme.panelText,
                  cursor: "pointer",
                }}
              >
                {entry.name}
              </button>
            ))}
          </Panel>

          <Panel title="Parameters">
            {state.document.parameters.map((parameter) => (
              <div key={parameter.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
                <TextInput value={parameter.name} onChange={(value) => store.updateParameter(parameter.id, { name: value })} />
                <SelectInput
                  value={parameter.type}
                  onChange={(value) => store.updateParameter(parameter.id, { type: value as ParameterDefinition["type"] })}
                  options={[
                    { label: "Float", value: "float" },
                    { label: "Int", value: "int" },
                    { label: "Bool", value: "bool" },
                    { label: "Trigger", value: "trigger" },
                  ]}
                />
              </div>
            ))}
            <ToolbarButton label="Add Parameter" onClick={() => store.addParameter()} />
          </Panel>

          <Panel title="Layers">
            {state.document.layers.map((layer) => (
              <div key={layer.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <TextInput value={layer.name} onChange={(value) => store.updateLayer(layer.id, { name: value })} />
                <SelectInput
                  value={layer.graphId}
                  onChange={(value) => store.updateLayer(layer.id, { graphId: value })}
                  options={state.document.graphs.map((entry) => ({ label: entry.name, value: entry.id }))}
                />
              </div>
            ))}
            <ToolbarButton label="Add Layer" onClick={() => store.addLayer()} />
          </Panel>

          <Panel title="Masks">
            {state.document.masks.map((mask) => (
              <div key={mask.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <TextInput value={mask.name} onChange={(value) => store.updateMask(mask.id, { name: value })} />
                <TextInput value={mask.rootBoneName ?? ""} onChange={(value) => store.updateMask(mask.id, { rootBoneName: value || undefined })} />
              </div>
            ))}
            <ToolbarButton label="Add Mask" onClick={() => store.addMask()} />
          </Panel>
        </div>

        <div
          style={{
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 20,
            overflow: "hidden",
            minHeight: 0,
            background: theme.canvasBackground,
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            colorMode="dark"
            fitView
            defaultEdgeOptions={{
              style: {
                stroke: theme.edge,
                strokeWidth: 1.5,
              },
              labelStyle: {
                fill: theme.panelText,
                fontSize: 11,
                fontWeight: 600,
              },
              labelBgStyle: {
                fill: theme.edgeLabelBackground,
                fillOpacity: 1,
                stroke: theme.fieldBorder,
              },
            }}
            style={{ background: theme.canvasBackground }}
            onSelectionChange={(selection) => {
              store.selectNodes(selection.nodes.map((node) => node.id));
            }}
            onNodeDragStop={(_, draggedNode) => {
              store.moveNodes(graph.id, {
                [draggedNode.id]: draggedNode.position,
              });
            }}
            onConnect={handleConnect}
          >
            <MiniMap
              pannable
              zoomable
              style={{ backgroundColor: theme.panelBackgroundSolid, border: `1px solid ${theme.panelBorder}` }}
              maskColor="rgba(5, 8, 7, 0.78)"
              nodeColor={theme.accentStrong}
            />
            <Controls />
            <Background color={theme.canvasGrid} />
          </ReactFlow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <AnimationPreviewPanel store={store} character={character} importedClips={importedClips} />

          <Panel title="Inspector">
            <NodeInspector store={store} />
          </Panel>

          <Panel title="Diagnostics">
            {state.diagnostics.length === 0 ? (
              <div style={{ color: theme.panelMutedText, fontSize: 13 }}>No diagnostics yet. Compile to validate the document.</div>
            ) : (
              state.diagnostics.map((diagnostic, index) => (
                <div
                  key={`${diagnostic.message}-${index}`}
                  style={{
                    borderLeft: diagnostic.severity === "error" ? `3px solid ${theme.danger}` : `3px solid ${theme.warning}`,
                    paddingLeft: 8,
                    fontSize: 13,
                  }}
                >
                  <strong style={{ textTransform: "capitalize" }}>{diagnostic.severity}</strong>: {diagnostic.message}
                </div>
              ))
            )}
          </Panel>

          <Panel title="Artifact Preview">
            <textarea
              value={artifactJson}
              readOnly
              style={{
                ...fieldStyle,
                minHeight: 240,
                borderRadius: 12,
                padding: 10,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
              }}
            />
          </Panel>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
