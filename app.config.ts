import type { ExpoConfig } from 'expo/config';

const appId = process.env.APP_IDENTIFIER || 'com.bryan931218.lifenotice';
const supportEmail = process.env.SUPPORT_EMAIL || '';
const privacyUrl = process.env.PRIVACY_URL || '';

const config: ExpoConfig = {
  name: '生活通知管家',
  slug: 'life-notice',
  version: '1.5.0',
  orientation: 'default',
  userInterfaceStyle: 'light',
  scheme: 'lifenotice',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: appId,
    buildNumber: '6',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleLocalizations: ['zh-Hant', 'en'],
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [],
    },
  },
  android: {
    package: appId,
    permissions: ['android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR'],
    versionCode: 6,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0E7059',
      monochromeImage: './assets/notification-icon.png',
    },
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
    ],
  },
  plugins: [
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#0E7059' }],
    [
      'expo-image-picker',
      {
        photosPermission: '選擇要整理的通知截圖。',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    'expo-document-picker',
    'expo-secure-store',
    ['expo-splash-screen', { image: './assets/icon.png', imageWidth: 100, backgroundColor: '#F7FAF9' }],
  ],
  extra: {
    supportEmail,
    privacyUrl,
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
  web: { favicon: './assets/icon.png' },
};

export default config;
