import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const resources = {
  'zh-CN': {
    translation: zhCN
  },
  'en-US': {
    translation: enUS
  }
};

i18n
  .use(LanguageDetector) // 自动检测浏览器语言
  .use(initReactI18next) // 将 i18n 实例传递给 react-i18next
  .init({
    resources,
    fallbackLng: 'zh-CN', // 默认语言
    supportedLngs: ['zh-CN', 'en-US'], // 支持的语言
    detection: {
      // 检测顺序：localStorage > navigator
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'], // 缓存用户选择的语言
      lookupLocalStorage: 'i18nextLng', // localStorage 键名
    },
    interpolation: {
      escapeValue: false // React 已经防止 XSS
    }
  });

export default i18n;