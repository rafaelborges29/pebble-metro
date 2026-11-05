#include <pebble.h>
#include <string.h>
#include "localization.h"
#include "ui_tables.h"

const char *localization_get(UiKey key) {
  if ((unsigned)key >= UI_KEY_COUNT) return "";
  // Re-read instead of caching: Pebble can change locale while the app is open.
  const char *locale = i18n_get_system_locale();
  for (size_t i = 0; locale && i < ARRAY_LENGTH(s_ui_locales); i++)
    if (!strcmp(locale, s_ui_locales[i].locale)) return s_ui_locales[i].strings[key];
  return s_ui_fallback[key];
}

const char *localization_diagnostic(const char *diagnostic) {
  static const struct { const char *diagnostic; UiKey key; } errors[] = {
    { "Feed unavailable", UI_ERROR_FEED_UNAVAILABLE },
    { "Subscription failed", UI_ERROR_SUBSCRIPTION_FAILED },
    { "Feed disconnected", UI_ERROR_FEED_DISCONNECTED },
    { "MQTT connection failed", UI_ERROR_MQTT_CONNECTION },
    { "MQTT unavailable", UI_ERROR_MQTT_UNAVAILABLE },
    { "Unsubscribe failed", UI_ERROR_UNSUBSCRIBE_FAILED },
    { "Station metadata unavailable", UI_ERROR_STATION_METADATA },
  };
  if (!diagnostic) return "";
  for (size_t i = 0; i < ARRAY_LENGTH(errors); i++)
    if (!strcmp(diagnostic, errors[i].diagnostic)) return localization_get(errors[i].key);
  return diagnostic;
}
