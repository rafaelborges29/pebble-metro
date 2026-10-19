#include <pebble.h>

// Keep this check at the native boundary so Quiet Time is never bypassed.
uint32_t metro_pulse(uint32_t service) {
  if (quiet_time_is_active()) return 0;
  if (service) vibes_short_pulse();
  else vibes_double_pulse();
  return 1;
}

void metro_exit(void) {
  window_stack_pop_all(false);
}
