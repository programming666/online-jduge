import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
      <h2 className="text-3xl font-bold mb-6 text-primary border-b-4 border-secondary inline-block pb-1">{t('problem.list.title')}</h2>
      
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('problem.list.searchPlaceholder')}
            className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button type="submit" className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark transition-colors">
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

      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
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
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                {t('problem.list.score')}
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">
                {t('problem.list.createdAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {problems.map(problem => (
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
                  <span className="px-2 py-1 rounded-full text-xs font-semibold" style={badgeStyle(problem.difficulty)}>
                    {t(`problem.difficulty.${problem.difficulty || 'LEVEL2'}`)}
                  </span>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm font-semibold">
                  {problem.score !== undefined ? (
                    <span className={problem.score === 100 ? "text-green-600" : "text-gray-900"}>
                      {problem.score}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm text-gray-500">
                  {new Date(problem.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {problems.length === 0 && (
              <tr>
                <td colSpan="5" className="px-5 py-5 text-center text-gray-500">{t('problem.list.noProblems')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProblemList;
