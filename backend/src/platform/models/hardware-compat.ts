import { HardwareType, Role } from './enums';

// Which roles a given hardware type may be assigned. A side-configured
// remote's case doesn't expose its (physically-present-but-covered) clock
// button, so it must never be assignable to the chief role, and vice versa.
//
// `hardwareType` is undefined for remotes registered by pre-hardwareType
// firmware that never reported it — treat that as "no restriction" so
// already-working old remotes aren't blocked by this check.
export function isHardwareTypeCompatible(
  hardwareType: HardwareType | undefined,
  role: Role,
): boolean {
  if (!hardwareType) return true;
  if (hardwareType === 'chief') return role === 'chief' || role === 'spare';
  return role === 'left' || role === 'right' || role === 'spare';
}
