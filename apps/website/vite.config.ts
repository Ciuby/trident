import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  const explicitBase = process.env.VITE_BASE_PATH;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const inferredGithubPagesBase =
    process.env.GITHUB_ACTIONS === "true" && githubRepository
      ? `/${githubRepository.split("/")[1]}/`
      : "/";

  return {
    base: explicitBase ?? inferredGithubPagesBase,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          home: path.resolve(__dirname, "index.html"),
          gettingStarted: path.resolve(__dirname, "getting-started/index.html"),
          projectLayout: path.resolve(__dirname, "project-layout/index.html"),
          tools: path.resolve(__dirname, "tools/index.html")
        }
      }
    }
  };
});