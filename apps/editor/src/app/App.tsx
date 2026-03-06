import { useState } from "react";
import { useSnapshot } from "valtio";
import { createEditorCore, createSeedSceneDocument } from "@web-hammer/editor-core";
import { deriveRenderScene, gridSnapValues } from "@web-hammer/render-pipeline";
import { createToolSession, defaultToolId, defaultTools } from "@web-hammer/tool-system";
import { EditorShell } from "../components/EditorShell";
import { uiStore } from "../state/ui-store";

export function App() {
  const [editor] = useState(() => createEditorCore(createSeedSceneDocument()));
  const [toolSession] = useState(() => createToolSession(defaultToolId));
  const ui = useSnapshot(uiStore);
  const renderScene = deriveRenderScene(editor.scene.nodes.values(), editor.scene.entities.values());

  return (
    <EditorShell
      activeLeftPanel={ui.leftPanel}
      activeRightPanel={ui.rightPanel}
      activeToolId={toolSession.toolId}
      editor={editor}
      gridSnapValues={gridSnapValues}
      renderScene={renderScene}
      viewport={ui.viewport}
      toolCount={defaultTools.length}
    />
  );
}
