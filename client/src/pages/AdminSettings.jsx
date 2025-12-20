import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import MarkdownEditorWithPreview from '../components/MarkdownEditorWithPreview';
import TurnstileWidget from '../components/TurnstileWidget';

const API_URL = '/api';

function AdminSettings({ embedded = false }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [homeContent, setHomeContent] = useState('');
  const [footerContent, setFooterContent] = useState('');
  const [rateLimit, setRateLimit] = useState(3);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [homeMessage, setHomeMessage] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [rateLimitMessage, setRateLimitMessage] = useState('');
  const [turnEnabled, setTurnEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [turnMessage, setTurnMessage] = useState('');
  const [turnError, setTurnError] = useState('');
  const [cfToken, setCfToken] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [regRes, homeRes, footerRes, rateLimitRes, turnRes] = await Promise.all([
          axios.get(`${API_URL}/settings/registration`),
          axios.get(`${API_URL}/settings/homepage`),
          axios.get(`${API_URL}/settings/footer`),
          axios.get(`${API_URL}/settings/rate-limit`),
          axios.get(`${API_URL}/settings/turnstile`),
        ]);
        setEnabled(!!regRes.data.enabled);
        setHomeContent(homeRes.data.content || '');
        setFooterContent(footerRes.data.content || '');
        setRateLimit(rateLimitRes.data.limit || 3);
        setTurnEnabled(!!turnRes.data.enabled);
        setSiteKey(turnRes.data.siteKey || '');
        setSecretConfigured(!!turnRes.data.secretConfigured);
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleToggle = async () => {
    const next = !enabled;
    if (!window.confirm(next ? t('settings.registration.enableConfirm') : t('settings.registration.disableConfirm')))
      return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await axios.put(`${API_URL}/settings/registration`, { enabled: next });
      setEnabled(!!res.data.enabled);
      setMessage(t('settings.registration.updateSuccess'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.registration.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHomeContent = async () => {
    setSaving(true);
    setError('');
    setHomeMessage('');
    try {
      await axios.put(`${API_URL}/settings/homepage`, { content: homeContent });
      setHomeMessage(t('settings.homepage.updateSuccess'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.homepage.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFooterContent = async () => {
    setSaving(true);
    setError('');
    setFooterMessage('');
    try {
      await axios.put(`${API_URL}/settings/footer`, { content: footerContent });
      setFooterMessage(t('settings.footer.updateSuccess'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.footer.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRateLimit = async () => {
    setSaving(true);
    setError('');
    setRateLimitMessage('');
    try {
      await axios.put(`${API_URL}/settings/rate-limit`, { limit: parseInt(rateLimit, 10) });
      setRateLimitMessage(t('settings.rateLimit.updateSuccess'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.rateLimit.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTurnstile = async () => {
    setSaving(true);
    setTurnError('');
    setTurnMessage('');
    try {
      const res = await axios.put(`${API_URL}/settings/turnstile`, { enabled: turnEnabled, siteKey });
      setTurnEnabled(!!res.data.enabled);
      setSiteKey(res.data.siteKey || '');
      setTurnMessage('Turnstile 配置已更新');
    } catch (e) {
      setTurnError(e.response?.data?.error || 'Turnstile 配置更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyTurnstile = async () => {
    if (!cfToken) {
      setTurnError('请先完成页面人机验证');
      return;
    }
    setSaving(true);
    setTurnError('');
    setTurnMessage('');
    try {
      const res = await axios.post(`${API_URL}/settings/turnstile/verify`, { response: cfToken });
      if (res.data?.success) {
        setTurnMessage('验证成功：密钥配置有效');
      } else {
        const errs = Array.isArray(res.data?.errors) ? res.data.errors.join(', ') : '';
        setTurnError(errs || '验证失败');
      }
    } catch (e) {
      setTurnError(e.response?.data?.error || '验证失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center dark:text-gray-300">{t('common.loading')}</div>;
  }

  return (
    <div className={embedded ? '' : 'max-w-3xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700 transition-colors duration-200'}>
      {!embedded && (
        <h2 className="text-2xl font-bold text-primary dark:text-blue-400 mb-4">{t('settings.title')}</h2>
      )}

      {/* Registration Toggle */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('settings.registration.title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.registration.description')}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggle}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {enabled ? t('settings.registration.enabled') : t('settings.registration.disabled')}
            </span>
          </div>
        </div>

        {message && <div className="mt-3 text-sm text-green-600 dark:text-green-400">{message}</div>}
      </section>

      <hr className="my-8 border-gray-200 dark:border-gray-700" />

      {/* Turnstile Settings */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Turnstile 人机验证</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">配置 Cloudflare Turnstile 站点密钥（前端）并切换启用状态。服务端密钥需在环境变量中配置。</p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTurnEnabled(!turnEnabled)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                turnEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  turnEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {turnEnabled ? '已启用' : '未启用'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">站点密钥（site key）:</label>
            <input
              type="text"
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例如：0x4AAAAAAAA..."
            />
            <button
              type="button"
              onClick={handleSaveTurnstile}
              disabled={saving}
              className="px-4 py-2 bg-primary dark:bg-blue-600 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            服务端密钥配置状态：{secretConfigured ? '已配置' : '未配置（请在环境变量 CLOUDFLARE_TURNSTILE_SECRET_KEY 中设置）'}
          </div>

          {siteKey && secretConfigured && (
            <div className="space-y-3">
              <div className="mt-2">
                <TurnstileWidget siteKey={siteKey} onToken={setCfToken} />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleVerifyTurnstile}
                  disabled={saving}
                  className="px-4 py-2 bg-primary dark:bg-blue-600 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
                >
                  {saving ? '验证中…' : '验证配置'}
                </button>
              </div>
            </div>
          )}

          {turnMessage && <div className="mt-3 text-sm text-green-600 dark:text-green-400">{turnMessage}</div>}
          {turnError && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{turnError}</div>}
        </div>
      </section>

      {/* Rate Limit */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('settings.rateLimit.title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.rateLimit.description')}</p>

        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('settings.rateLimit.label')}:
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={handleSaveRateLimit}
            disabled={saving}
            className="px-4 py-2 bg-primary dark:bg-blue-600 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>

        {rateLimitMessage && <div className="mt-3 text-sm text-green-600 dark:text-green-400">{rateLimitMessage}</div>}
      </section>

      <hr className="my-8 border-gray-200 dark:border-gray-700" />

      {/* Homepage Content */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('settings.homepage.title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.homepage.description')}</p>

        <div className="space-y-4">
          <MarkdownEditorWithPreview
            value={homeContent}
            onChange={setHomeContent}
            storageKey="admin:homepage"
            placeholder={t('settings.homepage.placeholder')}
            rows={12}
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveHomeContent}
              disabled={saving}
              className="px-6 py-2 bg-primary dark:bg-blue-600 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>

        {homeMessage && <div className="mt-3 text-sm text-green-600 dark:text-green-400">{homeMessage}</div>}
      </section>

      <hr className="my-8 border-gray-200 dark:border-gray-700" />

      {/* Footer Content */}
      <section>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('settings.footer.title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.footer.description')}</p>

        <div className="space-y-4">
          <MarkdownEditorWithPreview
            value={footerContent}
            onChange={setFooterContent}
            storageKey="admin:footer"
            placeholder={t('settings.footer.placeholder')}
            rows={6}
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveFooterContent}
              disabled={saving}
              className="px-6 py-2 bg-primary dark:bg-blue-600 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>

        {footerMessage && <div className="mt-3 text-sm text-green-600 dark:text-green-400">{footerMessage}</div>}
      </section>

      {error && <div className="mt-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded">{error}</div>}
    </div>
  );
}

export default AdminSettings;

