// The Watchfire SSH door. Players `ssh` in and the door runs the Watchfire app in their session.
//
//   pnpm door                      # listens on :2222, data in ./.watchfire-door
//   ssh -p 2222 localhost          # with your SSH key: your keeper. Without: a guest.
//
// The door has no TTY of its own, so colors would be off: tell chalk the terminals on the other
// end take truecolor before anything loads it.
process.env.FORCE_COLOR ??= "3";
await import("./server.tsx");
