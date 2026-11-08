#include <pebble.h>
#include <string.h>
#include "favorites.h"

#define LEGACY_KEY 100
#define COMMIT_KEY 300
#define MIGRATED_KEY 302
#define BANK_KEY 310
#define BANK_MAGIC 0x4d465632u

typedef struct { uint32_t magic, generation, checksum; } Commit;
typedef char FavoriteFitsPersistence[(sizeof(Favorite) <= PERSIST_DATA_MAX_LENGTH) ? 1 : -1];
static int s_bank = -1;
static uint32_t s_generation;
static bool s_writable;

bool favorite_id_valid(const char *id, size_t capacity) {
  const char *end = memchr(id, 0, capacity);
  if (!end || end == id || (size_t)(end - id) > 48) return false;
  for (const char *p = id; p < end; p++)
    if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9') || *p == '-' || *p == '_')) return false;
  return true;
}
bool favorite_valid(const Favorite *f) {
  return f->version == FORMAT && favorite_id_valid(f->station, sizeof(f->station))
    && favorite_id_valid(f->line, sizeof(f->line)) && favorite_id_valid(f->direction, sizeof(f->direction));
}
bool favorite_equal(const Favorite *a, const Favorite *b) {
  return !strcmp(a->station, b->station) && !strcmp(a->line, b->line) && !strcmp(a->direction, b->direction);
}
static uint32_t hash(uint32_t value, const void *data, size_t length) {
  const uint8_t *bytes = data;
  while (length--) value = (value ^ *bytes++) * 16777619u;
  return value;
}
static uint32_t checksum(const Commit *commit, const Favorite *favorites) {
  return hash(hash(2166136261u, commit, offsetof(Commit, checksum)), favorites, sizeof(Favorite) * MAX_FAVORITES);
}
static uint32_t bank_key(int bank, int slot) { return BANK_KEY + bank * MAX_FAVORITES + slot; }
static bool read_bank(int bank, Commit *commit, Favorite *out) {
  if (persist_get_size(COMMIT_KEY + bank) != (int)sizeof(*commit)
    || persist_read_data(COMMIT_KEY + bank, commit, sizeof(*commit)) != (int)sizeof(*commit) || commit->magic != BANK_MAGIC) return false;
  uint32_t sum = hash(2166136261u, commit, offsetof(Commit, checksum));
  Favorite entry, empty = {0};
  for (int i = 0; i < MAX_FAVORITES; i++) {
    if (persist_get_size(bank_key(bank, i)) != (int)sizeof(entry)
      || persist_read_data(bank_key(bank, i), &entry, sizeof(entry)) != (int)sizeof(entry)
      || (entry.version ? !favorite_valid(&entry) : memcmp(&entry, &empty, sizeof(entry)) != 0)) return false;
    sum = hash(sum, &entry, sizeof(entry));
    if (out) out[i] = entry;
  }
  return sum == commit->checksum;
}
static FavoriteSave write_bank(int bank, uint32_t generation, const Favorite *favorites);
static bool finish_migration(void) {
  if (persist_exists(MIGRATED_KEY)) return persist_get_size(MIGRATED_KEY) == 4 && persist_read_int(MIGRATED_KEY) == 1;
  int written = persist_write_int(MIGRATED_KEY, 1);
  return written == 4 && persist_get_size(MIGRATED_KEY) == 4 && persist_read_int(MIGRATED_KEY) == 1;
}
static void clean_legacy(void) {
  for (int i = 0; i < MAX_FAVORITES; i++) persist_delete(LEGACY_KEY + i);
}
bool favorites_writable(void) { return s_writable; }
bool favorites_load(Favorite out[MAX_FAVORITES]) {
  memset(out, 0, sizeof(Favorite) * MAX_FAVORITES);
  s_bank = -1; s_generation = 0; s_writable = true;
  Commit commits[2];
  bool valid[2] = { read_bank(0, &commits[0], NULL), read_bank(1, &commits[1], NULL) };
  if (valid[0]) s_bank = 0;
  if (valid[1] && (!valid[0] || (int32_t)(commits[1].generation - commits[0].generation) > 0)) s_bank = 1;
  if (s_bank >= 0) {
    s_generation = commits[s_bank].generation;
    s_writable = read_bank(s_bank, &commits[s_bank], out);
    if (!s_writable) { memset(out, 0, sizeof(Favorite) * MAX_FAVORITES); return false; }
    s_writable = finish_migration();
    if (s_writable) clean_legacy();
    return s_writable;
  }
  // Only the initial, unchanged legacy seed may exist without the migration seal.
  // Later corrupt commits must never resurrect legacy deletions.
  if (persist_exists(MIGRATED_KEY)) { s_writable = false; return false; }
  for (int i = 0; i < MAX_FAVORITES; i++) {
    Favorite entry;
    if (persist_get_size(LEGACY_KEY + i) != (int)sizeof(entry)
      || persist_read_data(LEGACY_KEY + i, &entry, sizeof(entry)) != (int)sizeof(entry) || !favorite_valid(&entry)) continue;
    bool duplicate = false;
    for (int j = 0; j < i; j++) if (out[j].version && favorite_equal(&entry, &out[j])) duplicate = true;
    if (!duplicate) out[i] = entry;
  }
  // First commit is the unchanged legacy list, never the user's new draft. The
  // seal must be durable before allowing mutations or removing any legacy key.
  s_writable = write_bank(0, 1, out) == FAVORITES_SAVED && finish_migration();
  if (s_writable) { s_bank = 0; s_generation = 1; clean_legacy(); }
  return s_writable;
}
static FavoriteSave write_bank(int bank, uint32_t generation, const Favorite *favorites) {
  // No speculative quota assumptions: every bounded write/read is checked.
  Commit commit = { .magic = BANK_MAGIC, .generation = generation };
  commit.checksum = checksum(&commit, favorites);
  for (int i = 0; i < MAX_FAVORITES; i++) {
    Favorite verify;
    if (persist_write_data(bank_key(bank, i), &favorites[i], sizeof(Favorite)) != (int)sizeof(Favorite)
      || persist_read_data(bank_key(bank, i), &verify, sizeof(verify)) != (int)sizeof(verify)
      || memcmp(&verify, &favorites[i], sizeof(verify))) return FAVORITES_FAILED;
  }
  // The previous bank/commit remain untouched, including during legacy migration.
  int written = persist_write_data(COMMIT_KEY + bank, &commit, sizeof(commit));
  Commit verify;
  if (written != (int)sizeof(commit) || !read_bank(bank, &verify, NULL) || memcmp(&verify, &commit, sizeof(commit))) {
    s_writable = false; // A commit might have landed: only a fresh load can resolve it.
    return FAVORITES_UNKNOWN;
  }
  return FAVORITES_SAVED;
}
FavoriteSave favorites_save(const Favorite favorites[MAX_FAVORITES]) {
  if (!s_writable) return FAVORITES_FAILED;
  Favorite empty = {0};
  for (int i = 0; i < MAX_FAVORITES; i++) {
    if (favorites[i].version ? !favorite_valid(&favorites[i]) : memcmp(&favorites[i], &empty, sizeof(empty)) != 0) return FAVORITES_FAILED;
    for (int j = 0; j < i; j++) if (favorites[i].version && favorites[j].version && favorite_equal(&favorites[i], &favorites[j])) return FAVORITES_FAILED;
  }
  int bank = s_bank == 0 ? 1 : 0;
  FavoriteSave result = write_bank(bank, s_generation + 1, favorites);
  if (result == FAVORITES_SAVED) { s_bank = bank; s_generation++; clean_legacy(); }
  return result;
}
