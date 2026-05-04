// Wall — a flat panel with a tab on one end and a socket on the other.
// Two walls chain end-to-end (tab of A plugs into socket of B). Multiple
// walls form a straight run; insert a corner piece to turn 90°.
//
// Open this file in OpenSCAD, hit F5 to preview, F6 to render solid,
// then File > Export > Export as STL to print.

include <common.scad>;

module wall() {
  difference() {
    union() {
      // Body — centered along X
      translate([-cell_size / 2, -wall_thickness / 2, 0])
        cube([cell_size, wall_thickness, wall_height]);
      // Tab on the +X end
      translate([cell_size / 2, 0, 0])
        joint_tab();
    }
    // Socket on the -X end
    translate([-cell_size / 2, 0, 0])
      joint_socket();
  }
}

// Render the piece when this file is opened directly.
wall();
