# Spark state images

Drop the 24 `.png` files for Spark's conversational states here. File names
must match the slugs below (lowercase, hyphenated). Until an image exists,
the desktop app falls back to the procedural `<SparkRobot>` CSS rig — so the
app stays usable while you generate the set incrementally.

See [`docs/spark-state-images.md`](../../../../../../docs/spark-state-images.md)
for the full spec, base prompt, and per-state visual descriptions.

## Required files (24)

```
wave.png           talking.png        nodding.png        surprised.png
guide.png          explaining.png     clapping.png       confused.png
celebrate.png      questioning.png    cheering.png       shrug.png
adapt.png          encouraging.png    point-left.png     aha.png
idle.png           emphasizing.png    point-right.png    sad.png
listening.png                         point-down.png
thinking.png                          point-up.png
```

Format: PNG, transparent background, 1024 × 1024, square framing, robot
centered, character ~70% of canvas height. Convert to WebP later for size
if desired (update `IMAGE_EXT` in `spark-state-image.tsx` to `'webp'`).
