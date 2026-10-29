#include <pebble.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "json.h"

#define MAX_STATIONS 80
#define MAX_LINES 8
#define MAX_FAVORITES 16
#define CACHE_SLOTS 2
#define KEY_SELECTED 1
#define KEY_FAVORITE 100
#define KEY_CACHE 200
#define KEY_LABELS 210
#define FORMAT 1

// All source/model/transport storage is fixed. Navigation allocates no objects.
typedef struct { char id[49], name[81]; uint8_t lines; } Station;
typedef struct { char id[49], name[41]; uint8_t stations[80], count; GColor color; } Line;
typedef struct { char station[49], line[49], direction[49]; uint8_t version; } Favorite;
typedef struct {
  double value, upper;
  uint32_t received, expires;
  uint8_t type, units, order, valid;
} Prediction;
typedef struct { Prediction predictions[3]; int64_t source_at; bool seen, live; } Arrival;
typedef struct { char station[65], direction[65], line[33]; GColor color; } Labels;
typedef struct { Favorite favorite; uint32_t saved_at, serial; Prediction predictions[3]; } DiskArrival;
typedef struct { uint32_t serial; Labels labels; } DiskLabels;
typedef char CacheMustFitPersistence[(sizeof(DiskArrival) <= PERSIST_DATA_MAX_LENGTH) ? 1 : -1];
typedef char LabelsMustFitPersistence[(sizeof(DiskLabels) <= PERSIST_DATA_MAX_LENGTH) ? 1 : -1];

typedef enum { EMPTY, ARRIVALS, FAVORITES, STATIONS, LINES, DIRECTIONS, ACTIONS, REMOVE, NOTICE, ABOUT } View;
typedef struct { View view; uint8_t row; } History;
typedef enum { SOURCE_CONNECTING, SOURCE_CONNECTED, SOURCE_DISCONNECTED } Source;
typedef enum { SEND_NONE, SEND_HELLO, SEND_WATCH, SEND_CATALOG, SEND_ACK } SendType;

static Window *s_window;
static Layer *s_layer;
static Station s_stations[MAX_STATIONS];
static Line s_lines[MAX_LINES];
static uint8_t s_station_count, s_line_count;
static Favorite s_favorites[MAX_FAVORITES];
static Arrival s_arrivals[MAX_FAVORITES];
static DiskArrival s_disk[CACHE_SLOTS];
static DiskLabels s_disk_labels[CACHE_SLOTS];
static bool s_disk_valid[CACHE_SLOTS], s_invalidate_pending[CACHE_SLOTS], s_forget_pending[CACHE_SLOTS];
static uint32_t s_serial, s_last_invalidation_try;
static uint8_t s_selected, s_draft_station, s_draft_line, s_row;
static History s_history[8];
static uint8_t s_history_count;
static View s_view;
static Source s_source = SOURCE_CONNECTING;
static bool s_ready, s_focused = true, s_storage_error, s_cache_error, s_dirty, s_announced;
static bool s_need_hello, s_need_watch, s_need_catalog, s_outbox_busy;
static uint32_t s_last_now, s_attempt, s_last_sync, s_last_write, s_last_hello, s_switches;
static int64_t s_hello_at, s_offset;
static uint32_t s_feed_generation;
static bool s_generation_known;
static char s_session[49], s_error[64], s_notice[160], s_outgoing[1024];
static uint32_t s_session_counter;
static SendType s_sending;
static uint32_t s_sending_session;
static bool s_ack_pending;
static uint32_t s_ack_id;
static uint8_t s_ack_part;
static uint32_t s_sent_ack_id;
static uint8_t s_sent_ack_part;
static JsonToken s_tokens[1024];
static char s_batch[5001], s_chunk[2001];
static uint32_t s_batch_id, s_last_id, s_progress;
static uint16_t s_batch_length, s_last_start, s_last_length;
static uint8_t s_next_part, s_total_parts;

static void draw(void);
static void send_next(void);
static void begin_session(void);
static void persist_cache(bool force);
static void notice(const char *text);

