import { CommandBlock, PageShell, Section, renderPage, siteHref } from "../site";

const currentPath = window.location.pathname;

renderPage(
  "GGEZ | Getting Started",
  <PageShell
    currentPath={currentPath}
    intro="Use the CLI when you want a game project that already knows how to host runtime scenes, gameplay hooks, and animation bundles. The starter targets a vanilla Three.js workflow and stays close to plain Vite."
    title="From CLI scaffold to live game dev server"
  >
    <Section
      intro="The published scaffolder is create-ggez. It can use the default package manager or one you choose explicitly."
      title="Create your own game"
    >
      <CommandBlock title="Default package manager">
        {`bunx create-ggez my-game`}
      </CommandBlock>
      <CommandBlock title="Choose a package manager">
        {`bunx create-ggez my-game --package-manager npm`}
      </CommandBlock>
      <p>
        The generated starter currently targets the vanilla Three.js runtime workflow. That means you get a lightweight app shell instead of a hidden engine layer.
      </p>
    </Section>

    <Section
      intro="After scaffolding, install dependencies in the generated project directory."
      title="Install the project"
    >
      <CommandBlock title="Install">
        {`cd my-game
bun install`}
      </CommandBlock>
      <p>
        If you generated the project with another package manager, use that manager for install and scripts instead. The starter README mirrors those commands.
      </p>
    </Section>

    <Section
      intro="The starter exposes the standard Vite commands you expect, with TypeScript typechecking in build."
      title="Run your game dev server"
    >
      <CommandBlock title="Development">
        {`bun run dev`}
      </CommandBlock>
      <CommandBlock title="Build and preview">
        {`bun run build
bun run preview`}
      </CommandBlock>
      <p>
        Start with <code className="rounded bg-white/8 px-2 py-1 text-sm text-white">bun run dev</code>, move around in the included scene, then swap in your own exported runtime scene and assets.
      </p>
      <p>
        The next page covers the generated folder structure in detail so you know where scenes, gameplay code, and animation bundles belong.
      </p>
      <p>
        <a className="page-link inline-flex rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950" href={siteHref("project-layout/")}>Read the project layout</a>
      </p>
    </Section>
  </PageShell>
);