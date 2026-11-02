#include "json.h"

#include <float.h>
#include <string.h>

static bool hex4(const char *text, size_t length, size_t *position,
                 uint32_t *value) {
  uint32_t result = 0;
  if (length - *position < 4) return false;
  for (unsigned i = 0; i < 4; ++i) {
    unsigned char c = (unsigned char)text[(*position)++];
    unsigned digit;
    if (c >= '0' && c <= '9') digit = c - '0';
    else if (c >= 'a' && c <= 'f') digit = c - 'a' + 10;
    else if (c >= 'A' && c <= 'F') digit = c - 'A' + 10;
    else return false;
    result = (result << 4) | digit;
  }
  *value = result;
  return true;
}

/* Consume one decoded, non-NUL character, rejecting noncanonical UTF-8. */
static bool character(const char *text, size_t length, size_t *position,
                      uint32_t *value) {
  if (*position >= length) return false;
  unsigned char c = (unsigned char)text[(*position)++];
  uint32_t result = c;
  if (c == '\\') {
    if (*position >= length) return false;
    c = (unsigned char)text[(*position)++];
    switch (c) {
      case '"': result = '"'; break;
      case '\\': result = '\\'; break;
      case '/': result = '/'; break;
      case 'b': result = '\b'; break;
      case 'f': result = '\f'; break;
      case 'n': result = '\n'; break;
      case 'r': result = '\r'; break;
      case 't': result = '\t'; break;
      case 'u':
        if (!hex4(text, length, position, &result)) return false;
        if (result >= 0xd800 && result <= 0xdbff) {
          uint32_t low;
          if (length - *position < 2 || text[*position] != '\\' ||
              text[*position + 1] != 'u') return false;
          *position += 2;
          if (!hex4(text, length, position, &low) ||
              low < 0xdc00 || low > 0xdfff) return false;
          result = 0x10000 + ((result - 0xd800) << 10) + (low - 0xdc00);
        } else if (result >= 0xdc00 && result <= 0xdfff) {
          return false;
        }
        if (result == 0) return false;
        break;
      default: return false;
    }
  } else if (c < 0x20 || c == '"') {
    return false;
  } else if (c >= 0x80) {
    unsigned remaining;
    uint32_t minimum;
    if (c >= 0xc2 && c <= 0xdf) {
      remaining = 1;
      minimum = 0x80;
      result = c & 0x1f;
    } else if (c >= 0xe0 && c <= 0xef) {
      remaining = 2;
      minimum = 0x800;
      result = c & 0x0f;
    } else if (c >= 0xf0 && c <= 0xf4) {
      remaining = 3;
      minimum = 0x10000;
      result = c & 0x07;
    } else {
      return false;
    }
    if (length - *position < remaining) return false;
    while (remaining--) {
      c = (unsigned char)text[(*position)++];
      if ((c & 0xc0) != 0x80) return false;
      result = (result << 6) | (c & 0x3f);
    }
    if (result < minimum || result > 0x10ffff ||
        (result >= 0xd800 && result <= 0xdfff)) return false;
  }
  *value = result;
  return true;
}

static bool string_token(const char *text, size_t length, size_t *position,
                         JsonToken *token) {
  token->type = JSON_STRING;
  ++*position;
  token->start = (uint16_t)*position;
  while (*position < length) {
    uint32_t ignored;
    if (text[*position] == '"') {
      token->end = (uint16_t)*position;
      ++*position;
      return true;
    }
    if (!character(text, length, position, &ignored)) return false;
  }
  return false;
}

static bool digit(char c) {
  return c >= '0' && c <= '9';
}

static bool number_end(const char *text, size_t length, size_t *position) {
  size_t i = *position;
  if (i < length && text[i] == '-') ++i;
  if (i == length) return false;
  if (text[i] == '0') ++i;
  else if (text[i] >= '1' && text[i] <= '9') {
    do { ++i; } while (i < length && digit(text[i]));
  } else return false;
  if (i < length && text[i] == '.') {
    ++i;
    if (i == length || !digit(text[i])) return false;
    do { ++i; } while (i < length && digit(text[i]));
  }
  if (i < length && (text[i] == 'e' || text[i] == 'E')) {
    ++i;
    if (i < length && (text[i] == '+' || text[i] == '-')) ++i;
    if (i == length || !digit(text[i])) return false;
    do { ++i; } while (i < length && digit(text[i]));
  }
  *position = i;
  return true;
}

static void whitespace(const char *text, size_t length, size_t *position) {
  while (*position < length) {
    char c = text[*position];
    if (c != ' ' && c != '\t' && c != '\n' && c != '\r') break;
    ++*position;
  }
}

enum {
  OBJECT_FIRST_KEY, OBJECT_KEY, OBJECT_COLON, OBJECT_VALUE, OBJECT_NEXT,
  ARRAY_FIRST_VALUE, ARRAY_VALUE, ARRAY_NEXT
};

typedef struct {
  uint16_t token;
  uint8_t state;
} Frame;

