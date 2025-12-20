import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageTransition from '../components/PageTransition';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';

function UserCode() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/submissions`, { params: { limit: 200 } });
        const data = Array.isArray(res.data) ? res.data : [];
        setItems(data);
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase().replace(/\s+/g, '');
    const base = 'px-2 py-1 rounded text-sm';
    if (s === 'accepted') return base + ' bg-green-100 text-green-700';
    if (s === 'pending' || s === 'submitted') return base + ' bg-yellow-100 text-yellow-700';
    return base + ' bg-red-100 text-red-700';
  };

  return (
    <PageTransition>
      <div>
        <h2 className="text-2xl font-bold text-primary dark:text-blue-400 mb-4">{t('user.code.title')}</h2>
        <div className="bg-white dark:bg-gray-800 rounded shadow border dark:border-gray-700 transition-colors duration-200">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300">
                <th className="px-4 py-2 text-left">{t('user.code.columns.time')}</th>
                <th className="px-4 py-2 text-left">{t('user.code.columns.problemId')}</th>
                <th className="px-4 py-2 text-left">{t('user.code.columns.language')}</th>
                <th className="px-4 py-2 text-left">{t('user.code.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(s => (
                <tr key={s.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">{s.problemId}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">{s.language}</td>
                  <td className="px-4 py-2"><span className={getStatusBadge(s.status)}>{s.status}</span></td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">{t('user.code.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-center text-gray-500 dark:text-gray-400">{t('common.loading')}</div>}
        </div>
      </div>
    </PageTransition>
  );
}

export default UserCode;
