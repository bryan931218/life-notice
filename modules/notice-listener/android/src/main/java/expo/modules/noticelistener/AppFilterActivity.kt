package expo.modules.noticelistener

import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.*

class AppFilterActivity:Activity(){
 private val green=Color.rgb(14,112,89)
 private val ink=Color.rgb(23,51,47)
 private val muted=Color.rgb(107,126,121)
 private val selected=linkedSetOf<String>()
 private var original=setOf<String>()
 private var onlySelected=false
 private var query=""
 private var loading=true
 private lateinit var list:LinearLayout
 private lateinit var count:TextView
 private lateinit var status:TextView
 private lateinit var save:Button
 private lateinit var filter:Button
 private data class App(val pkg:String,val label:String,val icon:android.graphics.drawable.Drawable?)
 private var apps=listOf<App>()
 private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
 private fun shape(color:Int,radius:Int=14)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat()}
 private fun text(value:String,size:Float=15f,color:Int=ink)=TextView(this).apply{text=value;textSize=size;setTextColor(color)}
 private fun button(value:String,primary:Boolean=false)=Button(this).apply{text=value;isAllCaps=false;textSize=14f;setTextColor(if(primary)Color.WHITE else green);background=shape(if(primary)green else Color.rgb(232,246,240));stateListAnimator=null;elevation=0f;minHeight=dp(48)}
 private fun permitted():Boolean {
  val expected=ComponentName(this,LifeNoticeListenerService::class.java)
  return (Settings.Secure.getString(contentResolver,"enabled_notification_listeners")?:"").split(":").mapNotNull(ComponentName::unflattenFromString).any{it==expected}
 }
 override fun onCreate(state:Bundle?){
  super.onCreate(state);original=AppMonitorStore.selected(this);selected.addAll(state?.getStringArrayList("selection")?:original)
  if(android.os.Build.VERSION.SDK_INT>=33)onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT){leave()}
  @Suppress("DEPRECATION") window.decorView.systemUiVisibility=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
  onlySelected=state?.getBoolean("filter")?:false;query=state?.getString("query")?:""
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(248,250,249));setPadding(dp(20),dp(12),dp(20),dp(12))}
  root.setOnApplyWindowInsetsListener { view,insets ->
   @Suppress("DEPRECATION") view.setPadding(dp(20),dp(12)+insets.systemWindowInsetTop,dp(20),dp(12)+insets.systemWindowInsetBottom)
   insets
  }
  val header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  header.addView(button("返回").apply{contentDescription="返回設定";setOnClickListener{leave()}},LinearLayout.LayoutParams(dp(72),dp(48)))
  header.addView(text("監聽的 App",23f).apply{setTypeface(typeface,Typeface.BOLD);setPadding(dp(12),0,0,0)})
  root.addView(header)
  root.addView(text("選擇通知來源，再儲存。未選取的 App 不會分析。",13f,muted).apply{setPadding(0,dp(12),0,dp(16))})
  val statusCard=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=shape(Color.WHITE);setPadding(dp(16),dp(12),dp(16),dp(12))}
  status=text("");statusCard.addView(status)
  statusCard.addView(button("管理通知存取").apply{setOnClickListener{startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))}})
  root.addView(statusCard)
  val search=EditText(this).apply{hint="搜尋 App 名稱";isSingleLine=true;textSize=16f;background=shape(Color.WHITE);setPadding(dp(14),0,dp(14),0);setText(query);contentDescription="搜尋 App 名稱"}
  root.addView(search,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(14)})
  val toolbar=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  count=text("載入應用程式…",13f,muted);toolbar.addView(count,LinearLayout.LayoutParams(0,dp(48),1f))
  filter=button(if(onlySelected)"顯示全部" else "只看已選").apply{setOnClickListener{onlySelected=!onlySelected;text=if(onlySelected)"顯示全部" else "只看已選";render()}}
  toolbar.addView(filter,LinearLayout.LayoutParams(dp(112),dp(48)));root.addView(toolbar)
  list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  root.addView(ScrollView(this).apply{addView(list)},LinearLayout.LayoutParams(-1,0,1f))
  save=button("儲存選擇",true).apply{isEnabled=false;setOnClickListener{
   AppMonitorStore.save(this@AppFilterActivity,selected);original=selected.toSet()
   Toast.makeText(this@AppFilterActivity,if(selected.isEmpty())"已停用所有 App 的監聽" else "已儲存，監聽 ${selected.size} 個 App",Toast.LENGTH_LONG).show();finish()
  }}
  root.addView(save,LinearLayout.LayoutParams(-1,dp(54)).apply{topMargin=dp(8)})
  root.addView(text("設定通知存取不會自動儲存上方選擇。",12f,muted).apply{gravity=Gravity.CENTER;setPadding(0,dp(6),0,0)})
  setContentView(root);root.requestApplyInsets()
  search.addTextChangedListener(object:TextWatcher{
   override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
   override fun afterTextChanged(s:Editable?){}
   override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){query=s.toString();render()}
  })
  Thread {
   try {
    @Suppress("DEPRECATION") val installed=packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
    val result=installed.mapNotNull{info->val pkg=info.activityInfo?.packageName?:return@mapNotNull null;if(pkg==packageName)return@mapNotNull null;App(pkg,info.loadLabel(packageManager).toString(),try{info.loadIcon(packageManager)}catch(e:Exception){null})}.distinctBy{it.pkg}.toMutableList()
    for(pkg in original)if(result.none{it.pkg==pkg}){
     @Suppress("DEPRECATION") val label=try{packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg,0)).toString()}catch(e:Exception){"已移除的 App"}
     result.add(App(pkg,label,null))
    }
    runOnUiThread{if(!isFinishing&&!isDestroyed){apps=result.sortedWith(compareByDescending<App>{it.pkg in selected}.thenBy{it.label.lowercase()});loading=false;save.isEnabled=true;render()}}
   }catch(e:Exception){runOnUiThread{if(!isFinishing&&!isDestroyed)count.text="無法載入 App，請返回後重試。"}}
  }.start()
 }
 override fun onResume(){super.onResume();if(::status.isInitialized){status.text=if(permitted())"● 通知存取已開啟" else "○ 尚未授權，選取後仍不會收到通知";status.setTextColor(if(permitted())green else muted)}}
 override fun onSaveInstanceState(out:Bundle){out.putStringArrayList("selection",ArrayList(selected));out.putBoolean("filter",onlySelected);out.putString("query",query);super.onSaveInstanceState(out)}
 private fun render(){
  if(!::list.isInitialized||loading)return
  list.removeAllViews();val visible=apps.filter{(!onlySelected||it.pkg in selected)&&(query.isBlank()||it.label.contains(query,true)||it.pkg.contains(query,true))}
  count.text="已選 ${selected.size} 個 · 顯示 ${visible.size} 個"
  save.text=if(selected==original)"儲存選擇" else "儲存變更（${selected.size} 個）"
  if(visible.isEmpty()){list.addView(text(if(query.isNotBlank())"找不到符合的 App" else "尚未選擇 App",16f,muted).apply{setPadding(dp(12),dp(36),0,0)});return}
  for(app in visible){
   val row=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;background=shape(Color.WHITE);setPadding(dp(12),dp(12),dp(8),dp(12))}
   row.addView(ImageView(this).apply{setImageDrawable(app.icon);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(40),dp(40)))
   val labels=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),0,dp(8),0)}
   labels.addView(text(app.label,16f).apply{maxLines=2;setTypeface(typeface,Typeface.BOLD)})
   val hint=text(if(app.pkg in selected)"已選取" else "不監聽",12f,muted);labels.addView(hint)
   row.addView(labels,LinearLayout.LayoutParams(0,-2,1f))
   val check=CheckBox(this).apply{isChecked=app.pkg in selected;buttonTintList=ColorStateList.valueOf(green);contentDescription="監聽 "+app.label;setOnCheckedChangeListener{_,checked->
    if(checked)selected.add(app.pkg) else selected.remove(app.pkg)
    hint.text=if(checked)"已選取" else "不監聽";count.text="已選 ${selected.size} 個 · 顯示 ${visible.size} 個";save.text="儲存變更（${selected.size} 個）"
    if(onlySelected&&!checked)render()
   }}
   row.addView(check,LinearLayout.LayoutParams(dp(48),dp(48)));row.setOnClickListener{check.isChecked=!check.isChecked}
   list.addView(row,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
  }
 }
 private fun leave(){if(selected==original)finish() else AlertDialog.Builder(this).setTitle("尚未儲存").setMessage("要放棄這次選擇嗎？").setNegativeButton("繼續編輯",null).setPositiveButton("放棄變更"){_,_->finish()}.show()}
 @Deprecated("Back navigation") override fun onBackPressed(){leave()}
}
