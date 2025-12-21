import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

const API_URL = '/api';

function ProblemList() {
  const [problems, setProblems] = useState([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(null);
  const { t } = useTranslation();

  const fetchProblems = () => {
    const params = {};
    if (search) params.search = search;
    if (difficulty) params.difficulty = difficulty;

    axios.get(`${API_URL}/problems`, { params })
      .then(res => {
        const data = res.data;
        if (Array.isArray(data)) {
          setProblems(data);
        } else {
          console.error('Unexpected problems response', data);
          setProblems([]);
        }
      })
      .catch(err => {
        console.error(err);
      });
  };

  useEffect(() => {
    fetchProblems();
  }, [difficulty]); // Fetch when difficulty changes

  useEffect(() => {
    axios.get(`${API_URL}/settings/registration`)
      .then(res => {
        const enabled = !!res.data.enabled;
        setRegistrationEnabled(enabled);
      })
      .catch(err => {
        console.error(err);
      });
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProblems();
  };

  const DIFF_RGB = {
    LEVEL1: 'rgb(254, 76, 97)',
    LEVEL2: 'rgb(243, 156, 17)',
    LEVEL3: 'rgb(255, 193, 22)',
    LEVEL4: 'rgb(83, 196, 26)',
    LEVEL5: 'rgb(52, 152, 219)',
    LEVEL6: 'rgb(156, 61, 207)',
    LEVEL7: 'rgb(14, 29, 105)'
  };

  const badgeStyle = (diff) => {
    const rgb = DIFF_RGB[diff] || 'rgb(120,120,120)';
    return {
      color: rgb,
      backgroundColor: rgb.replace('rgb', 'rgba').replace(')', ', 0.12)'),
    };
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-primary dark:text-blue-400">{t('problem.list.title')}</h2>
      
      <Card className="mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2 items-end">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('problem.list.searchPlaceholder')}
              fullWidth
              className="flex-1"
            />
            <Button type="submit" variant="primary">
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
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">
                  {t('problem.list.id')}
                </th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('problem.list.problemTitle')}
                </th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                  {t('problem.list.difficulty')}
                </th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                  {t('problem.list.score')}
                </th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                  {t('problem.list.createdAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map(problem => (
                <tr key={problem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100">
                    {problem.id}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm font-medium text-primary dark:text-blue-400">
                    <Link to={`/problem/${problem.id}`} className="hover:underline block">
                      {problem.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm">
                    <span className="px-2.5 py-1 rounded-md text-xs font-semibold" style={badgeStyle(problem.difficulty)}>
                      {t(`problem.difficulty.${problem.difficulty || 'LEVEL2'}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm font-semibold">
                    {problem.score !== undefined ? (
                      <span className={problem.score === 100 ? "text-success" : "text-gray-900 dark:text-gray-100"}>
                        {problem.score}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(problem.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {problems.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">{t('problem.list.noProblems')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default ProblemList;
