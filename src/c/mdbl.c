#include <pebble.h>

int main(void) {
  Window *window = window_create();
  window_stack_push(window, true);
  moddable_createMachine(&(ModdableCreationRecord){
    .recordSize = sizeof(ModdableCreationRecord),
    // The live-data model exceeds Alloy's 32 KiB default pool.
    .stack = 4096,
    .slot = 40960,
    .chunk = 28672,
#ifdef PBL_DEBUG
    .flags = kModdableCreationFlagDebug | kModdableCreationFlagLogInstrumentation,
#endif
    .fxBuildFFI = fxBuildFFI,
  });
  window_destroy(window);
  return 0;
}
