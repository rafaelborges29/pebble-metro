#ifndef METRO_JSON_H
#define METRO_JSON_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define JSON_MAX_LENGTH 5000
#define JSON_MAX_DEPTH 16

typedef enum {
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_STRING,
  JSON_NUMBER,
  JSON_TRUE,
  JSON_FALSE,
  JSON_NULL
} JsonType;

typedef struct {
  uint16_t start;
  uint16_t end;
  uint16_t next;
  uint16_t size;
  uint8_t type;
} JsonToken;

typedef struct {
  const char *text;
  size_t length;
  JsonToken *tokens;
  uint16_t count;
} JsonDoc;

/* No allocation. Input and tokens must remain alive and unchanged while read.
 * On success token 0 is the root; next is the first token after a subtree.
 * size counts object pairs or array elements (zero for scalar tokens).
 * start/end are byte offsets [start, end); strings exclude their quotes.
 * At most JSON_MAX_DEPTH nested containers and JSON_MAX_LENGTH bytes are allowed.
 * Malformed UTF-8, unpaired surrogates and decoded NUL are rejected.
 * On failure doc is cleared; token storage may be partially written. */
bool json_parse(JsonDoc *doc, const char *text, size_t length,
                JsonToken *tokens, size_t capacity);

/* Object lookup compares decoded keys. Missing keys, non-objects and duplicate
 * matches (including differently escaped spellings) return -1. */
int json_get(const JsonDoc *doc, int object_index, const char *key);

/* Decode a string and append NUL. out_size includes the terminator.
 * On failure a supplied, nonempty output buffer is cleared. */
bool json_string(const JsonDoc *doc, int index, char *out, size_t out_size);

/* Read a finite double. Extremely small numbers may underflow to zero. */
bool json_number(const JsonDoc *doc, int index, double *out);
bool json_bool(const JsonDoc *doc, int index, bool *out);

/* Compare a decoded JSON string with a NUL-terminated UTF-8 C string. */
bool json_equal(const JsonDoc *doc, int index, const char *value);

#endif
