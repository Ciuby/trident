import { proxy } from "valtio";
import { createViewportState, type ViewportState } from "@web-hammer/render-pipeline";

type UiStore = {
  leftPanel: "scene" | "assets";
  rightPanel: "inspector" | "materials";
  viewport: ViewportState;
};

export const uiStore = proxy<UiStore>({
  leftPanel: "scene",
  rightPanel: "inspector",
  viewport: createViewportState()
});
