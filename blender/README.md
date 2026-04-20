# Blender Workspace

This directory keeps Blender-specific work separate from the app, backend, and firmware code.

## Layout

- `STARTUP.md`
  Daily startup workflow for using Blender together with Codex + Blender MCP.
- `assets/import/`
  Files to bring into Blender.
  Examples: `.fbx`, `.obj`, `.glb`, `.gltf`, textures, HDRIs, reference images.
- `assets/export/`
  Files exported from Blender for use elsewhere.
  Examples: `.glb`, `.fbx`, `.obj`, rendered stills, baked textures.
- `references/`
  Moodboards, sketches, screenshots, concept art, notes.
- `scenes/`
  Saved `.blend` files and scene variants.
- `renders/`
  Output renders, preview snapshots, turntables.
- `scripts/`
  Helper scripts or snippets related to Blender workflows.

## Recommended Conventions

- Keep source files in `assets/import/` and exported deliverables in `assets/export/`.
- Keep the main working `.blend` file in `scenes/`.
- Use descriptive names with dates or versions.
  Example: `robot-stand-v03.blend`
- If an asset was generated externally, store the prompt or source note next to it when possible.

## Agent Notes

When asking Codex to work with Blender, mention files from this directory explicitly when relevant.

Examples:

- "Import [chair.glb](C:/Users/Ahmad/OneDrive/Desktop/RoboticsPro/SketchBot_clubHacks26/blender/assets/import/chair.glb) into Blender."
- "Save the current scene to `blender/scenes/classroom-layout-v01.blend`."
- "Export the final model to `blender/assets/export/robot-arm.glb`."

See [STARTUP.md](C:/Users/Ahmad/OneDrive/Desktop/RoboticsPro/SketchBot_clubHacks26/blender/STARTUP.md) for the startup flow.
