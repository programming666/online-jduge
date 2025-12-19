import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
    <div className={embedded ? '' : 'max-w-6xl mx-auto bg-white p-6 rounded-lg shadow border border-gray-200'}>
      <div className="flex items-center justify-between mb-4">
        {!embedded && (
          <h2 className="text-2xl font-bold text-primary">
            {t('admin.menu.contests')}
          </h2>
        )}
        {embedded && <div />}
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={goToCreate}
            className="px-4 py-2 rounded bg-primary text-white text-sm font-semibold hover:bg-blue-600"
          >
            创建比赛
          </button>
          <button
            type="button"
            onClick={() => handleBatchPublish(true)}
            disabled={processing || selectedIds.length === 0}
            className="px-3 py-2 rounded border border-green-500 text-green-600 text-sm disabled:opacity-50"
          >
            批量发布
          </button>
          <button
            type="button"
            onClick={() => handleBatchPublish(false)}
            disabled={processing || selectedIds.length === 0}
            className="px-3 py-2 rounded border border-yellow-500 text-yellow-600 text-sm disabled:opacity-50"
          >
            批量下线
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-sm text-gray-500">
          {t('common.loading')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm leading-normal">
            <thead>
              <tr>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">ID</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.name')}</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.startTime')}</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.statusLabel')}</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.participants')}</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-left">语言</th>
                <th className="px-4 py-2 border-b bg-gray-50 text-right">操作</th>
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
                  <tr key={contest.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border-b">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(contest.id)}
                        onChange={() => toggleSelectOne(contest.id)}
                      />
                    </td>
                    <td className="px-4 py-2 border-b">{contest.id}</td>
                    <td className="px-4 py-2 border-b whitespace-nowrap">{contest.name}</td>
                    <td className="px-4 py-2 border-b">
                      <div>{formatDateTime(contest.startTime)}</div>
                      <div>{formatDateTime(contest.endTime)}</div>
                    </td>
                    <td className="px-4 py-2 border-b">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          {statusText}
                        </span>
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          {contest.isPublished ? '已发布' : '未发布'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 border-b text-center">
                      {typeof contest.participantCount === 'number' ? contest.participantCount : 0}
                    </td>
                    <td className="px-4 py-2 border-b">
                      {(contest.languages || []).join(', ') || '-'}
                    </td>
                    <td className="px-4 py-2 border-b text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => goToEdit(contest.id)}
                        className="px-3 py-1 rounded border border-gray-300 text-xs"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(contest.id)}
                        disabled={exportingId === contest.id}
                        className="px-3 py-1 rounded border border-blue-500 text-xs text-blue-600 disabled:opacity-50"
                      >
                        导出代码
                      </button>
                    </td>
                  </tr>
                );
              })}
              {contests.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="px-4 py-4 text-center text-gray-500"
                  >
                    {t('problem.list.noProblems')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminContestList;
