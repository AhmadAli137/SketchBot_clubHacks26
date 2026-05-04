// SaySpark Maze — Wall + Corner system (parametric, FDM-friendly)
// Walls have tabs on both ends; corners have sockets on both arms.
// Plug a wall's tab into a corner's socket. F5 to preview, F6 to render.
// File > Export > Export as STL when ready to print.

/* [Cell + scale (mm)] */
cell_size      = 100;  // [50:5:200]   distance between adjacent corner centres
wall_height    = 50;   // [20:1:100]
wall_thickness = 6;    // [3:0.5:15]

/* [Joint geometry] */
arm_length     = 20;   // [10:1:30]    length of each corner arm
tab_length     = 8;    // [4:1:15]     how far the tab plunges into the socket
tab_width      = 4;    // [2:0.5:8]    tab width (must be < wall_thickness)
slot_clearance = 0.2;  // [0.1:0.05:0.4]  printer tolerance gap

/* [What to render] */
part = "demo";  // [wall, corner, demo]

$fn = 48;

// ─── Derived ────────────────────────────────────────────────────────────
wall_body_length = cell_size - 2*arm_length;

// ─── Wall — tabs on both ends ───────────────────────────────────────────
module wall_segment() {
  // Body, centered along X
  translate([-wall_body_length/2, -wall_thickness/2, 0])
    cube([wall_body_length, wall_thickness, wall_height]);
  // Tab on each end
  for (sx = [-1, 1])
    translate([sx * (wall_body_length/2 + (sx > 0 ? 0 : tab_length)),
               -tab_width/2, 0])
      cube([tab_length, tab_width, wall_height]);
}

// ─── Corner — L-shape with sockets on each arm end ──────────────────────
module corner_piece() {
  difference() {
    union() {
      // Arm going +X
      translate([0, -wall_thickness/2, 0])
        cube([arm_length, wall_thickness, wall_height]);
      // Arm going +Y
      translate([-wall_thickness/2, 0, 0])
        cube([wall_thickness, arm_length, wall_height]);
    }
    // Socket at end of +X arm
    translate([arm_length - tab_length,
               -(tab_width + slot_clearance)/2, -0.01])
      cube([tab_length + 0.02,
            tab_width + slot_clearance,
            wall_height + 0.02]);
    // Socket at end of +Y arm
    translate([-(tab_width + slot_clearance)/2,
               arm_length - tab_length, -0.01])
      cube([tab_width + slot_clearance,
            tab_length + 0.02,
            wall_height + 0.02]);
  }
}

// ─── Demo: corner — wall — corner, forming a U turn ────────────────────
module demo() {
  // Left corner at origin, arms +X and +Y
  corner_piece();
  // Wall spanning between
  translate([cell_size/2, 0, 0])
    wall_segment();
  // Right corner, rotated 90° so its arms are -X and +Y
  translate([cell_size, 0, 0])
    rotate([0, 0, 90])
      corner_piece();
}

// ─── Render ─────────────────────────────────────────────────────────────
if      (part == "wall")   wall_segment();
else if (part == "corner") corner_piece();
else if (part == "demo")   demo();
