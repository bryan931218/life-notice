package expo.modules.noticelistener

import android.content.Context

internal object AppMonitorStore {
  private const val PREF = "life_notice_listener_v1"
  private const val SELECTED = "monitored_packages_v1"
  private const val CONFIGURED = "monitored_packages_configured_v1"

  private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

  fun selected(context: Context): Set<String> =
    prefs(context).getStringSet(SELECTED, emptySet())?.toSet() ?: emptySet()

  fun isConfigured(context: Context): Boolean = prefs(context).getBoolean(CONFIGURED, false)

  fun isAllowed(context: Context, packageName: String): Boolean =
    isConfigured(context) && packageName in selected(context)

  @Synchronized
  fun save(context: Context, packages: Set<String>) {
    val safe = packages.filter { it.isNotBlank() && it != context.packageName }.toSet()
    prefs(context).edit()
      .putStringSet(SELECTED, safe)
      .putBoolean(CONFIGURED, true)
      .apply()

    // Anything already queued from an app that is no longer selected is removed
    // immediately. Unselected notification content is never sent to JS or AI.
    val removeIds = DetectedStore.get(context)
      .filter { it.packageName !in safe }
      .map { it.id }
      .toSet()
    if (removeIds.isNotEmpty()) DetectedStore.remove(context, removeIds)
  }
}