static uint32_t now_seconds(void) { time_t now = time(NULL); return now > 0 ? (uint32_t)now : 0; }
static bool id_valid(const char *id, size_t capacity) {
  const char *end = memchr(id, 0, capacity);
  if (!end || end == id || (size_t)(end - id) > 48) return false;
  for (const char *p = id; p < end; p++)
    if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9') || *p == '-' || *p == '_')) return false;
  return true;
}
static bool favorite_valid(const Favorite *f) {
  return f->version == FORMAT && id_valid(f->station, sizeof(f->station)) && id_valid(f->line, sizeof(f->line)) && id_valid(f->direction, sizeof(f->direction));
}
static bool favorite_equal(const Favorite *a, const Favorite *b) {
  return !strcmp(a->station, b->station) && !strcmp(a->line, b->line) && !strcmp(a->direction, b->direction);
}
static int favorite_count(void) {
  int count = 0;
  for (int i = 0; i < MAX_FAVORITES; i++) if (s_favorites[i].version) count++;
  return count;
}
static int favorite_at(int ordinal) {
  for (int i = 0; i < MAX_FAVORITES; i++) if (s_favorites[i].version && ordinal-- == 0) return i;
  return -1;
}
static int favorite_ordinal(void) {
  int ordinal = 0;
  for (int i = 0; i < s_selected; i++) if (s_favorites[i].version) ordinal++;
  return ordinal;
}
static int station_index(const char *id) {
  for (int i = 0; i < s_station_count; i++) if (!strcmp(s_stations[i].id, id)) return i;
  return -1;
}
static int line_index(const char *id) {
  for (int i = 0; i < s_line_count; i++) if (!strcmp(s_lines[i].id, id)) return i;
  return -1;
}
static bool line_has_station(int line, int station) {
  if (line < 0 || station < 0) return false;
  for (int i = 0; i < s_lines[line].count; i++) if (s_lines[line].stations[i] == station) return true;
  return false;
}
static bool favorite_in_network(const Favorite *f) {
  int station = station_index(f->station), line = line_index(f->line), direction = station_index(f->direction);
  if (!line_has_station(line, station) || direction < 0 || direction == station) return false;
  return direction == s_lines[line].stations[0] || direction == s_lines[line].stations[s_lines[line].count - 1];
}
static void copy_label(char *out, size_t size, const char *source) {
  size_t used = 0;
  while (*source) {
    unsigned char c = (unsigned char)*source;
    size_t bytes = c < 0x80 ? 1 : c >= 0xc2 && c < 0xe0 ? 2 : c < 0xf0 && c >= 0xe0 ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 0;
    if (!bytes || used + bytes >= size) break;
    bool valid = true;
    for (size_t i = 1; i < bytes; i++) if (!source[i] || ((unsigned char)source[i] & 0xc0) != 0x80) valid = false;
    if (!valid) break;
    memcpy(out + used, source, bytes); used += bytes; source += bytes;
  }
  out[used] = 0;
}
static Labels labels_for(const Favorite *f) {
  Labels result = { .color = GColorBlack };
  copy_label(result.station, sizeof(result.station), f->station);
  copy_label(result.direction, sizeof(result.direction), f->direction);
  copy_label(result.line, sizeof(result.line), f->line);
  for (int i = 0; i < CACHE_SLOTS; i++) if (s_disk_valid[i] && favorite_equal(f, &s_disk[i].favorite)) result = s_disk_labels[i].labels;
  int station = station_index(f->station), line = line_index(f->line), direction = station_index(f->direction);
  if (station >= 0) copy_label(result.station, sizeof(result.station), s_stations[station].name);
  if (direction >= 0) copy_label(result.direction, sizeof(result.direction), s_stations[direction].name);
  if (line >= 0) { copy_label(result.line, sizeof(result.line), s_lines[line].name); result.color = s_lines[line].color; }
  return result;
}
static bool prediction_valid(const Prediction *p, uint32_t now) {
  if (p->valid != 1 || !p->type || !p->units || !strchr("etlmi", p->type) || !strchr("sm", p->units) || p->order < 1 || p->order > 3 || !isfinite(p->value) || p->value < 0
    || p->received > now || p->expires <= now || p->expires <= p->received || p->expires - p->received > 120) return false;
  double max = p->units == 'm' ? 1440 : 86400;
  if (p->type == 't') return p->units == 's' && p->value <= now + 86400.0;
  return p->value <= max && (p->type != 'i' || (isfinite(p->upper) && p->upper >= p->value && p->upper <= max));
}
static bool has_predictions(const Arrival *arrival, uint32_t now) {
  for (int i = 0; i < 3; i++) if (prediction_valid(&arrival->predictions[i], now)) return true;
  return false;
}
static void log_memory(const char *reason) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Metro memory %s: used=%lu free=%lu", reason, (unsigned long)heap_bytes_used(), (unsigned long)heap_bytes_free());
}
static void invalidate_disk(const Favorite *favorite, bool keep_labels) {
  for (int i = 0; i < CACHE_SLOTS; i++) if (s_disk_valid[i] && (!favorite || favorite_equal(favorite, &s_disk[i].favorite))) {
    bool stored_eta = false;
    for (int p = 0; p < 3; p++) if (s_disk[i].predictions[p].valid) stored_eta = true;
    if (keep_labels && !stored_eta && !s_invalidate_pending[i]) continue;
    if (!keep_labels) s_forget_pending[i] = true;
    int result = persist_delete(KEY_CACHE + i);
    if (result < 0 && result != E_DOES_NOT_EXIST) { s_cache_error = true; s_invalidate_pending[i] = true; continue; }
    s_invalidate_pending[i] = false;
    if (keep_labels && !s_forget_pending[i]) {
      // Retain route names, never the invalidated estimate. Delete-first stays fail-closed.
      memset(s_disk[i].predictions, 0, sizeof(s_disk[i].predictions)); s_disk[i].saved_at = now_seconds();
      if (persist_write_data(KEY_CACHE + i, &s_disk[i], sizeof(DiskArrival)) != (int)sizeof(DiskArrival)) s_cache_error = true;
    } else { persist_delete(KEY_LABELS + i); s_disk_valid[i] = false; }
    s_forget_pending[i] = false;
  }
}
static void retry_invalidations(void) {
  for (int i = 0; i < CACHE_SLOTS; i++) if (s_invalidate_pending[i]) {
    Favorite favorite = s_disk[i].favorite;
    invalidate_disk(&favorite, !s_forget_pending[i]);
  }
}
static void invalidate_arrivals(void) {
  memset(s_arrivals, 0, sizeof(s_arrivals));
  invalidate_disk(NULL, true); s_dirty = false;
}
static void load_preferences(void) {
  for (int i = 0; i < MAX_FAVORITES; i++) {
    Favorite f;
    if (persist_get_size(KEY_FAVORITE + i) != (int)sizeof(f) || persist_read_data(KEY_FAVORITE + i, &f, sizeof(f)) != (int)sizeof(f) || !favorite_valid(&f)) continue;
    bool duplicate = false;
    for (int j = 0; j < i; j++) if (s_favorites[j].version && favorite_equal(&f, &s_favorites[j])) duplicate = true;
    if (!duplicate) s_favorites[i] = f;
  }
  int selected = persist_read_int(KEY_SELECTED);
  s_selected = selected >= 0 && selected < MAX_FAVORITES && s_favorites[selected].version ? selected : 0;
  if (!s_favorites[s_selected].version && favorite_count()) s_selected = favorite_at(0);
  uint32_t now = now_seconds();
  for (int i = 0; i < CACHE_SLOTS; i++) {
    if (persist_get_size(KEY_CACHE + i) != (int)sizeof(DiskArrival) || persist_get_size(KEY_LABELS + i) != (int)sizeof(DiskLabels)
      || persist_read_data(KEY_CACHE + i, &s_disk[i], sizeof(DiskArrival)) != (int)sizeof(DiskArrival)
      || persist_read_data(KEY_LABELS + i, &s_disk_labels[i], sizeof(DiskLabels)) != (int)sizeof(DiskLabels)
      || !favorite_valid(&s_disk[i].favorite) || s_disk_labels[i].serial != s_disk[i].serial) continue;
    Labels *labels = &s_disk_labels[i].labels;
    if (!memchr(labels->station, 0, sizeof(labels->station)) || !memchr(labels->direction, 0, sizeof(labels->direction)) || !memchr(labels->line, 0, sizeof(labels->line))) continue;
    s_disk_valid[i] = true;
    if (s_disk[i].serial > s_serial) s_serial = s_disk[i].serial;
    if (s_disk[i].saved_at > now) continue;
    for (int f = 0; f < MAX_FAVORITES; f++) if (s_favorites[f].version && favorite_equal(&s_favorites[f], &s_disk[i].favorite)) {
      for (int p = 0; p < 3; p++) if (s_disk[i].predictions[p].order == p + 1 && prediction_valid(&s_disk[i].predictions[p], now)) {
        s_arrivals[f].predictions[p] = s_disk[i].predictions[p]; s_arrivals[f].seen = true;
      }
    }
  }
}
static void persist_cache(bool force) {
  uint32_t now = now_seconds();
  if (force || now != s_last_invalidation_try) { s_last_invalidation_try = now; retry_invalidations(); }
  if (!s_dirty || (!force && now - s_last_write < 15)) return;
  s_last_write = now;
  if (!s_favorites[s_selected].version || !has_predictions(&s_arrivals[s_selected], now)) { s_dirty = false; return; }
  int slot = -1;
  for (int i = 0; i < CACHE_SLOTS; i++) if (s_disk_valid[i] && favorite_equal(&s_disk[i].favorite, &s_favorites[s_selected])) slot = i;
  if (slot < 0) for (int i = 0; i < CACHE_SLOTS; i++) if (!s_disk_valid[i]) { slot = i; break; }
  if (slot < 0) slot = s_disk[0].serial <= s_disk[1].serial ? 0 : 1;
  DiskArrival record = { .favorite = s_favorites[s_selected], .saved_at = now, .serial = ++s_serial };
  memcpy(record.predictions, s_arrivals[s_selected].predictions, sizeof(record.predictions));
  DiskLabels labels = { .serial = record.serial, .labels = labels_for(&s_favorites[s_selected]) };
  // Delete the commit record first. A torn write cannot pair new labels with old ETAs.
  int removed = persist_delete(KEY_CACHE + slot);
  if (removed < 0 && removed != E_DOES_NOT_EXIST) { s_cache_error = true; return; }
  s_disk_valid[slot] = false; // The old commit is gone; failed deletion above keeps its tracking.
  s_invalidate_pending[slot] = false; s_forget_pending[slot] = false;
  if (persist_write_data(KEY_LABELS + slot, &labels, sizeof(labels)) != (int)sizeof(labels)) { s_cache_error = true; return; }
  s_disk[slot] = record; s_disk_labels[slot] = labels; s_disk_valid[slot] = true;
  // Keep tracking even an uncertain commit write so later invalidation deletes it.
  if (persist_write_data(KEY_CACHE + slot, &record, sizeof(record)) != (int)sizeof(record)) { s_cache_error = true; return; }
  s_dirty = false; s_cache_error = false;
}
static void save_selection(void) {
  if (persist_write_int(KEY_SELECTED, s_selected) < 0) s_storage_error = true;
}
static int array_at(const JsonDoc *doc, int array, int index) {
  if (array < 0 || doc->tokens[array].type != JSON_ARRAY || index < 0 || index >= doc->tokens[array].size) return -1;
  int token = array + 1;
  while (index--) token = doc->tokens[token].next;
  return token;
}
static bool integer(const JsonDoc *doc, int token, double min, double max, double *result) {
  double value;
  if (!json_number(doc, token, &value) || value < min || value > max || floor(value) != value) return false;
  if (result) *result = value;
  return true;
}
static bool read_id(const JsonDoc *doc, int token, char *out) { return json_string(doc, token, out, 49) && id_valid(out, 49); }
static int hex_digit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
static bool receive_catalog(const JsonDoc *doc) {
  int stations = json_get(doc, 0, "stations"), lines = json_get(doc, 0, "lines");
  if (stations < 0 || lines < 0 || doc->tokens[stations].type != JSON_ARRAY || doc->tokens[lines].type != JSON_ARRAY) return false;
  int ns = doc->tokens[stations].size, nl = doc->tokens[lines].size;
  bool cached;
  if (!json_bool(doc, json_get(doc, 0, "cached"), &cached)) return false;
  if (ns < 1 || ns > MAX_STATIONS || nl < 1 || nl > MAX_LINES) return false;
  bool changed = ns != s_station_count || nl != s_line_count;
  uint8_t masks[MAX_STATIONS] = {0};
  bool served[MAX_LINES][MAX_STATIONS] = {{false}};
  char id[49], other[49], name[241], color[8];
  double value;
  for (int i = 0; i < ns; i++) {
    int station = array_at(doc, stations, i);
    if (doc->tokens[station].type != JSON_ARRAY || doc->tokens[station].size != 3 || !read_id(doc, array_at(doc, station, 0), id)
      || !json_string(doc, array_at(doc, station, 1), name, sizeof(name)) || !name[0]
      || !integer(doc, array_at(doc, station, 2), 1, (1u << nl) - 1, &value)) return false;
    masks[i] = value;
    for (int j = 0; j < i; j++) { read_id(doc, array_at(doc, array_at(doc, stations, j), 0), other); if (!strcmp(id, other)) return false; }
  }
  for (int i = 0; i < nl; i++) {
    int line = array_at(doc, lines, i), path = array_at(doc, line, 3);
    if (doc->tokens[line].type != JSON_ARRAY || doc->tokens[line].size != 4 || !read_id(doc, array_at(doc, line, 0), id)
      || !json_string(doc, array_at(doc, line, 1), name, 121) || !name[0]
      || !json_string(doc, array_at(doc, line, 2), color, sizeof(color)) || strlen(color) != 7 || color[0] != '#'
      || path < 0 || doc->tokens[path].type != JSON_ARRAY || doc->tokens[path].size < 2 || doc->tokens[path].size > MAX_STATIONS) return false;
    for (int c = 1; c < 7; c++) if (hex_digit(color[c]) < 0) return false;
    for (int j = 0; j < i; j++) { read_id(doc, array_at(doc, array_at(doc, lines, j), 0), other); if (!strcmp(id, other)) return false; }
    for (int p = 0; p < doc->tokens[path].size; p++) {
      if (!integer(doc, array_at(doc, path, p), 0, ns - 1, &value) || served[i][(int)value] || !(masks[(int)value] & (1u << i))) return false;
      served[i][(int)value] = true;
    }
  }
  for (int i = 0; i < ns; i++) for (int l = 0; l < nl; l++) if (!!(masks[i] & (1u << l)) != served[l][i]) return false;
  // Only replace the catalogue after the complete message validates.
  for (int i = 0; i < ns; i++) {
    int station = array_at(doc, stations, i);
    read_id(doc, array_at(doc, station, 0), id);
    if (strcmp(id, s_stations[i].id) || masks[i] != s_stations[i].lines) changed = true;
    memcpy(s_stations[i].id, id, strlen(id) + 1);
    json_string(doc, array_at(doc, station, 1), name, sizeof(name)); copy_label(s_stations[i].name, sizeof(s_stations[i].name), name);
    s_stations[i].lines = masks[i];
  }
  for (int i = 0; i < nl; i++) {
    int line = array_at(doc, lines, i), path = array_at(doc, line, 3);
    read_id(doc, array_at(doc, line, 0), id);
    if (strcmp(id, s_lines[i].id) || s_lines[i].count != doc->tokens[path].size) changed = true;
    memcpy(s_lines[i].id, id, strlen(id) + 1);
    json_string(doc, array_at(doc, line, 1), name, sizeof(name)); copy_label(s_lines[i].name, sizeof(s_lines[i].name), name);
    json_string(doc, array_at(doc, line, 2), color, sizeof(color));
    uint32_t rgb = 0;
    for (int c = 1; c < 7; c++) rgb = (rgb << 4) | hex_digit(color[c]);
    s_lines[i].color = GColorFromRGB((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
    s_lines[i].count = doc->tokens[path].size;
    for (int p = 0; p < s_lines[i].count; p++) {
      integer(doc, array_at(doc, path, p), 0, ns - 1, &value);
      if (s_lines[i].stations[p] != (int)value) changed = true;
      s_lines[i].stations[p] = value;
    }
  }
  s_station_count = ns; s_line_count = nl; s_error[0] = 0;
  if (!cached) for (int i = 0; i < MAX_FAVORITES; i++) if (s_favorites[i].version && !favorite_in_network(&s_favorites[i])) {
    memset(&s_arrivals[i], 0, sizeof(Arrival)); invalidate_disk(&s_favorites[i], true);
  }
  bool editing = s_view == STATIONS || s_view == LINES || s_view == DIRECTIONS;
  for (int i = 0; i < s_history_count; i++) if (s_history[i].view == STATIONS || s_history[i].view == LINES || s_history[i].view == DIRECTIONS) editing = true;
  if (changed && editing) {
    s_history_count = 0; s_row = 0; s_view = favorite_count() ? FAVORITES : EMPTY;
    notice("Station list updated. Please choose again.");
  }
  s_need_watch = true;
  log_memory("catalog");
  return true;
}
static bool read_prediction(const JsonDoc *doc, int token, Prediction *p, uint32_t now) {
  char type[2], units[2];
  double order, value, received, expires, upper = 0;
  if (token < 0 || doc->tokens[token].type != JSON_OBJECT || !json_string(doc, json_get(doc, token, "type"), type, sizeof(type)) || !type[0] || !strchr("etlmi", type[0])
    || !json_string(doc, json_get(doc, token, "units"), units, sizeof(units)) || !units[0] || !strchr("sm", units[0])
    || !integer(doc, json_get(doc, token, "order"), 1, 3, &order)
    || !json_number(doc, json_get(doc, token, "value"), &value) || value < 0
    || !json_number(doc, json_get(doc, token, "received"), &received)
    || !json_number(doc, json_get(doc, token, "expires"), &expires)
    || received < 0 || received > 1e15 || expires <= received || expires - received > 120000) return false;
  double mapped = received + s_offset, end = expires + s_offset;
  if (mapped < 0 || mapped > (now + 1.0) * 1000 || end < 0 || end > (now + 121.0) * 1000) return false;
  // Whole seconds avoid the SDK clock's sub-second wobble; validity only shortens.
  uint32_t start = (uint32_t)floor(fmin(mapped, now * 1000.0) / 1000);
  end -= mapped - start * 1000.0;
  if (end <= now * 1000.0) return false;
  if (type[0] == 't') value += s_offset / 1000.0;
  if (type[0] == 'i' && !json_number(doc, json_get(doc, token, "upper"), &upper)) return false;
  *p = (Prediction){ .value = value, .upper = upper, .received = start, .expires = (uint32_t)floor(end / 1000), .type = type[0], .units = units[0], .order = order, .valid = true };
  return prediction_valid(p, now);
}
static bool receive_arrivals(const JsonDoc *doc) {
  char station[49]; double at;
  int list = json_get(doc, 0, "predictions");
  uint32_t now = now_seconds();
  if (!read_id(doc, json_get(doc, 0, "station"), station) || !json_number(doc, json_get(doc, 0, "at"), &at)
    || at < 0 || at > 1e15 || at + s_offset > (now + 1.0) * 1000 || at + s_offset < (now * 1000.0) - 120000
    || list < 0 || doc->tokens[list].type != JSON_ARRAY || doc->tokens[list].size > 64) return false;
  for (int f = 0; f < MAX_FAVORITES; f++) if (s_favorites[f].version && !strcmp(s_favorites[f].station, station) && at >= s_arrivals[f].source_at) {
    Arrival arrival = { .source_at = (int64_t)at, .seen = true, .live = true };
    for (int i = 0; i < doc->tokens[list].size; i++) {
      int token = array_at(doc, list, i);
      if (!json_equal(doc, json_get(doc, token, "direction"), s_favorites[f].direction)) continue;
      Prediction p;
      if (read_prediction(doc, token, &p, now)) arrival.predictions[p.order - 1] = p;
    }
    s_arrivals[f] = arrival;
    if (!has_predictions(&arrival, now)) invalidate_disk(&s_favorites[f], true);
    else if (f == s_selected) s_dirty = true;
  }
  persist_cache(false);
  return true;
}
static bool observe_generation(const JsonDoc *doc) {
  double generation;
  if (!integer(doc, json_get(doc, 0, "generation"), 0, UINT32_MAX, &generation)) return false;
  if ((!s_generation_known && generation != 0) || (s_generation_known && s_feed_generation != (uint32_t)generation)) invalidate_arrivals();
  s_feed_generation = generation; s_generation_known = true;
  return true;
}
static bool logical_message(const char *text, size_t length) {
  JsonDoc doc;
  if (!json_parse(&doc, text, length, s_tokens, ARRAY_LENGTH(s_tokens)) || doc.tokens[0].type != JSON_OBJECT) return false;
  int type = json_get(&doc, 0, "type");
  if (s_ready && (json_equal(&doc, type, "connection") || json_equal(&doc, type, "arrivals")) && !observe_generation(&doc)) return false;
  if (json_equal(&doc, type, "hello")) {
    double echo, at;
    if (!json_number(&doc, json_get(&doc, 0, "echo"), &echo) || echo != s_hello_at || !json_number(&doc, json_get(&doc, 0, "at"), &at) || at < 0 || at > 1e15) return false;
    s_offset = s_hello_at - (int64_t)at; s_ready = true; s_need_watch = true;
    if (!s_station_count) s_need_catalog = true;
  } else if (!s_ready) return false;
  else if (json_equal(&doc, type, "catalog")) {
    if (!receive_catalog(&doc)) { copy_label(s_error, sizeof(s_error), "Invalid station data"); return false; }
  } else if (json_equal(&doc, type, "arrivals")) {
    if (!receive_arrivals(&doc)) return false;
  } else if (json_equal(&doc, type, "connection")) {
    int status = json_get(&doc, 0, "status");
    if (json_equal(&doc, status, "connected")) s_source = SOURCE_CONNECTED;
    else if (json_equal(&doc, status, "connecting")) s_source = SOURCE_CONNECTING;
    else if (json_equal(&doc, status, "disconnected")) { s_source = SOURCE_DISCONNECTED; invalidate_arrivals(); }
    else return false;
    char error[128];
    if (json_string(&doc, json_get(&doc, 0, "error"), error, sizeof(error))) copy_label(s_error, sizeof(s_error), error);
    else s_error[0] = 0;
  }
  draw(); return true;
}
static void receive_packet(DictionaryIterator *iterator, void *context) {
  (void)context;
  Tuple *tuple = dict_find(iterator, MESSAGE_KEY_DATA);
  if (!tuple || tuple->type != TUPLE_CSTRING || tuple->length < 2 || tuple->length > 4096) return;
  const char *raw = (const char *)tuple->value;
  if (raw[tuple->length - 1] != 0 || memchr(raw, 0, tuple->length - 1)) return;
  JsonDoc doc;
  double v, id, part, total;
  if (!json_parse(&doc, raw, tuple->length - 1, s_tokens, ARRAY_LENGTH(s_tokens))) return;
  if (s_tokens[0].type == JSON_OBJECT && !s_tokens[0].size) { // PKJS startup wake.
    if (s_ready) invalidate_arrivals();
    begin_session(); send_next(); draw(); return;
  }
  if (!integer(&doc, json_get(&doc, 0, "v"), 1, 1, &v) || !json_equal(&doc, json_get(&doc, 0, "session"), s_session)
    || !integer(&doc, json_get(&doc, 0, "id"), 1, UINT32_MAX, &id)
    || !integer(&doc, json_get(&doc, 0, "part"), 0, 31, &part)
    || !integer(&doc, json_get(&doc, 0, "total"), 1, 32, &total) || part >= total
    || !json_string(&doc, json_get(&doc, 0, "text"), s_chunk, sizeof(s_chunk))) return;
  uint32_t now = now_seconds(), packet_id = (uint32_t)id;
  size_t length = strlen(s_chunk);
  bool accepted = false;
  if (packet_id <= s_last_id) accepted = true;
  else {
    if (s_next_part && now - s_progress > 20) s_next_part = 0;
    if (!s_next_part || packet_id != s_batch_id) {
      if (part != 0 || (s_next_part && packet_id < s_batch_id)) return;
      s_batch_id = packet_id; s_batch_length = 0; s_next_part = 0; s_total_parts = total;
    }
    if (s_total_parts != total) { s_next_part = 0; return; }
    if (part < s_next_part) accepted = part == s_next_part - 1 && length == s_last_length && !memcmp(s_batch + s_last_start, s_chunk, length);
    else {
      if (part != s_next_part || s_batch_length + length > 5000) { s_next_part = 0; return; }
      s_last_start = s_batch_length; s_last_length = length;
      memcpy(s_batch + s_batch_length, s_chunk, length + 1); s_batch_length += length;
      s_next_part++; s_progress = now;
      if (s_next_part == s_total_parts) {
        s_next_part = 0;
        if (!logical_message(s_batch, s_batch_length)) return;
        s_last_id = packet_id;
      }
      accepted = true;
    }
  }
  if (accepted) { s_ack_id = packet_id; s_ack_part = part; s_ack_pending = true; send_next(); }
}
static void send_next(void) {
  if (s_outbox_busy) return;
  SendType type = s_ack_pending ? SEND_ACK : s_need_hello ? SEND_HELLO : s_need_watch && s_ready ? SEND_WATCH : s_need_catalog && s_ready ? SEND_CATALOG : SEND_NONE;
  if (type == SEND_NONE) return;
  int length = snprintf(s_outgoing, sizeof(s_outgoing), "{\"v\":1,\"session\":\"%s\",", s_session);
  if (type == SEND_ACK) length += snprintf(s_outgoing + length, sizeof(s_outgoing) - length, "\"type\":\"ack\",\"id\":%lu,\"part\":%u}", (unsigned long)s_ack_id, s_ack_part);
  else if (type == SEND_HELLO) {
    s_hello_at = (int64_t)now_seconds() * 1000; s_last_hello = now_seconds();
    length += snprintf(s_outgoing + length, sizeof(s_outgoing) - length, "\"type\":\"hello\",\"now\":%lu000}", (unsigned long)(s_hello_at / 1000));
  } else if (type == SEND_CATALOG) length += snprintf(s_outgoing + length, sizeof(s_outgoing) - length, "\"type\":\"catalog\"}");
  else {
    const Favorite *f = &s_favorites[s_selected];
    if (f->version) length += snprintf(s_outgoing + length, sizeof(s_outgoing) - length, "\"type\":\"watch\",\"favorite\":{\"station\":\"%s\",\"line\":\"%s\",\"direction\":\"%s\"}}", f->station, f->line, f->direction);
    else length += snprintf(s_outgoing + length, sizeof(s_outgoing) - length, "\"type\":\"watch\",\"favorite\":null}");
  }
  if (length < 0 || length >= (int)sizeof(s_outgoing)) return;
  DictionaryIterator *iterator;
  if (app_message_outbox_begin(&iterator) != APP_MSG_OK) return;
  if (dict_write_cstring(iterator, MESSAGE_KEY_DATA, s_outgoing) != DICT_OK) return;
  s_sending = type; s_sending_session = s_session_counter; s_sent_ack_id = s_ack_id; s_sent_ack_part = s_ack_part;
  s_outbox_busy = app_message_outbox_send() == APP_MSG_OK;
  if (s_outbox_busy) {
    if (type == SEND_ACK) s_ack_pending = false;
    else if (type == SEND_HELLO) s_need_hello = false;
    else if (type == SEND_WATCH) s_need_watch = false;
    else if (type == SEND_CATALOG) s_need_catalog = false;
  }
}
static void outbox_sent(DictionaryIterator *iterator, void *context) {
  (void)iterator; (void)context;
  s_sending = SEND_NONE; s_outbox_busy = false; send_next();
}
static void outbox_failed(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  (void)iterator; (void)reason; (void)context;
  if (s_sending_session == s_session_counter) {
    if (s_sending == SEND_ACK && !s_ack_pending) { s_ack_pending = true; s_ack_id = s_sent_ack_id; s_ack_part = s_sent_ack_part; }
    else if (s_sending == SEND_HELLO) s_need_hello = true;
    else if (s_sending == SEND_WATCH) s_need_watch = true;
    else if (s_sending == SEND_CATALOG) s_need_catalog = true;
  }
  s_sending = SEND_NONE; s_outbox_busy = false;
}
static void begin_session(void) {
  snprintf(s_session, sizeof(s_session), "%lx-%lx-%lx", (unsigned long)now_seconds(), (unsigned long)rand(), (unsigned long)++s_session_counter);
  s_ready = false; s_generation_known = false; s_source = SOURCE_CONNECTING; s_need_hello = true; s_need_watch = false; s_need_catalog = false;
  s_ack_pending = false; s_next_part = 0; s_last_id = 0; s_error[0] = 0; s_attempt = now_seconds();
  for (int i = 0; i < MAX_FAVORITES; i++) { s_arrivals[i].live = false; s_arrivals[i].source_at = 0; }
  send_next(); draw();
}
static void go(View view, bool push) {
  if (push && s_history_count < ARRAY_LENGTH(s_history)) s_history[s_history_count++] = (History){ s_view, s_row };
  s_view = view; s_row = 0; draw();
}
static void notice(const char *text) { copy_label(s_notice, sizeof(s_notice), text); go(NOTICE, true); }
static void back(void) {
  if (s_view == EMPTY || s_view == FAVORITES) { persist_cache(true); window_stack_pop(true); return; }
  if (s_view == ARRIVALS) { s_history_count = 0; go(FAVORITES, false); return; }
  if (s_history_count) { History h = s_history[--s_history_count]; s_view = h.view; s_row = h.row; draw(); }
  else go(s_favorites[s_selected].version ? ARRIVALS : EMPTY, false);
}
static int draft_line_count(void) {
  if (s_draft_station >= s_station_count) return 0;
  int count = 0;
  for (int i = 0; i < s_line_count; i++) if (s_stations[s_draft_station].lines & (1u << i)) count++;
  return count;
}
static int draft_line_at(int row) {
  if (s_draft_station >= s_station_count || row < 0) return -1;
  for (int i = 0; i < s_line_count; i++) if ((s_stations[s_draft_station].lines & (1u << i)) && row-- == 0) return i;
  return -1;
}
static int draft_direction_at(int row) {
  if (s_draft_station >= s_station_count || s_draft_line >= s_line_count || row < 0) return -1;
  int targets[2] = { s_lines[s_draft_line].stations[0], s_lines[s_draft_line].stations[s_lines[s_draft_line].count - 1] };
  for (int i = 0; i < 2; i++) if (targets[i] != s_draft_station && row-- == 0) return targets[i];
  return -1;
}
static int row_count(void) {
  switch (s_view) {
    case FAVORITES: return favorite_count() + 3;
    case STATIONS: return s_station_count;
    case LINES: return draft_line_count();
    case DIRECTIONS: return draft_direction_at(1) >= 0 ? 2 : 1;
    case ACTIONS: case REMOVE: return 2;
    default: return 0;
  }
}
static void select_favorite(int slot) {
  if (slot < 0) return;
  bool same_station = s_favorites[s_selected].version && !strcmp(s_favorites[s_selected].station, s_favorites[slot].station);
  persist_cache(true); s_selected = slot; save_selection(); s_attempt = now_seconds();
  if (!same_station) s_arrivals[slot].live = false;
  if (has_predictions(&s_arrivals[slot], now_seconds())) s_dirty = true;
  s_need_watch = true; s_last_sync = now_seconds();
  s_switches++;
  if (s_switches == 1 || s_switches % 16 == 0) log_memory("switch");
  send_next(); draw();
}
static void add_favorite(void) {
  int direction = draft_direction_at(s_row);
  if (direction < 0) { notice("Direction unavailable. Choose the station again."); return; }
  Favorite favorite = { .version = FORMAT };
  copy_label(favorite.station, sizeof(favorite.station), s_stations[s_draft_station].id);
  copy_label(favorite.line, sizeof(favorite.line), s_lines[s_draft_line].id);
  copy_label(favorite.direction, sizeof(favorite.direction), s_stations[direction].id);
  int slot = -1;
  for (int i = 0; i < MAX_FAVORITES; i++) if (s_favorites[i].version && favorite_equal(&favorite, &s_favorites[i])) { slot = i; break; }
  if (slot < 0) {
    for (int i = 0; i < MAX_FAVORITES; i++) if (!s_favorites[i].version) { slot = i; break; }
    if (slot < 0) { notice("Limit: 16 favourites. Remove one first."); return; }
    if (persist_write_data(KEY_FAVORITE + slot, &favorite, sizeof(favorite)) != (int)sizeof(favorite)) { s_storage_error = true; notice("Storage unavailable. Favourite was not saved."); return; }
    s_favorites[slot] = favorite; memset(&s_arrivals[slot], 0, sizeof(Arrival));
  }
  s_history_count = 0; go(ARRIVALS, false); select_favorite(slot);
}
static void select(void) {
  if (s_view == ARRIVALS) { go(ACTIONS, true); return; }
  if (s_view == NOTICE || s_view == ABOUT) { back(); return; }
  int count = row_count();
  if (count && s_row >= count) { s_row = 0; draw(); return; }
  if (s_view == EMPTY) {
    if (s_station_count) { s_history_count = 0; go(STATIONS, true); }
    else begin_session();
  } else if (s_view == FAVORITES) {
    int count = favorite_count();
    if (s_row < count) { int slot = favorite_at(s_row); s_history_count = 0; go(ARRIVALS, false); select_favorite(slot); }
    else if (s_row == count) {
      if (count == MAX_FAVORITES) notice("Limit: 16 favourites. Remove one first.");
      else if (!s_station_count) notice("Station data is unavailable. Open the Pebble phone app and retry.");
      else go(STATIONS, true);
    } else if (s_row == count + 1) { invalidate_arrivals(); begin_session(); }
    else go(ABOUT, true);
  } else if (s_view == STATIONS) {
    s_draft_station = s_row;
    int line = draft_line_at(0);
    if (line < 0) notice("Station unavailable. Choose again.");
    else if (draft_line_count() == 1) { s_draft_line = line; go(DIRECTIONS, true); }
    else go(LINES, true);
  } else if (s_view == LINES) {
    int line = draft_line_at(s_row);
    if (line < 0) notice("Line unavailable. Choose the station again.");
    else { s_draft_line = line; go(DIRECTIONS, true); }
  }
  else if (s_view == DIRECTIONS) add_favorite();
  else if (s_view == ACTIONS) {
    if (s_row == 0) { invalidate_arrivals(); begin_session(); back(); }
    else go(REMOVE, true);
  } else if (s_view == REMOVE) {
    if (!s_row) back();
    else {
      int result = persist_delete(KEY_FAVORITE + s_selected);
      if (result < 0 && result != E_DOES_NOT_EXIST) { s_storage_error = true; notice("Storage unavailable. Favourite was not removed."); return; }
      invalidate_disk(&s_favorites[s_selected], false); memset(&s_favorites[s_selected], 0, sizeof(Favorite)); memset(&s_arrivals[s_selected], 0, sizeof(Arrival));
      s_selected = favorite_count() ? favorite_at(0) : 0; save_selection(); s_history_count = 0; go(FAVORITES, false); s_need_watch = true; send_next();
    }
  }
}
static void click_select(ClickRecognizerRef recognizer, void *context) { (void)recognizer; (void)context; select(); draw(); }
static void click_back(ClickRecognizerRef recognizer, void *context) { (void)recognizer; (void)context; back(); }
static void move(int delta) {
  if (s_view == ARRIVALS) {
    int count = favorite_count();
    if (count) select_favorite(favorite_at((favorite_ordinal() + count + delta) % count));
  } else {
    int count = row_count();
    if (count) s_row = (s_row + count + delta) % count;
  }
  draw();
}
static void click_up(ClickRecognizerRef recognizer, void *context) { (void)recognizer; (void)context; move(-1); }
static void click_down(ClickRecognizerRef recognizer, void *context) { (void)recognizer; (void)context; move(1); }
static void click_config(void *context) {
  (void)context;
  window_single_click_subscribe(BUTTON_ID_SELECT, click_select);
  window_single_click_subscribe(BUTTON_ID_BACK, click_back);
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 160, click_up);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 160, click_down);
}
static void rect(GContext *ctx, GColor color, int x, int y, int width, int height) {
  graphics_context_set_fill_color(ctx, color); graphics_fill_rect(ctx, GRect(x, y, width, height), 0, GCornerNone);
}
static void text(GContext *ctx, const char *value, const char *font, int x, int y, int width, int height, GColor color) {
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, value, fonts_get_system_font(font), GRect(x, y, width, height), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
}
static void train(GContext *ctx, int x, int y, uint32_t now) {
  rect(ctx, GColorLightGray, x, y + 17, 30, 1);
  static const int phase[] = {0, 2, 4, 2}; x += phase[s_focused ? (now - s_attempt) % 4 : 0];
  rect(ctx, GColorBlack, x + 6, y, 10, 2); rect(ctx, GColorBlack, x + 2, y + 3, 18, 11);
  rect(ctx, GColorWhite, x + 5, y + 5, 4, 4); rect(ctx, GColorWhite, x + 13, y + 5, 4, 4);
  rect(ctx, GColorBlack, x + 5, y + 14, 3, 2); rect(ctx, GColorBlack, x + 14, y + 14, 3, 2);
}
static void arrival_label(const Prediction *p, uint32_t now, char *value, size_t size, char *unit, size_t unit_size) {
  value[0] = 0; unit[0] = 0;
  if (!prediction_valid(p, now)) return;
  double elapsed = now - p->received, multiplier = p->units == 'm' ? 60 : 1;
  double seconds = fmax(0, p->type == 't' ? p->value - now : p->value * multiplier - elapsed);
  copy_label(unit, unit_size, "min");
  if (!seconds && (p->type == 'e' || p->type == 't')) { copy_label(value, size, "Due"); copy_label(unit, unit_size, "Estimated now"); }
  else if (p->type == 'i') snprintf(value, size, "%d–%d", (int)floor(seconds / 60), (int)ceil(fmax(0, p->upper * multiplier - elapsed) / 60));
  else if (p->type == 'l' || p->type == 'm') snprintf(value, size, "%c%d", p->type == 'l' ? '<' : '>', p->type == 'l' ? (int)ceil(seconds / 60) : (int)floor(seconds / 60));
  else if (p->units == 'm') snprintf(value, size, "~%d", (int)ceil(seconds / 60));
  else if (seconds < 60) { snprintf(value, size, "%d", (int)ceil(seconds)); copy_label(unit, unit_size, "sec"); }
  else { int rounded = ceil(seconds); snprintf(value, size, "%d:%02d", rounded / 60, rounded % 60); }
}
static const char *stage(void) {
  if (!s_ready) return "Connecting to phone";
  if (!s_station_count) return "Loading stations";
  return s_source == SOURCE_CONNECTING ? "Connecting to feed" : "Waiting for arrivals";
}
static const char *status(uint32_t now) {
  const Arrival *arrival = &s_arrivals[s_selected];
  if (has_predictions(arrival, now)) return s_ready && s_source == SOURCE_CONNECTED && arrival->live ? "LIVE" : "SAVED";
  if (s_error[0] || s_source == SOURCE_DISCONNECTED) return "UNAVAILABLE";
  if (arrival->seen) {
    for (int i = 0; i < 3; i++) if (arrival->predictions[i].valid) return "STALE";
    return "NO ESTIMATE";
  }
  if (now - s_attempt >= 15) return "UNAVAILABLE";
  return !s_ready ? "CONNECTING" : "LOADING";
}
static void menu_label(int row, char *title, size_t size, char *detail, size_t detail_size) {
  detail[0] = 0;
  if (s_view == FAVORITES) {
    int count = favorite_count();
    if (row < count) { Labels labels = labels_for(&s_favorites[favorite_at(row)]); copy_label(title, size, labels.station); copy_label(detail, detail_size, labels.direction); }
    else copy_label(title, size, row == count ? "+ Add favourite" : row == count + 1 ? "Retry data" : "About / data");
  } else if (s_view == STATIONS) copy_label(title, size, row < s_station_count ? s_stations[row].name : "Unavailable");
  else if (s_view == LINES) { int line = draft_line_at(row); copy_label(title, size, line >= 0 ? s_lines[line].name : "Unavailable"); }
  else if (s_view == DIRECTIONS) { int direction = draft_direction_at(row); copy_label(title, size, direction >= 0 ? s_stations[direction].name : "Unavailable"); }
  else if (s_view == ACTIONS) copy_label(title, size, row ? "Remove favourite" : "Retry live data");
  else copy_label(title, size, row ? "Remove it" : "Keep favourite");
}
static void update_layer(Layer *layer, GContext *ctx) {
  (void)layer;
  uint32_t now = now_seconds();
  char clock[8], footer[64] = "", value[24], unit[20], buffer[192];
  clock_copy_time_string(clock, sizeof(clock));
  const char *header = s_view == ARRIVALS ? status(now) : s_view == EMPTY ? !s_station_count ? now - s_attempt >= 15 ? "UNAVAILABLE" : "CONNECTING" : "METRO LISBOA" : "METRO LISBOA";
  rect(ctx, GColorWhite, 0, 0, 200, 228); rect(ctx, GColorBlack, 0, 0, 200, 24);
  text(ctx, header, FONT_KEY_GOTHIC_14_BOLD, 8, 3, 144, 22, GColorWhite);
  text(ctx, clock, FONT_KEY_GOTHIC_14, 155, 3, 43, 22, GColorWhite);
  if (s_view == ARRIVALS && s_favorites[s_selected].version) {
    Labels labels = labels_for(&s_favorites[s_selected]);
    text(ctx, labels.station, strlen(labels.station) > 21 ? FONT_KEY_GOTHIC_18_BOLD : FONT_KEY_GOTHIC_24_BOLD, 10, 28, 182, 31, GColorBlack);
    rect(ctx, labels.color, 10, 65, 4, 14); text(ctx, labels.line, FONT_KEY_GOTHIC_18_BOLD, 19, 59, 174, 25, GColorBlack);
    snprintf(buffer, sizeof(buffer), "→ %s", labels.direction); text(ctx, buffer, FONT_KEY_GOTHIC_18, 10, 82, 184, 26, GColorBlack);
    const Arrival *arrival = &s_arrivals[s_selected];
    arrival_label(&arrival->predictions[0], now, value, sizeof(value), unit, sizeof(unit));
    // The number-only Bitham font has no Unicode range dash.
    bool numeric = value[0] >= '0' && value[0] <= '9' && arrival->predictions[0].type != 'i';
    bool show_unit = unit[0] && !strchr(value, ':') && strcmp(value, "Due");
    text(ctx, value[0] ? value : "--:--", numeric ? FONT_KEY_BITHAM_42_BOLD : FONT_KEY_GOTHIC_24_BOLD, 10, 108, show_unit ? 126 : 182, 53, GColorBlack);
    if (show_unit) text(ctx, unit, FONT_KEY_GOTHIC_18, 142, 124, 50, 34, GColorBlack);
    buffer[0] = 0;
    for (int p = 1; p < 3; p++) {
      char next[24], next_unit[20], entry[48];
      arrival_label(&arrival->predictions[p], now, next, sizeof(next), next_unit, sizeof(next_unit));
      if (!next[0]) continue;
      snprintf(entry, sizeof(entry), "%s%s%s", next, strchr(next, ':') ? "" : " ", strchr(next, ':') ? "" : next_unit);
      size_t used = strlen(buffer); snprintf(buffer + used, sizeof(buffer) - used, "%s%s", used ? "   /   " : "", entry);
    }
    bool waiting = !arrival->live && (!arrival->seen || has_predictions(arrival, now)) && !s_error[0] && s_source != SOURCE_DISCONNECTED;
    bool loading = waiting && now - s_attempt < 15;
    if (!buffer[0] && !loading) copy_label(buffer, sizeof(buffer), !strcmp(value, "Due") ? unit : s_error[0] ? s_error : !strcmp(header, "STALE") ? "Waiting for fresh data" : !strcmp(header, "NO ESTIMATE") ? "No live estimate" : "Waiting for data");
    text(ctx, buffer, FONT_KEY_GOTHIC_18, 10, 159, 182, 24, GColorBlack);
    if (loading) { train(ctx, 10, 182, now); text(ctx, "Updating", FONT_KEY_GOTHIC_14, 46, 182, 146, 20, GColorBlack); }
    snprintf(footer, sizeof(footer), "Select: actions  %d/%d", favorite_ordinal() + 1, favorite_count());
  } else if (s_view == EMPTY) {
    text(ctx, "Your Metro.", FONT_KEY_GOTHIC_24_BOLD, 10, 28, 182, 31, GColorBlack);
    if (!s_station_count && !s_error[0] && now - s_attempt < 15) { train(ctx, 10, 85, now); text(ctx, stage(), FONT_KEY_GOTHIC_14, 46, 81, 146, 30, GColorBlack); }
    else text(ctx, s_station_count ? "Save a station and direction. No GPS needed." : s_error[0] ? s_error : "Open the Pebble phone app and retry.", FONT_KEY_GOTHIC_18, 10, 65, 182, 125, GColorBlack);
    copy_label(footer, sizeof(footer), "Select: add / retry");
  } else if (s_view == NOTICE || s_view == ABOUT) {
    text(ctx, s_view == ABOUT ? "About Metro" : "Metro", FONT_KEY_GOTHIC_24_BOLD, 10, 28, 182, 31, GColorBlack);
    text(ctx, s_view == ABOUT ? "Metro 0.2 (native).\nIndependent app.\nUnderLX · ODbL 1.0\nunderlx.com\nEstimates, not guarantees." : s_notice, FONT_KEY_GOTHIC_18, 10, 65, 182, 132, GColorBlack);
    copy_label(footer, sizeof(footer), "Select: back");
  } else {
    const char *title = s_view == FAVORITES ? "Favourites" : s_view == STATIONS ? "Station" : s_view == LINES ? "Line" : s_view == DIRECTIONS ? "Direction" : s_view == ACTIONS ? "Actions" : "Remove it?";
    text(ctx, title, FONT_KEY_GOTHIC_24_BOLD, 10, 28, 182, 31, GColorBlack);
    int count = row_count(), first = (s_row / 4) * 4;
    for (int i = first; i < count && i < first + 4; i++) {
      char label[81], detail[65]; menu_label(i, label, sizeof(label), detail, sizeof(detail));
      int y = 61 + (i - first) * 34; bool selected = i == s_row;
      if (selected) rect(ctx, GColorBlack, 0, y, 200, 34);
      text(ctx, label, FONT_KEY_GOTHIC_18, 10, y, 182, detail[0] ? 21 : 33, selected ? GColorWhite : GColorBlack);
      if (detail[0]) text(ctx, detail, FONT_KEY_GOTHIC_14, 10, y + 17, 182, 18, selected ? GColorWhite : GColorBlack);
    }
    snprintf(footer, sizeof(footer), "Up/Down: choose  %d/%d", s_row + 1, count);
  }
  rect(ctx, GColorLightGray, 0, 202, 200, 26);
  text(ctx, s_storage_error ? "Storage unavailable" : s_cache_error ? "Cache unavailable" : footer, FONT_KEY_GOTHIC_14_BOLD, 8, 205, 190, 23, GColorBlack);
  if (!s_announced) { s_announced = true; APP_LOG(APP_LOG_LEVEL_INFO, "Metro native UI ready"); log_memory("ready"); }
}
static void draw(void) { if (s_layer) layer_mark_dirty(s_layer); }
static void tick(struct tm *time, TimeUnits changed) {
  (void)time; (void)changed;
  uint32_t now = now_seconds();
  if (now < s_last_now || now - s_last_now > 5) { invalidate_arrivals(); begin_session(); }
  s_last_now = now;
  if (!s_ready && now - s_last_hello >= 10) s_need_hello = true;
  if (s_ready && now - s_last_sync >= 15) { s_need_watch = true; if (!s_station_count) s_need_catalog = true; s_last_sync = now; }
  persist_cache(false); send_next();
  if (s_view == ARRIVALS || (s_view == EMPTY && !s_station_count) || time->tm_sec == 0) draw();
}
static void connection_changed(bool connected) {
  if (!connected) { s_ready = false; s_source = SOURCE_DISCONNECTED; invalidate_arrivals(); copy_label(s_error, sizeof(s_error), "Phone disconnected"); }
  else begin_session();
  draw();
}
static void focus_changed(bool focused) { s_focused = focused; if (!focused) persist_cache(true); draw(); }
static void init(void) {
  srand(now_seconds() ^ ((uint32_t)time_ms(NULL, NULL) << 16));
  load_preferences(); s_view = favorite_count() ? ARRIVALS : EMPTY; s_last_now = s_attempt = now_seconds();
  APP_LOG(APP_LOG_LEVEL_INFO, "Metro persistence limit=%lu", (unsigned long)persist_get_max_size());
  s_window = window_create();
  if (!s_window) return;
  window_set_background_color(s_window, GColorWhite); window_set_click_config_provider(s_window, click_config);
  s_layer = layer_create(GRect(0, 0, 200, 228));
  if (!s_layer) return;
  layer_set_update_proc(s_layer, update_layer); layer_add_child(window_get_root_layer(s_window), s_layer);
  app_message_register_inbox_received(receive_packet); app_message_register_outbox_sent(outbox_sent); app_message_register_outbox_failed(outbox_failed);
  if (app_message_open(4096, 1024) != APP_MSG_OK) copy_label(s_error, sizeof(s_error), "Phone messaging unavailable");
  connection_service_subscribe((ConnectionHandlers){ .pebble_app_connection_handler = connection_changed });
  app_focus_service_subscribe(focus_changed); tick_timer_service_subscribe(SECOND_UNIT, tick);
  window_stack_push(s_window, true); begin_session();
}
static void deinit(void) {
  persist_cache(true); tick_timer_service_unsubscribe(); connection_service_unsubscribe(); app_focus_service_unsubscribe(); app_message_deregister_callbacks();
  if (s_layer) layer_destroy(s_layer);
  if (s_window) window_destroy(s_window);
}
int main(void) { init(); if (s_window && s_layer) app_event_loop(); deinit(); return 0; }
