import { useRef } from "react";
import { createAnimationEditorStore } from "@ggez/anim-editor-core";
import { AnimationEditorWorkspace } from "./editor/animation-editor-workspace";

function App() {
  const storeRef = useRef(createAnimationEditorStore());

  return (
    <main className="min-h-screen p-4 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1800px] flex-col gap-4">
        <header className="rounded-[28px] border border-white/8 bg-black/20 p-6 backdrop-blur-xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">
                @ggez animation stack
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Animation Graph Editor
              </h1>
              <p className="max-w-3xl text-sm text-emerald-50/72">
                Author editor documents, compile them into runtime graphs, and export
                framework-agnostic artifacts without pushing animation logic into React.
              </p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-[12px] text-emerald-50/70">
              <span>Core runtime: typed-array pose evaluation</span>
              <span>Compiler: schema validation and runtime indexing</span>
              <span>Bridge: Three.js import and skeleton application</span>
            </div>
          </div>
        </header>

        <section className="min-h-0 flex-1 rounded-[32px] border border-white/8 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <AnimationEditorWorkspace store={storeRef.current} />
        </section>
      </div>
    </main>
  );
}

export default App;
