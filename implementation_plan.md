# Electron Integration Plan per Trident / GGEZ

Questo piano descrive i passaggi per migrare Trident (e/o Animation Studio) in un'applicazione desktop Electron completa con Monaco Editor, gestione files nativa, e project management.

## 1. Architettura File System e Texture Management

L'obiettivo è abbandonare l'approccio browser (`FileReader`, Data URL nei materials) per avere letture/scritture reali su disco, seguendo la struttura `create-ggez`.

### Nuovo Workflow Texture
- **Prima (Browser):** L'utente fa l'upload di un'immagine, Trident estrae il data URL Base64 in `importMaterial` e lo salva inline nel json `.whmap`.
- **Dopo (Electron):**
  1. Quando si importa una texture, l'editor la **dovrà copiare fisicamente** in `{project_root}/src/scenes/assets/modelli-e-texture/{name}.png`.
  2. Nel JSON del manifesto verrà salvato **solo il path relativo** (es. `assets/texture/muro.png`).
  3. L'editor leggerà l'immagine via protocollo custom locale (es. `project://assets/texture/muro.png`) gestito tramite un "protocol handler" Electron.

### File Browser (File Tree)
Un nuovo componente React "File Browser" in una sidebar (o Pannello destro) comunicherà via IPC con Node.js per:
- `fs.readdir` (leggere l'albero `src/scenes` e `src/animations`)
- `chokidar` (in [main.ts](file:///K:/Repository/trident/packages/create-ggez/template/vanilla-three/src/main.ts) di Electron) invierà eventi React per triggerare un refresh visivo dopo edit/delete/create esterni.
- Bottone Refresh, Rename, Delete files, Upload.

## 2. Integrazione Monaco Editor

Il file/logic viewer sarà esteso per usare `@monaco-editor/react`. Questo fornirà highlight per JSON (.whmap), script e JSON-LD configs.
- Cliccando su un file nel nuovo File Browser, aprirà Monaco in un tab centrale.
- L'auto-save aggiornerà i file via `ipcRenderer.invoke`.

## 3. Struttura Electron (New Package: `apps/electron-shell`)

Invece di appesantire il single app `apps/editor` con package electron mischiati, creeremo un package dedicato in `apps/electron-shell`:

```text
apps/electron-shell/
├── src/
│   ├── main.ts              # Electron Entry (WindowManager, IPC Handlers, Menu, FS)
│   ├── preload.ts           # ContextBridge (espone window.electronAPI all'editor)
│   └── index.html           # In produzione, bridge. In dev carica localhost:5173
├── scripts/
│   └── dev.ts               # Avvia Vite editor + Vite Anim Studio + Electron run
├── package.json
└── tsconfig.json
```

### Script aggiunto:
Aggiungeremo al root monorepo: `"dev:electron": "bun run --cwd apps/electron-shell dev"`

## 4. Fasi di Implementazione (Roadmap)

### Fase 1: Setup Electron Base e Finestre
- [x] Creare il nuovo package `apps/electron-shell` con Vite + Electron (`electronic-vite` o manual setup).
- [x] Creare il main process Node con l'apertura tramite `loadURL('http://localhost:5173')` per dev.
- [x] Aggiungere lo script `dev:electron` globale.
- [x] Aggiungere Native Menus (File -> New Project, Open Project...).

### Fase 2: File System Bridge (IPC) e Gestione Progetto
- [x] Creare `preload.ts` e le API IPC Node (`window.electronAPI.readFile`, `writeFile`, `readDir`).
- [x] Aggiungere il menu "Create Project" che in Node esegue npx/bun `create-ggez` su una cartella scelta dall'utente.
- [x] Aggiungere il protocollo locale Electron per servire file texture in modo che Three.js ci acceda come url normali (`trident://file-path`).

### Fase 3: Rielaborazione File Browser / Monaco Editor nell'UI Trident
- [x] Installare `@monaco-editor/react` in `apps/editor`.
- [x] Modificare l'interfaccia dell'editor React (`EditorShell.tsx`) per avere un nuovo tab "Project Files" sulla sinistra/destra.
- [x] Aggiungere Logica File Browser (leggi cartella progetto dal path passato da Electron, pulsanti CRUD, upload).
- [x] Implementare l'uso di Monaco per clic/edit dei JSON/.ts scripts.

### Fase 4: Refactor Texture Management
- [x] Modificare Trident e la funzione di export e Material Import affinché salvi i file (PNG/JPG e GLB importati) nella cartella `assets/` del progetto attualmente aperto via `ipcRenderer`.
- [x] Aggiornare Three.js `TextureLoader`/`GLTFLoader` backend per usare gli URL protocol locali Electron.

### Fase 5: Editor UX & Funzionalità Native
- [x] **Salvataggio Nativo Scene**: Aggiornare il salvataggio dei file `.whmap` e `.runtime.json` per scriverli direttamente in `src/scenes` via `electronAPI.writeFile` invece di usare il download del browser.
- [x] **Avvio Animation Studio**: Aggiungere pulsante in alto a destra nell'EditorMenuBar per avviare l'Animation Studio come finestra Electron separata (aggiungendo il supporto `ipcRenderer` per salvare le animazioni fisse nel progetto).
- [x] **Welcome Widget & Cronologia**: Trasformare il messaggio di benvenuto in un widget fluttuante centrale. Implementare il salvataggio degli ultimi progetti aperti e il caricamento automatico dell'ultimo progetto all'avvio dell'editor.
- [x] **Monaco Editor Enhancements**: Implementare il fullscreen per l'editor di codice (ingrandimento viewport intero) e aggiungere un pulsante dedicato al salvataggio rapido dello script/file.
- [x] **Terminale Integrato**: Aggiungere un pulsante di fianco a "Toggle File Browser" chiamato "Toggle Terminal" che possa lanciare un terminale interno (es. `xterm.js` via Node-PTY backend) per eseguire comandi es. `bun run dev` o script di build.
- [x] **Finestre Resizabili**: Migliorare l'UX permettendo di allargare o restringere liberamente le sidebar laterali (sia File Browser sia Inspector destro).

### Fase 6: Native Scene Ingestion
- [x] **Caricamento rapido .whmap**: Aggiungere una feature di UX al File Browser che permetta, facendo doppio click su un file con estensione `.whmap`, di parsarlo istantaneamente tramite il protocollo file IPC nativo e ricaricarlo nella memoria del Trident Editor come scena attiva, rimpiazzando lo scomodo pulsante di upload legacy.
