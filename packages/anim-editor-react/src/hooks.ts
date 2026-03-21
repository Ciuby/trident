import { useSyncExternalStore } from "react";
import type { AnimationEditorStore, EditorTopic } from "@ggez/anim-editor-core";

export function useEditorStoreValue<T>(
  store: AnimationEditorStore,
  selector: () => T,
  topics: EditorTopic[] = ["document"]
): T {
  return useSyncExternalStore(
    (listener: () => void) => store.subscribe(listener, topics),
    selector,
    selector
  );
}
