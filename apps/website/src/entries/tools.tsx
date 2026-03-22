import { CommandBlock, PageShell, Section, renderPage } from "../site";

const currentPath = window.location.pathname;

renderPage(
  "GGEZ | Tools",
  <PageShell
    currentPath={currentPath}
    intro="Trident is the world editor. Animation Studio is the animation editor. Both live in this monorepo today, so the install flow is shared and the run commands are separate."
    title="Install and run the editors"
  >
    <Section
      intro="Clone the repository, then install once at the root. Bun is the package manager used across the monorepo."
      title="Install the toolchain"
    >
      <CommandBlock title="Repository setup">
        {`git clone https://github.com/vibe-stack/trident.git
cd trident
bun install`}
      </CommandBlock>
      <p>
        Once dependencies are installed, you can launch either editor independently. GitHub Pages only hosts the static website build, not the local editor server features.
      </p>
    </Section>

    <Section
      intro="Trident is the browser-based world editor for building levels, runtime bundles, and scene data."
      title="Run Trident"
    >
      <CommandBlock title="From the repository root">
        {`bun run dev`}
      </CommandBlock>
      <CommandBlock title="Direct app command">
        {`bun run --cwd apps/editor dev`}
      </CommandBlock>
      <p>
        The root <code className="rounded bg-white/8 px-2 py-1 text-sm text-white">dev</code> script currently targets Trident, so the short command is fine if you are working from the monorepo root.
      </p>
    </Section>

    <Section
      intro="Animation Studio is the animation authoring app for graphs, bundles, preview assets, and exported runtime animation data."
      title="Run Animation Studio"
    >
      <CommandBlock title="From the repository root">
        {`bun run dev:animation-editor`}
      </CommandBlock>
      <CommandBlock title="Direct app command">
        {`bun run --cwd apps/animation-editor dev`}
      </CommandBlock>
      <p>
        Use the animation editor when you want to export graph and bundle artifacts into your game project. The scaffolded app already has a place for those exports under <code className="rounded bg-white/8 px-2 py-1 text-sm text-white">src/animations</code>.
      </p>
    </Section>
  </PageShell>
);