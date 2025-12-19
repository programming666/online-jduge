import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';

function AdminProblemList({ embedded = false }) {
  const { t } = useTranslation();

  const [problems, setProblems] = useState([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const fetchProblems = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search) params.search = search;
      if (difficulty) params.difficulty = difficulty;
      const res = await axios.get(`${API_URL}/problems/admin`, { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setProblems(data);
      } else {
        setProblems([]);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, [difficulty]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProblems();
  };

  const handleToggleVisibility = async (id, currentVisible) => {
    const nextVisible = !currentVisible;
    const confirmText = nextVisible ? '确认将题目设为公开？' : '确认将题目设为隐藏？';
    if (!window.confirm(confirmText)) return;

    setTogglingId(id);
    setError('');
    try {
      await axios.patch(`${API_URL}/problems/${id}/visibility`, { visible: nextVisible });
      setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, visible: nextVisible } : p)));
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update visibility');
    } finally {
      setTogglingId(null);
    }
  };

  const getDifficultyColor = (diff) => {
    switch (diff) {
      case 'LEVEL1': return 'text-red-600 bg-red-100';
      case 'LEVEL2': return 'text-orange-600 bg-orange-100';
      case 'LEVEL3': return 'text-yellow-600 bg-yellow-100';
      case 'LEVEL4': return 'text-green-600 bg-green-100';
      case 'LEVEL5': return 'text-blue-600 bg-blue-100';
      case 'LEVEL6': return 'text-purple-600 bg-purple-100';
      case 'LEVEL7': return 'text-gray-900 bg-gray-200';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div>
      {!embedded && (
        <h2 className="text-3xl font-bold mb-6 text-primary border-b-4 border-secondary inline-block pb-1">
          {t('admin.menu.problems')}
        </h2>
      )}

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('problem.list.searchPlaceholder')}
            className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark transition-colors"
          >
            {t('common.search')}
          </button>
        </form>

        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none"
        >
          <option value="">{t('problem.list.allDifficulties')}</option>
          <option value="LEVEL1">{t('problem.difficulty.LEVEL1')}</option>
          <option value="LEVEL2">{t('problem.difficulty.LEVEL2')}</option>
          <option value="LEVEL3">{t('problem.difficulty.LEVEL3')}</option>
          <option value="LEVEL4">{t('problem.difficulty.LEVEL4')}</option>
          <option value="LEVEL5">{t('problem.difficulty.LEVEL5')}</option>
          <option value="LEVEL6">{t('problem.difficulty.LEVEL6')}</option>
          <option value="LEVEL7">{t('problem.difficulty.LEVEL7')}</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      )}

      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : (
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                  {t('problem.list.id')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t('problem.list.problemTitle')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  {t('problem.list.difficulty')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  可见性
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => (
                <tr key={problem.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-5 py-5 border-b border-gray-200 text-sm">
                    {problem.id}
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 text-sm font-medium text-primary">
                    <Link to={`/problem/${problem.id}`} className="hover:underline block">
                      {problem.title}
                    </Link>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(problem.difficulty)}`}
                    >
                      {t(`problem.difficulty.${problem.difficulty || 'LEVEL2'}`)}
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        problem.visible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {problem.visible ? '公开' : '隐藏'}
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 text-sm text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(problem.id, problem.visible)}
                      disabled={togglingId === problem.id}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      {problem.visible ? '设为隐藏' : '设为公开'}
                    </button>
                    <Link
                      to={`/admin/edit/${problem.id}`}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50"
                    >
                      {t('common.edit')}
                    </Link>
                  </td>
                </tr>
              ))}
              {problems.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="px-5 py-5 text-center text-gray-500">
                    {t('problem.list.noProblems')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminProblemList;

