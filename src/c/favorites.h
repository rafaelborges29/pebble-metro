#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define MAX_FAVORITES 16
#define FORMAT 1
#define KEY_SELECTED 1

typedef struct { char station[49], line[49], direction[49]; uint8_t version; } Favorite;
typedef enum { FAVORITES_SAVED, FAVORITES_FAILED, FAVORITES_UNKNOWN } FavoriteSave;

bool favorite_id_valid(const char *id, size_t capacity);
bool favorite_valid(const Favorite *favorite);
bool favorite_equal(const Favorite *a, const Favorite *b);
// Missing bank commits load the existing legacy slots without rewriting them.
bool favorites_load(Favorite favorites[MAX_FAVORITES]);
bool favorites_writable(void);
FavoriteSave favorites_save(const Favorite favorites[MAX_FAVORITES]);
