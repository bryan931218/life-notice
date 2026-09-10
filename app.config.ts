import type {ExpoConfig} from 'expo/config';
const appId=process.env.APP_IDENTIFIER||'com.bryan931218.lifenotice';
const config:ExpoConfig={
 name:'生活通知管家',slug:'life-notice',version:'1.0.0',orientation:'default',scheme:'lifenotice',
 icon:'./assets/icon.png',
 ios:{supportsTablet:true,bundleIdentifier:appId,buildNumber:'1',infoPlist:{ITSAppUsesNonExemptEncryption:false,CFBundleLocalizations:['zh-Hant','en']},privacyManifests:{NSPrivacyTracking:false,NSPrivacyCollectedDataTypes:[],NSPrivacyAccessedAPITypes:[]}},
 android:{package:appId,versionCode:1,allowBackup:false,adaptiveIcon:{foregroundImage:'./assets/icon.png',backgroundColor:'#126953',monochromeImage:'./assets/notification-icon.png'},blockedPermissions:['android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO','android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE','android.permission.RECORD_AUDIO','android.permission.CAMERA']},
 plugins:[['expo-notifications',{icon:'./assets/notification-icon.png',color:'#126953'}],['expo-image-picker',{photosPermission:'選擇你想整理的通知截圖，供本機辨識與保存原文。',cameraPermission:false,microphonePermission:false}],'expo-document-picker',['expo-splash-screen',{image:'./assets/icon.png',imageWidth:100,backgroundColor:'#F3F6F5'}]],
 extra:{supportEmail:process.env.SUPPORT_EMAIL||'',privacyUrl:process.env.PRIVACY_URL||'',...(process.env.EAS_PROJECT_ID?{eas:{projectId:process.env.EAS_PROJECT_ID}}:{})},
 web:{favicon:'./assets/icon.png'},
};
export default config;
