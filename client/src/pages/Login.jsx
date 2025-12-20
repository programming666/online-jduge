import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import TurnstileWidget from '../components/TurnstileWidget';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [cfToken, setCfToken] = useState('');
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/turnstile`);
        setTurnstileEnabled(!!res.data.enabled);
        const key = res.data.siteKey || import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '';
        setSiteKey(key);
      } catch (_) {}
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/auth/login`, { username, password, cfToken: cfToken });
      login(response.data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('auth.login.loginFailed'));
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900 dark:text-white">{t('auth.login.title')}</h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200">{t('auth.login.username')}</label>
            <div className="mt-2">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 p-2 dark:bg-gray-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200">{t('auth.login.password')}</label>
            <div className="mt-2">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 p-2 dark:bg-gray-700"
              />
            </div>
          </div>

          {turnstileEnabled && siteKey && (
            <div className="mt-2">
              <TurnstileWidget siteKey={siteKey} onToken={setCfToken} />
            </div>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div>
            <button
              type="submit"
              className="flex w-full justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t('auth.login.signIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
