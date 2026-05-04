// Corner — 90° turn piece. Socket on the -X arm, tab on the +Y arm.
// Drops between two walls (or between any tab/socket pair) to turn the
// chain. Rotate the corner around Z by 0, 90, 180, or 270 degrees to
// aim the turn in any direction.
//
// Open in OpenSCAD, F5 to preview, F6 to render, File > Export > STL.

include <common.scad>;

module corner() {
  difference() {
    union() {
      // -X arm — runs from origin to (-arm_length, 0)
      translate([-arm_length, -wall_thickness / 2, 0])
        cube([arm_length, wall_thickness, wall_height]);
      // +Y arm — runs from origin to (0, +arm_length)
      translate([-wall_thickness / 2, 0, 0])
        cube([wall_thickness, arm_length, wall_height]);
      // Tab at the +Y arm end (sticks out in +Y; rotated joint_tab)
      translate([0, arm_length, 0])
        rotate([0, 0, 90])
          joint_tab();
    }
    // Socket at the -X arm end
    translate([-arm_length, 0, 0])
      joint_socket();
  }
}

corner();