bool json_parse(JsonDoc *doc, const char *text, size_t length,
                JsonToken *tokens, size_t capacity) {
  if (!doc) return false;
  *doc = (JsonDoc){0};
  if (!text || !tokens || !capacity || !length || length > JSON_MAX_LENGTH)
    return false;
  JsonDoc parsed = {text, length, tokens, 0};
  Frame stack[JSON_MAX_DEPTH];
  size_t depth = 0;
  size_t position = 0;
  for (;;) {
    whitespace(text, length, &position);
    if (depth) {
      Frame *frame = &stack[depth - 1];
      JsonToken *parent = &tokens[frame->token];
      if (position == length) return false;
      char c = text[position];
      bool close = (c == '}' && (frame->state == OBJECT_FIRST_KEY ||
                                 frame->state == OBJECT_NEXT)) ||
                   (c == ']' && (frame->state == ARRAY_FIRST_VALUE ||
                                 frame->state == ARRAY_NEXT));
      if (close) {
        parent->end = (uint16_t)++position;
        parent->next = parsed.count;
        --depth;
        continue;
      }
      switch (frame->state) {
        case OBJECT_FIRST_KEY:
        case OBJECT_KEY: {
          if (c != '"' || parsed.count >= capacity) return false;
          JsonToken *key = &tokens[parsed.count++];
          *key = (JsonToken){0};
          key->next = parsed.count;
          if (!string_token(text, length, &position, key)) return false;
          frame->state = OBJECT_COLON;
          continue;
        }
        case OBJECT_COLON:
          if (c != ':') return false;
          ++position;
          frame->state = OBJECT_VALUE;
          continue;
        case OBJECT_NEXT:
        case ARRAY_NEXT:
          if (c != ',') return false;
          ++position;
          frame->state = frame->state == OBJECT_NEXT ? OBJECT_KEY : ARRAY_VALUE;
          continue;
        default:
          ++parent->size;
          frame->state = frame->state == OBJECT_VALUE ? OBJECT_NEXT : ARRAY_NEXT;
          break;
      }
    } else if (parsed.count) {
      if (position != length) return false;
      *doc = parsed;
      return true;
    }
    if (position == length || parsed.count >= capacity) return false;
    uint16_t index = parsed.count++;
    JsonToken *token = &tokens[index];
    *token = (JsonToken){0};
    token->start = (uint16_t)position;
    token->next = parsed.count;
    char c = text[position];
    if (c == '{' || c == '[') {
      if (depth == JSON_MAX_DEPTH) return false;
      token->type = c == '{' ? JSON_OBJECT : JSON_ARRAY;
      stack[depth++] = (Frame){index, c == '{' ? OBJECT_FIRST_KEY : ARRAY_FIRST_VALUE};
      ++position;
    } else if (c == '"') {
      if (!string_token(text, length, &position, token)) return false;
    } else if (c == '-' || digit(c)) {
      token->type = JSON_NUMBER;
      if (!number_end(text, length, &position)) return false;
      token->end = (uint16_t)position;
    } else {
      const char *literal;
      size_t literal_length;
      if (c == 't') {
        literal = "true";
        literal_length = 4;
        token->type = JSON_TRUE;
      } else if (c == 'f') {
        literal = "false";
        literal_length = 5;
        token->type = JSON_FALSE;
      } else if (c == 'n') {
        literal = "null";
        literal_length = 4;
        token->type = JSON_NULL;
      } else return false;
      if (length - position < literal_length ||
          memcmp(text + position, literal, literal_length) != 0) return false;
      position += literal_length;
      token->end = (uint16_t)position;
    }
  }
}

static const JsonToken *get_token(const JsonDoc *doc, int index) {
  if (!doc || !doc->text || !doc->tokens || index < 0 || index >= doc->count)
    return NULL;
  const JsonToken *token = &doc->tokens[index];
  if (token->start > token->end || token->end > doc->length ||
      token->next <= index || token->next > doc->count) return NULL;
  return token;
}

static size_t utf8(uint32_t value, unsigned char out[4]) {
  if (value <= 0x7f) {
    out[0] = (unsigned char)value;
    return 1;
  }
  if (value <= 0x7ff) {
    out[0] = (unsigned char)(0xc0 | (value >> 6));
    out[1] = (unsigned char)(0x80 | (value & 0x3f));
    return 2;
  }
  if (value <= 0xffff) {
    out[0] = (unsigned char)(0xe0 | (value >> 12));
    out[1] = (unsigned char)(0x80 | ((value >> 6) & 0x3f));
    out[2] = (unsigned char)(0x80 | (value & 0x3f));
    return 3;
  }
  out[0] = (unsigned char)(0xf0 | (value >> 18));
  out[1] = (unsigned char)(0x80 | ((value >> 12) & 0x3f));
  out[2] = (unsigned char)(0x80 | ((value >> 6) & 0x3f));
  out[3] = (unsigned char)(0x80 | (value & 0x3f));
  return 4;
}

