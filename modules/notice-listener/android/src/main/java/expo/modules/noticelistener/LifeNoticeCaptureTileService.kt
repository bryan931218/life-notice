package expo.modules.noticelistener

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

class LifeNoticeCaptureTileService : TileService() {
  private fun candidate() = DetectedStore.get(this).firstOrNull { it.score >= 8 }

  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      label = "擷取行程"
      state = if (candidate() != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    val result = candidate()?.let { QuickCapture.capture(this, it) }
      ?: QuickCaptureResult(false, "目前沒有明確的重要行程可擷取。")
    Toast.makeText(this, result.message, Toast.LENGTH_LONG).show()
    qsTile?.apply {
      state = if (candidate() != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      updateTile()
    }
  }
}
