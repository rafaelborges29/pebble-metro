#pragma once

#include "ui_keys.h"

// Resolve against the watch's current locale, with the configured fallback.
const char *localization_get(UiKey key);

// Known companion diagnostics use UI keys; unknown text remains verbatim.
const char *localization_diagnostic(const char *diagnostic);