bool json_string(const JsonDoc *doc, int index, char *out, size_t out_size) {
  if (!out || !out_size) return false;
  const JsonToken *token = get_token(doc, index);
  size_t written = 0;
  if (token && token->type == JSON_STRING) {
    size_t position = token->start;
    while (position < token->end) {
      uint32_t value;
      unsigned char bytes[4];
      if (!character(doc->text, token->end, &position, &value)) goto fail;
      size_t count = utf8(value, bytes);
      if (count >= out_size - written) goto fail;
      memcpy(out + written, bytes, count);
      written += count;
    }
    out[written] = '\0';
    return true;
  }
fail:
  out[0] = '\0';
  return false;
}

bool json_equal(const JsonDoc *doc, int index, const char *value) {
  const JsonToken *token = get_token(doc, index);
  if (!token || token->type != JSON_STRING || !value) return false;
  size_t position = token->start;
  while (position < token->end) {
    uint32_t codepoint;
    unsigned char bytes[4];
    if (!character(doc->text, token->end, &position, &codepoint)) return false;
    size_t count = utf8(codepoint, bytes);
    for (size_t i = 0; i < count; ++i) {
      if ((unsigned char)*value != bytes[i]) return false;
      ++value;
    }
  }
  return *value == '\0';
}

int json_get(const JsonDoc *doc, int object_index, const char *key) {
  const JsonToken *object = get_token(doc, object_index);
  if (!object || object->type != JSON_OBJECT || !key) return -1;
  int result = -1;
  int index = object_index + 1;
  for (uint16_t i = 0; i < object->size; ++i) {
    const JsonToken *name = get_token(doc, index);
    const JsonToken *value = get_token(doc, index + 1);
    if (!name || name->type != JSON_STRING || !value ||
        name->next != index + 1 || value->next > object->next) return -1;
    if (json_equal(doc, index, key)) {
      if (result != -1) return -1;
      result = index + 1;
    }
    index = value->next;
  }
  return index == object->next ? result : -1;
}

bool json_number(const JsonDoc *doc, int index, double *out) {
  const JsonToken *token = get_token(doc, index);
  if (!token || token->type != JSON_NUMBER || !out) return false;
  size_t position = token->start;
  if (!number_end(doc->text, token->end, &position) || position != token->end)
    return false;
  position = token->start;
  bool negative = doc->text[position] == '-';
  if (negative) ++position;

  /* Keep 19 significant decimal digits, with a bounded exponent. Unlike strtod
   * this has no locale dependence, temporary input buffer or hidden allocation. */
  uint64_t mantissa = 0;
  unsigned significant = 0;
  int exponent = 0;
  bool fraction = false;
  int discarded = -1;
  bool sticky = false;
  while (position < token->end) {
    char c = doc->text[position];
    if (c == 'e' || c == 'E') break;
    ++position;
    if (c == '.') {
      fraction = true;
      continue;
    }
    unsigned d = (unsigned)(c - '0');
    if (significant < 19) {
      if (mantissa || d) {
        mantissa = mantissa * 10 + d;
        ++significant;
      }
      if (fraction) --exponent;
    } else {
      if (!fraction) ++exponent;
      if (discarded < 0) discarded = (int)d;
      else if (d) sticky = true;
    }
  }
  if (discarded > 5 || (discarded == 5 && (sticky || (mantissa & 1))))
    ++mantissa;
  if (position < token->end) {
    ++position;
    bool minus = doc->text[position] == '-';
    if (minus || doc->text[position] == '+') ++position;
    int explicit_exponent = 0;
    while (position < token->end) {
      unsigned d = (unsigned)(doc->text[position++] - '0');
      if (explicit_exponent < 10000) {
        explicit_exponent = explicit_exponent * 10 + (int)d;
        if (explicit_exponent > 10000) explicit_exponent = 10000;
      }
    }
    exponent += minus ? -explicit_exponent : explicit_exponent;
  }
  double result = (double)mantissa;
  if (mantissa) {
    if (exponent > 511) return false;
    if (exponent < -511) result = 0;
    else {
      static const double powers[] = {
        1e-1, 1e-2, 1e-4, 1e-8, 1e-16, 1e-32, 1e-64, 1e-128, 1e-256
      };
      unsigned magnitude = (unsigned)(exponent < 0 ? -exponent : exponent);
      for (unsigned bit = 0; magnitude; ++bit, magnitude >>= 1) {
        if (magnitude & 1) {
          if (exponent < 0) result *= powers[bit];
          else result /= powers[bit];
        }
      }
      if (!(result <= DBL_MAX)) return false;
    }
  }
  *out = negative ? -result : result;
  return true;
}

bool json_bool(const JsonDoc *doc, int index, bool *out) {
  const JsonToken *token = get_token(doc, index);
  if (!token || !out || (token->type != JSON_TRUE && token->type != JSON_FALSE))
    return false;
  *out = token->type == JSON_TRUE;
  return true;
}
