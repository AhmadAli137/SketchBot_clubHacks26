// Sample maze — example layout chaining walls and corners freely.
// Demonstrates a small zigzag path: east → east → turn north → north →
// north → turn west → west. Use this as a reference for placing your
// own pieces; the math at the bottom of each piece block shows how the
// next position is derived from the previous one's tab tip.
//
// Open in OpenSCAD, F5 to preview the assembled maze. This file does
// NOT export — to print individual pieces, open wall.scad or
// corner.scad directly and export those.

include <common.scad>;
use <wall.scad>;
use <corner.scad>;

// Distance derivations:
//   wall ↔ wall:   adjacent wall centres are exactly cell_size apart
//                  (wall A's tab sits inside wall B's socket; combined
//                  body span = 2 * cell_size, but socket overlap = 0
//                  because the socket pocket is INSIDE wall B).
//   wall → corner: corner centre sits cell_size/2 + arm_length past
//                  the wall centre.
//   corner → wall: next wall centre sits arm_length + cell_size/2
//                  past the corner centre, in the direction of the
//                  corner's tab arm.

// ─── East-bound chain ─────────────────────────────────────────────────────

// Wall 1 — at origin, going east
wall();

// Wall 2 — chained east of wall 1
translate([cell_size, 0, 0])
  wall();

// Corner 1 — turns the chain from east-bound to north-bound
//   Position: cell_size to the east of wall 2, plus the corner's own arm.
//   Rotation: 0° (default) — socket faces -X (west), tab points +Y (north).
translate([cell_size + cell_size / 2 + arm_length, 0, 0])
  corner();

// ─── North-bound chain ────────────────────────────────────────────────────

// Wall 3 — first wall going north (rotated 90°)
//   Position: same X as corner 1, offset north by arm_length + cell_size/2.
translate([cell_size + cell_size / 2 + arm_length,
           arm_length + cell_size / 2, 0])
  rotate([0, 0, 90])
    wall();

// Wall 4 — second wall going north
translate([cell_size + cell_size / 2 + arm_length,
           arm_length + cell_size / 2 + cell_size, 0])
  rotate([0, 0, 90])
    wall();

// Corner 2 — turns the chain from north-bound to west-bound
//   Rotation: 90° — socket faces -Y (south, accepts the north chain),
//             tab points -X (west).
translate([cell_size + cell_size / 2 + arm_length,
           arm_length + cell_size / 2 + cell_size + cell_size / 2 + arm_length,
           0])
  rotate([0, 0, 90])
    corner();

// ─── West-bound chain ─────────────────────────────────────────────────────

// Wall 5 — going west (rotated 180°)
translate([cell_size + cell_size / 2 + arm_length - (cell_size / 2 + arm_length) - cell_size / 2,
           arm_length + cell_size / 2 + cell_size + cell_size / 2 + arm_length,
           0])
  rotate([0, 0, 180])
    wall();

// Wall 6 — final wall going west
translate([cell_size + cell_size / 2 + arm_length - (cell_size / 2 + arm_length) - cell_size / 2 - cell_size,
           arm_length + cell_size / 2 + cell_size + cell_size / 2 + arm_length,
           0])
  rotate([0, 0, 180])
    wall();
