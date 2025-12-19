import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';

function ContestLeaderboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const nf = new Intl.NumberFormat(i18n.language || undefined);

  const [contest, setContest] = useState(null);
  const [items, setItems] = useState([]);
  const [scoreVisible, setScoreVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('rank');
  const [order, setOrder] = useState('desc');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [detailRes, boardRes] = await Promise.all([
          axios.get(`${API_URL}/contests/public/${id}`),
          axios.get(`${API_URL}/contests/public/${id}/leaderboard?page=${page}&pageSize=${pageSize}&sort=${sort}&order=${order}`)
        ]);
        setContest(detailRes.data);
        setItems(Array.isArray(boardRes.data?.items) ? boardRes.data.items : []);
        setScoreVisible(!!boardRes.data?.scoreVisible);
        setTotal(boardRes.data?.total || 0);
        if (boardRes.data?.sort) setSort(boardRes.data.sort);
        if (boardRes.data?.order) setOrder(boardRes.data.order);
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, page, pageSize, sort, order]);

  const toggleSort = (key) => {
    setPage(1);
    if (sort === key) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      setOrder(key === 'rank' ? 'desc' : 'desc');
    }
  };

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (loading) {
    return <div>{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className="w-[95%] max-w-[95%] mx-auto my-8">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate(`/contest/${id}`)}
            className="text-primary hover:text-blue-700 text-sm"
          >
            {t('contest.detail.backToList')}
          </button>
        </div>
        <div className="p-6 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="w-[95%] max-w-[95%] mx-auto my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-primary border-b-4 border-secondary inline-block pb-1">
            {t('contest.leaderboard.title', { defaultValue: '比赛排行榜' })} {contest ? `- ${contest.name}` : ''}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/contest/${id}`)}
            className="px-4 py-2 bg-primary text-white rounded shadow text-sm hover:bg-blue-600"
          >
            {t('contest.detail.backToList')}
          </button>
        </div>
        <div className="space-y-3">
          {(items || []).map((row) => (
            <div key={row.rank} className="bg-white rounded border shadow p-3 text-sm">
              <div className="flex justify-between">
                <div>{t('contest.leaderboard.rank', { defaultValue: '排名' })}</div>
                <div className="font-semibold">{nf.format(row.rank)}</div>
              </div>
              <div className="flex justify-between mt-1">
                <div>{t('contest.leaderboard.username', { defaultValue: '用户名' })}</div>
                <div className="font-semibold">{row.username}</div>
              </div>
              <div className="flex justify-between mt-1">
                <div>{t('contest.leaderboard.score', { defaultValue: '得分' })}/{t('contest.leaderboard.submissions', { defaultValue: '提交次数' })}</div>
                <div className="font-semibold">
                  {scoreVisible
                    ? `${nf.format(row.score)}/${nf.format(row.submissionCount)}`
                    : (row.submissionCount > 0
                      ? `${t('contest.leaderboard.submittedOnly', { defaultValue: '已提交' })}/${nf.format(row.submissionCount)}`
                      : '-')
                  }
                </div>
              </div>
              <div className="mt-2">
                {(contest?.problems || []).map((p) => {
                  const stat = row.problemScores ? row.problemScores[p.id] : undefined;
                  const submitted = stat ? stat.submissionCount > 0 : false;
                  const val = scoreVisible
                    ? `${nf.format(stat ? stat.score : 0)}/${nf.format(stat ? stat.submissionCount : 0)}`
                    : (submitted ? t('contest.leaderboard.submittedOnly', { defaultValue: '已提交' }) : '-');
                  return (
                    <div key={`${row.rank}-${p.id}`} className="flex justify-between py-1 border-t">
                      <div className="text-gray-700">{p.title}</div>
                      <div className="font-semibold">{val}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center text-gray-500 text-sm">
              {t('contest.list.noContests')}
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {t('contest.list.pagination', { page, totalPages: Math.max(1, Math.ceil(total / pageSize)) })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 bg-primary text-white rounded shadow text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {t('contest.list.prev')}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => {
                const totalPages = Math.max(1, Math.ceil(total / pageSize));
                return Math.min(totalPages, p + 1);
              })}
              disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
              className="px-4 py-2 bg-primary text-white rounded shadow text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {t('contest.list.next')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[95%] max-w-[95%] mx-auto my-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-primary border-b-4 border-secondary inline-block pb-1">
          {t('contest.leaderboard.title', { defaultValue: '比赛排行榜' })} {contest ? `- ${contest.name}` : ''}
        </h2>
        <button
          type="button"
          onClick={() => navigate(`/contest/${id}`)}
          className="px-4 py-2 bg-primary text-white rounded shadow text-sm hover:bg-blue-600"
        >
          {t('contest.detail.backToList')}
        </button>
      </div>

      <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-6">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full leading-normal text-sm">
            <thead>
              <tr className="sticky top-0 z-10">
                <th
                  className="px-4 py-3 border-b bg-gray-50 text-left whitespace-nowrap min-w-[80px] select-none cursor-pointer"
                  onClick={() => toggleSort('rank')}
                  title={t('contest.leaderboard.rank', { defaultValue: '排名' })}
                >
                  {t('contest.leaderboard.rank', { defaultValue: '排名' })}
                  {sort === 'rank' && (order === 'asc' ? ' ▲' : ' ▼')}
                </th>
                <th className="px-4 py-3 border-b bg-gray-50 text-left whitespace-nowrap min-w-[80px]">
                  {t('contest.leaderboard.username', { defaultValue: '用户名' })}
                </th>
                <th
                  className="px-4 py-3 border-b bg-gray-50 text-left whitespace-nowrap min-w-[80px] select-none cursor-pointer"
                  onClick={() => toggleSort('score')}
                  title={`${t('contest.leaderboard.score', { defaultValue: '得分' })}/${t('contest.leaderboard.submissions', { defaultValue: '提交次数' })}`}
                >
                  {t('contest.leaderboard.score', { defaultValue: '得分' })}/{t('contest.leaderboard.submissions', { defaultValue: '提交次数' })}
                  {sort === 'score' && (order === 'asc' ? ' ▲' : ' ▼')}
                </th>
                {contest?.problems?.map((p) => (
                  <th
                    key={p.id}
                    className="px-4 py-3 border-b bg-gray-50 text-left whitespace-nowrap min-w-[80px]"
                  >
                    {p.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items || []).map((row) => (
                <tr key={row.rank} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 border-b text-left whitespace-nowrap min-w-[80px]">{nf.format(row.rank)}</td>
                  <td className="px-4 py-3 border-b text-left whitespace-nowrap min-w-[80px]">{row.username}</td>
                  <td className="px-4 py-3 border-b text-left whitespace-nowrap min-w-[80px]">
                    {scoreVisible
                      ? `${nf.format(row.score)}/${nf.format(row.submissionCount)}`
                      : (row.submissionCount > 0
                        ? `${t('contest.leaderboard.submittedOnly', { defaultValue: '已提交' })}/${nf.format(row.submissionCount)}`
                        : '-')
                    }
                  </td>
                  {contest?.problems?.map((p) => {
                    const stat = row.problemScores ? row.problemScores[p.id] : undefined;
                    const submitted = stat ? stat.submissionCount > 0 : false;
                    const score = stat ? stat.score : 0;
                    
                    let cellClass = "px-4 py-3 border-b text-left whitespace-nowrap min-w-[80px]";
                    if (scoreVisible) {
                      if (submitted) {
                        if (score === 100) cellClass += " bg-green-100 text-green-800";
                        else if (score >= 60) cellClass += " bg-yellow-100 text-yellow-800";
                        else if (score > 0) cellClass += " bg-orange-100 text-orange-800";
                        else cellClass += " bg-red-100 text-red-800";
                      }
                    } else {
                      if (submitted) {
                        cellClass += " bg-green-100 text-green-800";
                      }
                    }

                    const val = scoreVisible
                      ? `${nf.format(stat ? stat.score : 0)}/${nf.format(stat ? stat.submissionCount : 0)}`
                      : (submitted ? t('contest.leaderboard.submittedOnly', { defaultValue: '已提交' }) : '-');
                    return (
                      <td
                        key={`${row.rank}-${p.id}`}
                        className={cellClass}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="px-4 py-4 border-b text-center text-gray-500" colSpan={(contest?.problems?.length || 0) + 3}>
                    {t('contest.list.noContests')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {t('contest.list.pagination', { page, totalPages: Math.max(1, Math.ceil(total / pageSize)) })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                {t('contest.list.prev')}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => {
                  const totalPages = Math.max(1, Math.ceil(total / pageSize));
                  return Math.min(totalPages, p + 1);
                })}
                disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                {t('contest.list.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContestLeaderboard;
