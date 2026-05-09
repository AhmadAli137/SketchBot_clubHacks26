export type CameraBuddyPage =
  | 'splash'
  | 'menu'
  | 'connect'
  | 'live'
  // Phase 2c.4a — "Talk to your robot" voice companion mode. The page
  // owns its own internal state (setup → device picker → connected),
  // so App.tsx just mounts <SparkCompanion /> when the user picks this
  // from the menu.
  | 'spark';

