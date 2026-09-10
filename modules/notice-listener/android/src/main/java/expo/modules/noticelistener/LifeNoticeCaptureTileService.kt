package expo.modules.noticelistener

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

class LifeNoticeCaptureTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    val hasCandidate = DetectedStore.get(this).isNotEmpty()
    qsTile?.apply {
      label = "擷取行程"
      state = if (hasCandidate) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    val item = DetectedStore.get(this).firstOrNull()
    val result = item?.let { QuickCapture.capture(this, it) }
      ?: QuickCaptureResult(false, "沒有可擷取的新通知。")
    Toast.makeText(this, result.message, Toast.LENGTH_LONG).show()
    qsTile?.apply {
      state = if (DetectedStore.get(this@LifeNoticeCaptureTileService).isNotEmpty()) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      updateTile()
    }
  }
}
