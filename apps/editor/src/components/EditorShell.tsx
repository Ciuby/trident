import type { EditorCore } from "@web-hammer/editor-core";
import type { DerivedRenderScene, GridSnapValue, ViewportState } from "@web-hammer/render-pipeline";
import { toTuple } from "@web-hammer/shared";
import { SidebarPanel } from "./SidebarPanel";
import { ViewportCanvas } from "../viewport/ViewportCanvas";

type EditorShellProps = {
  activeLeftPanel: string;
  activeRightPanel: string;
  activeToolId: string;
  editor: EditorCore;
  gridSnapValues: readonly GridSnapValue[];
  renderScene: DerivedRenderScene;
  toolCount: number;
  viewport: ViewportState;
};

export function EditorShell({
  activeLeftPanel,
  activeRightPanel,
  activeToolId,
  editor,
  gridSnapValues,
  renderScene,
  toolCount,
  viewport
}: EditorShellProps) {
  const nodes = Array.from(editor.scene.nodes.values());
  const entities = Array.from(editor.scene.entities.values());
  const firstNode = nodes[0];

  return (
    <div className="editor-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WEB HAMMER</p>
          <h1>Source-2-style web level editor scaffold</h1>
        </div>

        <div className="topbar-stats">
          <span>{nodes.length} nodes</span>
          <span>{entities.length} entities</span>
          <span>{renderScene.meshes.length} drawables</span>
          <span>{toolCount} tools</span>
          <span>snap {viewport.grid.snapSize}</span>
        </div>
      </header>

      <main className="workspace">
        <SidebarPanel title="Scene" badge={activeLeftPanel}>
          <ul className="list">
            {nodes.map((node) => (
              <li key={node.id}>
                <strong>{node.name}</strong>
                <span>{node.kind}</span>
              </li>
            ))}
          </ul>
        </SidebarPanel>

        <section className="viewport-panel">
          <div className="viewport-toolbar">
            <span>tool {activeToolId}</span>
            <span>{viewport.projection} camera</span>
            <span>snap set {gridSnapValues.join(" / ")}</span>
            <span>grid {viewport.grid.size}u</span>
            {firstNode ? (
              <span>
                focus {firstNode.name} @ {toTuple(firstNode.transform.position).join(", ")}
              </span>
            ) : null}
          </div>

          <ViewportCanvas renderScene={renderScene} viewport={viewport} />
        </section>

        <SidebarPanel title="Inspector" badge={activeRightPanel}>
          {firstNode ? (
            <div className="inspector-stack">
              <div>
                <p className="label">Node</p>
                <strong>{firstNode.name}</strong>
              </div>
              <div>
                <p className="label">Kind</p>
                <strong>{firstNode.kind}</strong>
              </div>
              <div>
                <p className="label">Position</p>
                <strong>{toTuple(firstNode.transform.position).join(", ")}</strong>
              </div>
              <div>
                <p className="label">Camera Target</p>
                <strong>{toTuple(viewport.camera.target).join(", ")}</strong>
              </div>
            </div>
          ) : (
            <p>No selection</p>
          )}
        </SidebarPanel>
      </main>
    </div>
  );
}
