export function handoffLaunchPlan(sourceExe, targetExe) {
  if (!sourceExe || !targetExe) throw new Error('Both source and target executables are required.');
  return {
    restart: { exe: sourceExe, args: ['--fork-restart'] },
    target: { exe: targetExe, args: [] }
  };
}
