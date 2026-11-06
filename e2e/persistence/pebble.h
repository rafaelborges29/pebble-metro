// Minimal platform edge for the production favourites store's fault-injection probe.
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#define PERSIST_DATA_MAX_LENGTH 256
int persist_get_size(uint32_t key);
int persist_read_data(uint32_t key, void *out, size_t length);
int32_t persist_read_int(uint32_t key);
bool persist_exists(uint32_t key);
int persist_write_data(uint32_t key, const void *data, size_t length);
int persist_write_int(uint32_t key, int32_t value);
int persist_delete(uint32_t key);
