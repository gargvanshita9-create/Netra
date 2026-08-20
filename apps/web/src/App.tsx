import { lazy, Suspense } from 'react';

// Code-split away from the initial route — three.js/R3F/drei are heavy and
// only needed once the avatar stage actually mounts (CLAUDE.md perf budget).
const AvatarStage = lazy(() =>
  import('./avatar/AvatarStage').then((module) => ({ default: module.AvatarStage })),
);

function App(): React.JSX.Element {
  return (
    <main className="h-screen w-screen bg-slate-950">
      <Suspense fallback={<div className="h-full w-full bg-slate-950" />}>
        <AvatarStage />
      </Suspense>
    </main>
  );
}

export default App;
