package expo.modules.noticelistener

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class AppFilterActivity : Activity() {
  private val checks = linkedMapOf<String, Pair<String, CheckBox>>()
  private lateinit var countText: TextView
  private lateinit var permissionButton: Button

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    title = "監聽的應用程式"
    window.statusBarColor = Color.WHITE
    window.navigationBarColor = Color.WHITE
    buildUi()
  }

  override fun onResume() {
    super.onResume()
    if (::permissionButton.isInitialized) updatePermissionButton()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun listenerPermissionEnabled(): Boolean {
    val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
    val expected = ComponentName(this, LifeNoticeListenerService::class.java)
    return flat.split(":").mapNotNull(ComponentName::unflattenFromString).any { it == expected }
  }

  private fun buildUi() {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(18), dp(20), dp(14))
      setBackgroundColor(Color.rgb(248, 250, 249))
    }

    root.addView(TextView(this).apply {
      text = "監聽的應用程式"
      textSize = 26f
      setTextColor(Color.rgb(20, 55, 49))
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    })
    root.addView(TextView(this).apply {
      text = "只有勾選的 App 會讀取通知內容。未勾選的通知不會分析、儲存或送給 AI。"
      textSize = 14f
      setTextColor(Color.rgb(100, 118, 113))
      setPadding(0, dp(6), 0, dp(14))
    })

    permissionButton = Button(this).apply {
      setOnClickListener {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
      }
    }
    updatePermissionButton()
    root.addView(permissionButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)))

    val search = EditText(this).apply {
      hint = "搜尋 App"
      isSingleLine = true
      setPadding(dp(14), 0, dp(14), 0)
      setBackgroundColor(Color.WHITE)
    }
    val searchParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply {
      topMargin = dp(14)
    }
    root.addView(search, searchParams)

    countText = TextView(this).apply {
      textSize = 14f
      setTextColor(Color.rgb(76, 100, 94))
      setPadding(0, dp(14), 0, dp(8))
    }
    root.addView(countText)

    val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val selected = AppMonitorStore.selected(this)
    val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    @Suppress("DEPRECATION")
    val apps = packageManager.queryIntentActivities(launcherIntent, 0)
      .mapNotNull { info ->
        val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
        if (pkg == packageName) return@mapNotNull null
        val label = info.loadLabel(packageManager)?.toString()?.trim().orEmpty().ifBlank { pkg }
        Triple(pkg, label, info)
      }
      .distinctBy { it.first }
      .sortedBy { it.second.lowercase() }

    apps.forEach { (pkg, label, _) ->
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(4), dp(8), dp(4), dp(8))
      }
      val check = CheckBox(this).apply {
        text = label
        textSize = 16f
        setTextColor(Color.rgb(20, 55, 49))
        isChecked = pkg in selected
        setOnCheckedChangeListener { _, _ -> updateCount() }
      }
      val packageText = TextView(this).apply {
        text = pkg
        textSize = 11f
        setTextColor(Color.rgb(130, 145, 141))
        setPadding(dp(48), 0, 0, 0)
      }
      row.addView(check, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(42)))
      row.addView(packageText)
      list.addView(row)
      checks[pkg] = label to check
    }

    search.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        val q = s?.toString()?.trim()?.lowercase().orEmpty()
        for (i in 0 until list.childCount) {
          val row = list.getChildAt(i)
          val check = (row as? LinearLayout)?.getChildAt(0) as? CheckBox ?: continue
          val pkg = checks.entries.firstOrNull { it.value.second === check }?.key.orEmpty()
          val label = check.text?.toString()?.lowercase().orEmpty()
          row.visibility = if (q.isBlank() || label.contains(q) || pkg.lowercase().contains(q)) View.VISIBLE else View.GONE
        }
      }
      override fun afterTextChanged(s: Editable?) = Unit
    })

    val scroll = ScrollView(this).apply {
      setBackgroundColor(Color.WHITE)
      addView(list)
    }
    root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    val save = Button(this).apply {
      text = "儲存"
      textSize = 16f
      setOnClickListener {
        val chosen = checks.filterValues { it.second.isChecked }.keys.toSet()
        AppMonitorStore.save(this@AppFilterActivity, chosen)
        Toast.makeText(
          this@AppFilterActivity,
          if (chosen.isEmpty()) "未選任何 App，將不監聽通知" else "已選擇 ${chosen.size} 個 App",
          Toast.LENGTH_SHORT
        ).show()
        finish()
      }
    }
    val saveParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply {
      topMargin = dp(12)
      gravity = Gravity.CENTER_HORIZONTAL
    }
    root.addView(save, saveParams)

    setContentView(root)
    updateCount()
  }

  private fun updateCount() {
    if (!::countText.isInitialized) return
    val count = checks.values.count { it.second.isChecked }
    countText.text = if (count == 0) "尚未選擇任何 App" else "已選擇 $count 個 App"
  }

  private fun updatePermissionButton() {
    val enabled = listenerPermissionEnabled()
    permissionButton.text = if (enabled) "通知存取已開啟" else "開啟通知存取"
    permissionButton.isEnabled = !enabled
  }
}
