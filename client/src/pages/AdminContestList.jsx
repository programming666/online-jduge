import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const API_URL = '/api';

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function AdminContestList({ embedded = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  const loadContests = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/contests`);
      const items = Array.isArray(res.data) ? res.data : [];
      setContests(items);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load contests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContests();
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === contests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contests.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBatchPublish = async (publish) => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      publish ? '确认批量发布选中的比赛？' : '确认批量下线选中的比赛？'
    );
    if (!confirmed) return;

    setProcessing(true);
    setError('');
    try {
      await axios.post(`${API_URL}/contests/batch/publish`, {
        ids: selectedIds,
        published: publish
      });
      await loadContests();
      setSelectedIds([]);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update contests');
    } finally {
      setProcessing(false);
    }
  };

  const goToCreate = () => {
    navigate('/admin/contests/new');
  };

  const goToEdit = (id) => {
    navigate(`/admin/contests/${id}/edit`);
  };

  const handleExport = async (id) => {
    if (!window.confirm('导出该比赛的所有提交代码？')) return;

    setExportingId(id);
    try {
      const res = await axios.get(`${API_URL}/contests/${id}/export`, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contest-${id}-submissions.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to export submissions');
    } finally {
      setExportingId(null);
    }
  };

  const allSelected = contests.length > 0 && selectedIds.length === contests.length;

  return (
    <div className={embedded ? '' : 'container mx-auto px-4 py-8 max-w-7xl animate-fade-in'}>
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        {!embedded && (
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
            <span className="w-1.5 h-8 bg-primary rounded-full"></span>
            {t('admin.menu.contests')}
          </h2>
        )}
        {embedded && <div />}
        <div className="flex space-x-3 w-full md:w-auto justify-end">
          <Button
            onClick={goToCreate}
          >
            创建比赛
          </Button>
          <Button
            variant="outline"
            onClick={() => handleBatchPublish(true)}
            disabled={processing || selectedIds.length === 0}
            className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/30"
          >
            批量发布
          </Button>
          <Button
            variant="outline"
            onClick={() => handleBatchPublish(false)}
            disabled={processing || selectedIds.length === 0}
            className="text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/30"
          >
            批量下线
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-100 dark:border-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
          <div className="mt-2">{t('common.loading')}</div>
        </div>
      ) : (
        <Card className="overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm leading-normal">
              <thead>
                <tr>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400 font-semibold w-16">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 w-4 h-4"
                    />
                  </th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('contest.list.name')}</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('contest.list.startTime')}</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('contest.list.statusLabel')}</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('contest.list.participants')}</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">语言</th>
                  <th className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {contests.map((contest) => {
                  const now = new Date();
                  const start = new Date(contest.startTime);
                  const end = new Date(contest.endTime);
                  let statusText = '';
                  if (now < start) statusText = t('contest.status.upcoming');
                  else if (now > end) statusText = t('contest.status.finished');
                  else statusText = t('contest.status.ongoing');

                  return (
                    <tr key={contest.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(contest.id)}
                          onChange={() => toggleSelectOne(contest.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 w-4 h-4"
                        />
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-200 font-medium">{contest.id}</td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-200 font-medium">{contest.name}</td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                        <div className="flex flex-col gap-1">
                          <span>{formatDateTime(contest.startTime)}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-xs">{formatDateTime(contest.endTime)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex flex-col gap-2">
                          <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 w-fit">
                            {statusText}
                          </span>
                          <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-medium rounded-full w-fit ${contest.isPublished ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'}`}>
                            {contest.isPublished ? '已发布' : '未发布'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-center text-gray-900 dark:text-gray-200">
                        {typeof contest.participantCount === 'number' ? contest.participantCount : 0}
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs">
                        {(contest.languages || []).join(', ') || '-'}
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => goToEdit(contest.id)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExport(contest.id)}
                          disabled={exportingId === contest.id}
                          className="border-blue-500 dark:border-blue-600 text-blue-600 dark:text-blue-400 disabled:opacity-50 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                          导出代码
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {contests.length === 0 && (
                  <tr>
                    <td
                      colSpan="8"
                      className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 border-b dark:border-gray-700"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                         <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                         </svg>
                         <span className="text-sm font-medium">{t('problem.list.noProblems')}</span>
                       </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default AdminContestList;
