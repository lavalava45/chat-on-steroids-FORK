export type HandoffLaunch = { exe: string; args: string[] };

export function handoffLaunchPlan(sourceExe: string, targetExe: string): {
  restart: HandoffLaunch;
  target: HandoffLaunch;
};
