package expo.modules.noticeocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoticeOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoticeOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_OCR_CONTEXT", "App 尚未準備好，請重新開啟後再試。", null)
        return@AsyncFunction
      }

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (error: Exception) {
        promise.reject("ERR_OCR_IMAGE", "無法讀取這張圖片。", error)
        return@AsyncFunction
      }

      val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
      recognizer.process(image)
        .addOnSuccessListener { result ->
          recognizer.close()
          promise.resolve(result.text)
        }
        .addOnFailureListener { error ->
          recognizer.close()
          promise.reject("ERR_OCR_RECOGNIZE", "截圖文字辨識失敗，請換一張較清楚的圖片。", error)
        }
    }
  }
}
