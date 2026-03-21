import { useSyncExternalStore } from "react";
export function useEditorStoreValue(store, selector, topics = ["document"]) {
    return useSyncExternalStore((listener) => store.subscribe(listener, topics), selector, selector);
}
