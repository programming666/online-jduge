import axios from 'axios';
import i18n from '../i18n';

// 配置 axios 拦截器，在所有请求中添加 Accept-Language 头
axios.interceptors.request.use(
  (config) => {
    // 获取当前语言设置
    const language = i18n.language || 'zh-CN';
    
    // 添加 Accept-Language 头
    config.headers['Accept-Language'] = language;
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axios;