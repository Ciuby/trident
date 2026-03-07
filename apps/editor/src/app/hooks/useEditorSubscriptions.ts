import { useEffect } from "react";
import type { EditorCore } from "@web-hammer/editor-core";

export function useEditorSubscriptions(editor: EditorCore, setRevision: React.Dispatch<React.SetStateAction<number>>) {
  useEffect(() => {
    const unsubscribeScene = editor.events.on("scene:changed", () => {
      setRevision((revision) => revision + 1);
    });
    const unsubscribeSelection = editor.events.on("selection:changed", () => {
      setRevision((revision) => revision + 1);
    });

    if (editor.selection.ids.length === 0) {
      const firstNode = editor.scene.nodes.values().next().value;

      if (firstNode) {
        editor.select([firstNode.id], "object");
      }
    }

    return () => {
      unsubscribeScene();
      unsubscribeSelection();
    };
  }, [editor, setRevision]);
}
