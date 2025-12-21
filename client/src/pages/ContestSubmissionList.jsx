import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '../components/ui/Card';

const API_URL = '/api';

function ContestSubmissionList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const { t } = useTranslation();

  const fetchSubmissions = () => {
    axios.get(`${API_URL}/submissions`, { params: { contest_id: id } })
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setSubmissions(data);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [id]);

  const getStatusColor = (status) => {
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '');
    switch (normalizedStatus) {
      case 'accepted': return 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'wronganswer': return 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      case 'pending': return 'text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800';
      case 'timelimitexceeded': return 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800';
      case 'submitted': return 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      default: return 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const translateStatus = (status) => {
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '');
    switch (normalizedStatus) {
      case 'accepted': return t('submission.status.accepted');
      case 'wronganswer': return t('submission.status.wrongAnswer');
      case 'pending': return t('submission.status.pending');
      case 'timelimitexceeded': return t('submission.status.timeLimitExceeded');
      case 'memorylimitexceeded': return t('submission.status.memoryLimitExceeded');
      case 'runtimeerror': return t('submission.status.runtimeError');
      case 'compileerror': return t('submission.status.compileError');
      case 'submitted': return t('submission.status.submitted', { defaultValue: 'Submitted' });
      default: return status;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
          <span className="w-1.5 h-8 bg-primary rounded-full"></span>
          {t('contest.submission.title', { defaultValue: 'Contest Submissions' })}
        </h2>
        <button
            onClick={() => navigate(`/contest/${id}`)}
            className="px-4 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm text-sm font-medium"
        >
            {t('common.back', { defaultValue: 'Back' })}
        </button>
      </div>
      <Card className="shadow-card overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors duration-200">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">{t('submission.list.id')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.time')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.user')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.problem')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.status')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.timeUsed')}</th>
                <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('submission.list.language')}</th>
              </tr>
            </thead>
            <tbody>
              {submissions?.map(sub => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm font-medium text-primary dark:text-blue-400">
                      <Link to={`/submission/${sub.id}`} className="hover:underline hover:text-primary-hover">#{sub.id}</Link>
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                      {new Date(sub.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 font-medium">
                      {sub.user?.username || t('submission.list.anonymous')}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-primary dark:text-blue-400 font-medium">
                    {/* Link to contest problem view if possible, otherwise generic problem view */}
                     {/* We might not know the index here, so just use title for now or link to generic problem */}
                    <span className="text-gray-900 dark:text-gray-100">{sub.problem?.title}</span>
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(sub.status)}`}>
                      {translateStatus(sub.status)}
                    </span>
                    {sub.status !== 'Accepted' && sub.status !== 'Pending' && sub.output && (
                        <div className="text-xs text-gray-400 mt-1 truncate max-w-xs pl-1" title={sub.output}>
                            {sub.output.substring(0, 50)}
                        </div>
                    )}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 font-mono">
                      {sub.timeUsed !== null ? `${sub.timeUsed} ${t('common.unit.ms')}` : '-'}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 font-mono">
                      {sub.language}
                  </td>
                </tr>
              ))}
               {submissions.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      <span className="text-sm font-medium">{t('submission.list.noSubmissions')}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default ContestSubmissionList;
