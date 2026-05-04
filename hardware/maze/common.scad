// Shared dimensions + joint primitives for the SaySpark maze kit.
// Edit values here once and every piece updates uniformly.
//
// Convention used by all pieces in this folder:
//   • Tab on the +X end (sticks out, plugs into the next piece's socket)
//   • Socket on the -X end (pocket cut in, accepts the previous piece's tab)
// Pieces chain end-to-end. Rotate corners 0/90/180/270° to aim turns.

/* [Wall geometry — mm] */
cell_size      = 80;   // [40:5:200]    wall body length (along chain axis)
wall_height    = 80;   // [20:1:120]    how tall the wall stands
wall_thickness = 10;   // [5:0.5:20]    how thick / "wide" the wall is

/* [Joint geometry — mm] */
tab_length     = 8;    // [4:1:15]      how far the tab sticks out / socket goes in
tab_thickness  = 5;    // [2:0.5:9]     tab cross-section (must be < wall_thickness)
slot_clearance = 0.2;  // [0.1:0.05:0.4]  printer tolerance gap

/* [Corner geometry — mm] */
arm_length     = 30;   // [15:1:60]     length of each corner arm

$fn = 48;

// ─── Joint primitives ────────────────────────────────────────────────────
// Tab — sticks out in +X from origin. Origin = base of tab where it joins
// the body. Full wall_height tall so the joint is as strong as the wall.
module joint_tab() {
  translate([0, -tab_thickness / 2, 0])
    cube([tab_length, tab_thickness, wall_height]);
}

// Socket — pocket carved from origin going in -X (into the body).
// Caller subtracts this from a body shape to cut the pocket.
// Sized slightly larger than the tab by `slot_clearance` so parts slide.
module joint_socket() {
  translate([-tab_length - 0.01,
             -(tab_thickness + slot_clearance) / 2,
             -0.01])
    cube([tab_length + 0.02,
          tab_thickness + slot_clearance,
          wall_height + 0.02]);
}
