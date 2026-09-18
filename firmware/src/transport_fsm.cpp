#include "transport_fsm.h"

static const unsigned long LINK_DEBOUNCE_MS = 1000;
static const unsigned long ETH_RECHECK_INTERVAL_MS = 5000;

TransportAction transportDecide(bool currentlyEthernet,
                                 bool ethernetLinkUp,
                                 bool& lastLinkUp,
                                 unsigned long& linkStableSinceMs,
                                 unsigned long& lastEthRecheckMs,
                                 unsigned long nowMs) {
  if (ethernetLinkUp != lastLinkUp) {
    lastLinkUp = ethernetLinkUp;
    linkStableSinceMs = nowMs;
  }
  bool stable = (nowMs - linkStableSinceMs) >= LINK_DEBOUNCE_MS;

  if (currentlyEthernet && !ethernetLinkUp && stable) {
    return TransportAction::SWITCH_TO_WIFI;
  }

  if (!currentlyEthernet && ethernetLinkUp && stable &&
      (nowMs - lastEthRecheckMs) >= ETH_RECHECK_INTERVAL_MS) {
    lastEthRecheckMs = nowMs;
    return TransportAction::SWITCH_TO_ETHERNET;
  }

  return TransportAction::STAY;
}
