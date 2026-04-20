# Blender + Codex Startup

This is the quick workflow for starting Blender in a way Codex can use through Blender MCP.

## One-Time Setup

1. Install the Blender MCP add-on in Blender.
2. Make sure Codex has the Blender MCP server configured.
3. Make sure Blender can show the `BlenderMCP` sidebar panel.

## Daily Startup Flow

1. Open Blender.
2. Open the project `.blend` file from `blender/scenes/`, or start from a blank scene.
3. In the 3D viewport, press `N` to open the right sidebar if it is hidden.
4. Open the `BlenderMCP` tab.
5. Click `Connect to MCP server`.
6. Keep Blender open.
7. Start a fresh Codex session if needed, then ask Codex to verify Blender access.

Good verification prompts:

- "Check whether Blender MCP is available."
- "Get the current Blender scene info."
- "Take a viewport screenshot."

## Expected Healthy State

Codex should be able to:

- inspect the current scene
- inspect objects
- execute Blender Python
- take viewport screenshots
- import supported assets

If Codex says it cannot connect to Blender, the usual cause is that the add-on server was not started in Blender yet.

## Working With Assets

### Importing into Blender

Put source files in:

- `blender/assets/import/`

Examples:

- models: `.fbx`, `.obj`, `.glb`, `.gltf`
- textures: `.png`, `.jpg`, `.exr`
- HDRIs: `.hdr`, `.exr`
- reference images: `.png`, `.jpg`, `.webp`

### Exporting from Blender

Put outputs in:

- `blender/assets/export/`

Examples:

- final models for apps or web viewers
- baked textures
- animation exports

### Scene Files

Store `.blend` files in:

- `blender/scenes/`

### Renders

Store stills, previews, and test outputs in:

- `blender/renders/`

## Suggested Session Workflow

1. Put references in `blender/references/`.
2. Put importable models/textures in `blender/assets/import/`.
3. Open or save a working scene in `blender/scenes/`.
4. Ask Codex to inspect the scene first.
5. Make changes iteratively.
6. Save versions often.
7. Export final assets into `blender/assets/export/`.
8. Save preview renders into `blender/renders/`.

## Example Prompts For Codex

- "Inspect the current Blender scene and summarize it."
- "Import the file from `blender/assets/import/` and place it at the origin."
- "Create a simple studio lighting setup and take a viewport screenshot."
- "Export the selected object to `blender/assets/export/`."
- "Save this scene as a new version in `blender/scenes/`."

## Troubleshooting

### Codex cannot see Blender tools

- Restart VS Code or start a fresh Codex session.
- Confirm the Blender MCP server is configured in `C:\\Users\\Ahmad\\.codex\\config.toml`.

### Codex sees Blender tools but cannot connect

- Make sure Blender is open.
- Make sure the add-on is enabled.
- Make sure `Connect to MCP server` was clicked in Blender.

### Assets are hard to track down

- Keep everything Blender-related inside this `blender/` directory.
- Avoid scattering `.blend`, exports, and reference images across unrelated folders.
