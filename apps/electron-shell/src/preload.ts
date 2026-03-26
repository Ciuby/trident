import { contextBridge, ipcRenderer } from "electron";

/**
 * Electron Preload Script
 *
 * Exposes a safe bridge to the renderer process via window.electronAPI.
 * Provides file system operations, project management, and menu event listeners.
 */

const electronAPI = {
  // ── Identity ──────────────────────────────────────────────────────

  /** True when running inside Electron */
  isElectron: true as const,

  /** Platform identifier (win32, darwin, linux) */
  platform: process.platform,

  // ── Menu Events from Main Process ─────────────────────────────────

  onSave: (callback: () => void) => {
    ipcRenderer.on("menu:save", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:save"); };
  },

  onUndo: (callback: () => void) => {
    ipcRenderer.on("menu:undo", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:undo"); };
  },

  onRedo: (callback: () => void) => {
    ipcRenderer.on("menu:redo", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:redo"); };
  },

  onCreateProject: (callback: () => void) => {
    ipcRenderer.on("menu:createProject", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:createProject"); };
  },

  onOpenProject: (callback: () => void) => {
    ipcRenderer.on("menu:openProject", () => callback());
    return () => { ipcRenderer.removeAllListeners("menu:openProject"); };
  },

  // ── File System ───────────────────────────────────────────────────

  /** Read a file. Pass encoding='utf8' for text, omit for binary (returns base64). */
  readFile: (filePath: string, encoding?: string) =>
    ipcRenderer.invoke("fs:readFile", filePath, encoding),

  /** Write a file. Pass string for text, or { base64: string } for binary. */
  writeFile: (filePath: string, data: string | { base64: string }) =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  /** Read directory contents (flat list). */
  readDir: (dirPath: string) =>
    ipcRenderer.invoke("fs:readDir", dirPath),

  /** Read directory tree recursively (nested). */
  readDirTree: (dirPath: string) =>
    ipcRenderer.invoke("fs:readDirTree", dirPath),

  /** Delete a file or directory recursively. */
  deleteFile: (targetPath: string) =>
    ipcRenderer.invoke("fs:deleteFile", targetPath),

  /** Rename or move a file/directory. */
  rename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke("fs:rename", oldPath, newPath),

  /** Copy a file. */
  copyFile: (src: string, dest: string) =>
    ipcRenderer.invoke("fs:copyFile", src, dest),

  /** Get file/directory metadata. */
  stat: (filePath: string) =>
    ipcRenderer.invoke("fs:stat", filePath),

  /** Create a directory (recursive). */
  mkdir: (dirPath: string) =>
    ipcRenderer.invoke("fs:mkdir", dirPath),

  // ── Project Management ────────────────────────────────────────────

  openProject: () =>
    ipcRenderer.invoke("project:open"),

  openRecentProject: (projectPath: string) =>
    ipcRenderer.invoke("project:openRecent", projectPath),

  openAnimationStudio: () =>
    ipcRenderer.invoke("app:openAnimationStudio"),

  /** Open a native dialog + scaffold a new project with create-ggez. Returns the path or null. */
  createProject: () =>
    ipcRenderer.invoke("project:create"),

  /** Get the currently opened project path (or null). */
  getCurrentProject: () =>
    ipcRenderer.invoke("project:getCurrent"),

  /** Listen for project open/create events from the main process. */
  onProjectOpened: (callback: (projectPath: string) => void) => {
    ipcRenderer.on("project:opened", (_event, projectPath: string) => callback(projectPath));
    return () => { ipcRenderer.removeAllListeners("project:opened"); };
  },

  // ── Terminal ───────────────────────────────────────────────────────

  /** Run a shell command in the given directory. Returns { stdout, stderr, exitCode }. */
  runCommand: (command: string, cwd?: string) =>
    ipcRenderer.invoke("terminal:runCommand", command, cwd),

  /** Spawn a long-running process. Returns a pid string. */
  spawnProcess: (command: string, cwd?: string) =>
    ipcRenderer.invoke("terminal:spawn", command, cwd),

  /** Kill a process by pid. */
  killProcess: (pid: string) =>
    ipcRenderer.invoke("terminal:kill", pid),

  /** Listen for stream chunk data from spawned processes. */
  onProcessData: (callback: (payload: { pid: string; type: "output" | "error"; text: string }) => void) => {
    const listener = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => { ipcRenderer.removeListener("terminal:data", listener); };
  },

  /** Listen for process termination. */
  onProcessExit: (callback: (payload: { pid: string; exitCode: number | null }) => void) => {
    const listener = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => { ipcRenderer.removeListener("terminal:exit", listener); };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// ── Type export for renderer ──
export type ElectronAPI = typeof electronAPI;
