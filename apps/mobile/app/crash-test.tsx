// Diagnostics → "Test the crash screen". Throws while rendering, on purpose, so the whole path
// can be checked on a real build: the root ErrorBoundary catches it, the crash screen shows a
// Ref, and the report lands in Diagnostics → Server as "App error on crash test". Reachable
// only from the hidden Diagnostics screen.
const CrashTestScreen = () => {
  throw new Error("Test crash from Diagnostics — this one is on purpose");
};

export default CrashTestScreen;
