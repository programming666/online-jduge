import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

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
      case 'LEVEL1': return 'text-red-600 bg-red-100 dark:text-red-200 dark:bg-red-900/30';
      case 'LEVEL2': return 'text-orange-600 bg-orange-100 dark:text-orange-200 dark:bg-orange-900/30';
      case 'LEVEL3': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-200 dark:bg-yellow-900/30';
      case 'LEVEL4': return 'text-green-600 bg-green-100 dark:text-green-200 dark:bg-green-900/30';
      case 'LEVEL5': return 'text-blue-600 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/30';
      case 'LEVEL6': return 'text-purple-600 bg-purple-100 dark:text-purple-200 dark:bg-purple-900/30';
      case 'LEVEL7': return 'text-gray-900 bg-gray-200 dark:text-gray-200 dark:bg-gray-700';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  return (
    <div>
      {!embedded && (
        <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white flex items-center gap-3">
          <span className="w-1.5 h-8 bg-primary rounded-full"></span>
          {t('admin.menu.problems')}
        </h2>
      )}

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('problem.list.searchPlaceholder')}
              fullWidth
            />
          </div>
          <Button type="submit">
            {t('common.search')}
          </Button>
        </form>

        <div className="w-full md:w-48">
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            fullWidth
            options={[
              { value: '', label: t('problem.list.allDifficulties') },
              { value: 'LEVEL1', label: t('problem.difficulty.LEVEL1') },
              { value: 'LEVEL2', label: t('problem.difficulty.LEVEL2') },
              { value: 'LEVEL3', label: t('problem.difficulty.LEVEL3') },
              { value: 'LEVEL4', label: t('problem.difficulty.LEVEL4') },
              { value: 'LEVEL5', label: t('problem.difficulty.LEVEL5') },
              { value: 'LEVEL6', label: t('problem.difficulty.LEVEL6') },
              { value: 'LEVEL7', label: t('problem.difficulty.LEVEL7') },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <Card className="overflow-hidden border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
        ) : (
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20">
                  {t('problem.list.id')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  {t('problem.list.problemTitle')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-32">
                  {t('problem.list.difficulty')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-32">
                  可见性
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-40">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => (
                <tr key={problem.id} className="hover:bg-yellow-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-200">
                    {problem.id}
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-primary dark:text-blue-400">
                    <Link to={`/problem/${problem.id}`} className="hover:underline block">
                      {problem.title}
                    </Link>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(problem.difficulty)}`}
                    >
                      {t(`problem.difficulty.${problem.difficulty || 'LEVEL2'}`)}
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        problem.visible ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {problem.visible ? '公开' : '隐藏'}
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleVisibility(problem.id, problem.visible)}
                      disabled={togglingId === problem.id}
                    >
                      {problem.visible ? '设为隐藏' : '设为公开'}
                    </Button>
                    <Link
                      to={`/admin/edit/${problem.id}`}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {t('common.edit')}
                    </Link>
                  </td>
                </tr>
              ))}
              {problems.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="px-5 py-5 text-center text-gray-500 dark:text-gray-400">
                    {t('problem.list.noProblems')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default AdminProblemList;

