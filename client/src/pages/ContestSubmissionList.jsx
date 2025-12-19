import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
      case 'accepted': return 'text-green-600 bg-green-100';
      case 'wronganswer': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'timelimitexceeded': return 'text-orange-600 bg-orange-100';
      case 'submitted': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-primary border-b-4 border-secondary inline-block pb-1">
          {t('contest.submission.title', { defaultValue: 'Contest Submissions' })}
        </h2>
        <button
            onClick={() => navigate(`/contest/${id}`)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
            {t('common.back', { defaultValue: 'Back' })}
        </button>
      </div>
      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.id')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.time')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.user')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.problem')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.status')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.timeUsed')}</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('submission.list.language')}</th>
            </tr>
          </thead>
          <tbody>
            {submissions?.map(sub => (
              <tr key={sub.id} className="hover:bg-gray-50">
                <td className="px-5 py-5 border-b border-gray-200 text-sm font-bold text-primary">
                    <Link to={`/submission/${sub.id}`} className="hover:underline">#{sub.id}</Link>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm text-gray-500">
                    {new Date(sub.createdAt).toLocaleString()}
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm font-medium text-gray-700">
                    {sub.user?.username || t('submission.list.anonymous')}
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm font-medium text-primary">
                  {/* Link to contest problem view if possible, otherwise generic problem view */}
                   {/* We might not know the index here, so just use title for now or link to generic problem */}
                  <span className="text-gray-900">{sub.problem?.title}</span>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm">
                  <span className={`px-2 py-1 rounded-full font-semibold text-xs ${getStatusColor(sub.status)}`}>
                    {translateStatus(sub.status)}
                  </span>
                  {sub.status !== 'Accepted' && sub.status !== 'Pending' && sub.output && (
                      <div className="text-xs text-gray-400 mt-1 truncate max-w-xs" title={sub.output}>
                          {sub.output.substring(0, 50)}
                      </div>
                  )}
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm text-gray-600">
                    {sub.timeUsed !== null ? `${sub.timeUsed} ${t('common.unit.ms')}` : '-'}
                </td>
                <td className="px-5 py-5 border-b border-gray-200 text-sm text-gray-600 uppercase">
                    {sub.language}
                </td>
              </tr>
            ))}
             {submissions.length === 0 && (
              <tr>
                <td colSpan="7" className="px-5 py-5 text-center text-gray-500">{t('submission.list.noSubmissions')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ContestSubmissionList;
