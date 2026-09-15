import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// TEMPORARY - chasing the "Ethernet remote connects, then drops and
// reconnects every ~1 minute (sometimes much longer to recover)" bug (see
// firmware/src/network.cpp and ws_network_client.cpp). The remote's own
// USB serial is physically inaccessible on this unit, so this is the only
// observation point available: every connect/close/error the WS gateway
// sees for a remote, plus every raw connect attempt/teardown the firmware
// itself reports over REST (remotes.controller.ts's /event route) - all
// timestamped to one plain file next to the running backend process
// rather than just console.log, so it can be tailed/grepped after the
// fact instead of needing a terminal watched live at the exact moment a
// drop happens. Remove once the root cause is found and fixed.
const LOG_DIR = join(process.cwd(), 'logs');
const CONN_LOG_PATH = join(LOG_DIR, 'esp-remotes.log');

export function logConnEvent(remoteId: string, event: string): void {
  if (process.env.JEST_WORKER_ID !== undefined) return; // don't pollute with test runs
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(
      CONN_LOG_PATH,
      `${new Date().toISOString()} remote=${remoteId} ${event}\n`,
    );
  } catch {
    // Best-effort diagnostic logging - never worth taking down the gateway
    // or a request over a disk/permission hiccup.
  }
}
