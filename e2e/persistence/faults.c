// Host probe of the real storage implementation, driven by the existing Playwright suite.
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "pebble.h"
#include "favorites.h"

typedef struct { uint8_t bytes[256]; int size; } Entry;
static Entry store[400], original[400];
static int fail_write, writes, mode, read_fail_key = -1;
static bool fail_delete;
int persist_get_size(uint32_t key) { assert(key < 400); return store[key].size ? store[key].size : -1; }
bool persist_exists(uint32_t key) { return persist_get_size(key) > 0; }
int persist_read_data(uint32_t key, void *out, size_t length) {
  if ((int)key == read_fail_key) { read_fail_key = -1; return -1; }
  int size = persist_get_size(key);
  if (size < 0) return -1;
  if ((size_t)size > length) size = (int)length;
  memcpy(out, store[key].bytes, size); return size;
}
int32_t persist_read_int(uint32_t key) { int32_t value = 0; persist_read_data(key, &value, sizeof(value)); return value; }
int persist_write_data(uint32_t key, const void *data, size_t length) {
  assert(key < 400 && length <= 256);
  bool fail = ++writes == fail_write;
  if (fail && mode == 0) return -6;
  size_t copied = fail && mode == 1 ? length / 2 : length;
  memcpy(store[key].bytes, data, copied); store[key].size = (int)length;
  return fail ? -6 : (int)length;
}
int persist_write_int(uint32_t key, int32_t value) { return persist_write_data(key, &value, sizeof(value)); }
int persist_delete(uint32_t key) { if (fail_delete) return -6; store[key].size = 0; return 1; }
static Favorite make(const char *station) {
  Favorite favorite = { .version = FORMAT };
  strcpy(favorite.station, station); strcpy(favorite.line, "red"); strcpy(favorite.direction, "airport"); return favorite;
}
static void fault(int at, int kind) { writes = 0; fail_write = at; mode = kind; read_fail_key = -1; }
int main(void) {
  Favorite old[16] = {0}, next[16] = {0}, loaded[16]; old[7] = make("saldanha"); next[3] = make("alameda");
  // Fail/tear every initial legacy-seed write, including its commit and migration seal.
  for (int kind = 0; kind < 3; kind++) for (int at = 1; at <= 18; at++) {
    memset(store, 0, sizeof(store)); fault(0, 0);
    assert(persist_write_data(107, &old[7], sizeof(Favorite)) == sizeof(Favorite));
    fault(at, kind); assert(!favorites_load(loaded)); assert(!memcmp(loaded, old, sizeof(old)));
    fault(0, 0); assert(favorites_load(loaded)); assert(!memcmp(loaded, old, sizeof(old)));
  }
  memcpy(original, store, sizeof(store));
  // Once migrated, every interruption must reload a complete old or complete new list.
  for (int kind = 0; kind < 3; kind++) for (int at = 1; at <= 17; at++) {
    memcpy(store, original, sizeof(store)); fault(0, 0); assert(favorites_load(loaded));
    fault(at, kind); FavoriteSave result = favorites_save(next);
    if (at == 17) assert(result == FAVORITES_UNKNOWN);
    fault(0, 0); assert(favorites_load(loaded));
    bool is_old = !memcmp(loaded, old, sizeof(old)), is_new = !memcmp(loaded, next, sizeof(next));
    assert(is_old || is_new);
    if (result == FAVORITES_SAVED) assert(is_new);
    if (result == FAVORITES_FAILED) assert(is_old);
  }
  // Commit landed but readback failed: outcome is unknown; do not allow another write.
  memcpy(store, original, sizeof(store)); fault(0, 0); assert(favorites_load(loaded));
  read_fail_key = 301; assert(favorites_save(next) == FAVORITES_UNKNOWN); assert(!favorites_writable());
  assert(favorites_save(old) == FAVORITES_FAILED);
  fault(0, 0); assert(favorites_load(loaded)); assert(!memcmp(loaded, next, sizeof(next)));
  // A failed legacy cleanup cannot resurrect removed routes after a later empty save.
  memset(store, 0, sizeof(store)); fault(0, 0); persist_write_data(107, &old[7], sizeof(Favorite)); fail_delete = true;
  assert(favorites_load(loaded)); memset(next, 0, sizeof(next)); assert(favorites_save(next) == FAVORITES_SAVED);
  assert(favorites_load(loaded)); assert(!memcmp(loaded, next, sizeof(next)));
  // Both commits corrupt after migration: fail closed rather than loading the legacy key.
  store[300].bytes[0] ^= 1; store[301].bytes[0] ^= 1;
  assert(!favorites_load(loaded)); assert(!favorites_writable()); assert(!memcmp(loaded, next, sizeof(next)));
  puts("Persistence fault injection passed: 54 migration and 51 save boundaries, unknown commit and no resurrection");
  return 0;
}
