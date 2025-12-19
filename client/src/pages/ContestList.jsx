import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';
const CACHE_KEY = 'contestListCache';

function getStatus(startTime, endTime) {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return 'upcoming';
  if (now > end) return 'finished';
  return 'ongoing';
}

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

function ContestList() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedContest, setSelectedContest] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState('');
  const [viewMode, setViewMode] = useState('card');
  const [statusFilter, setStatusFilter] = useState('');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [minParticipants, setMinParticipants] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const loadFromCache = () => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return false;
      setContests(parsed.items);
      setPage(parsed.page || 1);
      setPageSize(parsed.pageSize || 10);
      setTotal(parsed.total || parsed.items.length);
      setLoading(false);
      return true;
    } catch (e) {
      return false;
    }
  };

  const saveToCache = (data) => {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      
    }
  };

  const fetchContests = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/contests/public`, {
        params: {
          page: targetPage,
          pageSize: targetPageSize,
          status: statusFilter || undefined,
          startFrom: startFrom || undefined,
          startTo: startTo || undefined,
          minParticipants: minParticipants || undefined,
          maxParticipants: maxParticipants || undefined
        }
      });
      const data = res.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      setContests(items);
      setPage(data.page || targetPage);
      setPageSize(data.pageSize || targetPageSize || 10);
      setTotal(data.total || items.length);
      saveToCache({
        items,
        page: data.page || targetPage,
        pageSize: data.pageSize || targetPageSize || 10,
        total: data.total || items.length
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load contests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromCache();
    fetchContests(1);
  }, []);

  const openPasswordModal = (contest) => {
    const key = `contest_access_${contest.id}`;
    const metaKey = `contest_access_meta_${contest.id}`;
    let verified = false;
    try {
      const raw = sessionStorage.getItem(key);
      const metaRaw = sessionStorage.getItem(metaKey);
      const hasFlag = raw === 'true';
      let expiresAt = contest.endTime;
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && typeof meta.expiresAt === 'string') {
          expiresAt = meta.expiresAt;
        }
      }
      const now = new Date();
      const exp = new Date(expiresAt);
      verified = hasFlag && !Number.isNaN(exp.getTime()) && now < exp;
      if (!verified && hasFlag) {
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(metaKey);
      }
    } catch (e) {
      verified = false;
    }
    if (contest.hasPassword && verified) {
      navigate(`/contest/${contest.id}`);
      return;
    }
    setSelectedContest(contest);
    setPassword('');
    setPasswordError('');
  };

  const closePasswordModal = () => {
    setSelectedContest(null);
    setPassword('');
    setPasswordError('');
  };

  const handleJoin = async () => {
    if (!selectedContest) return;

    setJoining(true);
    setPasswordError('');
    try {
      const res = await axios.post(`${API_URL}/contests/${selectedContest.id}/join`, {
        password: selectedContest.hasPassword ? password : undefined
      });

      if (!res.data || !res.data.success) {
        setPasswordError(t('contest.password.error'));
        setJoining(false);
        return;
      }

      const key = `contest_access_${selectedContest.id}`;
      sessionStorage.setItem(key, 'true');
      try {
        const metaKey = `contest_access_meta_${selectedContest.id}`;
        const meta = {
          verifiedAt: new Date().toISOString(),
          expiresAt: selectedContest.endTime
        };
        sessionStorage.setItem(metaKey, JSON.stringify(meta));
      } catch (e) {
        
      }
      closePasswordModal();
      navigate(`/contest/${selectedContest.id}`);
    } catch (e) {
      const data = e.response?.data || {};
      const baseMessage = data.error || t('contest.password.error');
      const attempts = typeof data.remainingAttempts === 'number' ? data.remainingAttempts : null;
      const message = attempts !== null
        ? `${baseMessage} (${t('contest.password.remaining', { count: attempts })})`
        : baseMessage;
      setPasswordError(message);
    } finally {
      setJoining(false);
    }
  };

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    fetchContests(nextPage);
  };

  const handlePasswordChange = (value) => {
    setPassword(value);
    if (!value) {
      setPasswordStrength('');
      return;
    }

    let strength = 'weak';
    if (value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value)) {
      strength = 'strong';
    } else if (value.length >= 6) {
      strength = 'medium';
    }

    setPasswordStrength(strength);
  };

  const handlePageSizeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    const size = Number.isNaN(value) ? 10 : value;
    setPageSize(size);
    fetchContests(1, size);
  };

  const handleApplyFilters = () => {
    fetchContests(1);
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-4 text-primary border-b-4 border-secondary inline-block pb-1">
        {t('contest.list.title')}
      </h2>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('contest.list.statusFilter')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">{t('contest.list.status.all')}</option>
              <option value="upcoming">{t('contest.status.upcoming')}</option>
              <option value="ongoing">{t('contest.status.ongoing')}</option>
              <option value="finished">{t('contest.status.finished')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('contest.list.timeFrom')}
            </label>
            <input
              type="datetime-local"
              value={startFrom}
              onChange={(e) => setStartFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('contest.list.timeTo')}
            </label>
            <input
              type="datetime-local"
              value={startTo}
              onChange={(e) => setStartTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('contest.list.minParticipants')}
            </label>
            <input
              type="number"
              min="0"
              value={minParticipants}
              onChange={(e) => setMinParticipants(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('contest.list.maxParticipants')}
            </label>
            <input
              type="number"
              min="0"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleApplyFilters}
            className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-blue-600"
          >
            {t('common.filter')}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('contest.list.pageSize')}</span>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-3 py-1 ${viewMode === 'card' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}
            >
              {t('contest.list.view.card')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}
            >
              {t('contest.list.view.list')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white shadow-lg rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>
        ) : contests.length === 0 ? (
          <div className="p-6 text-center text-gray-500">{t('contest.list.noContests')}</div>
        ) : (
          <div className="p-4">
            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {contests.map((contest) => {
                  const status = getStatus(contest.startTime, contest.endTime);
                  let statusText = '';
                  let statusClass = '';

                  if (status === 'upcoming') {
                    statusText = t('contest.status.upcoming');
                    statusClass = 'bg-blue-100 text-blue-700';
                  } else if (status === 'ongoing') {
                    statusText = t('contest.status.ongoing');
                    statusClass = 'bg-green-100 text-green-700';
                  } else {
                    statusText = t('contest.status.finished');
                    statusClass = 'bg-gray-200 text-gray-700';
                  }

                  return (
                    <div key={contest.id} className="border border-gray-200 rounded-lg p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-semibold text-primary">{contest.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                            {statusText}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                          {contest.description || ''}
                        </p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>
                            {t('contest.list.startTime')}: {formatDateTime(contest.startTime)}
                          </div>
                          <div>
                            {t('contest.list.endTime')}: {formatDateTime(contest.endTime)}
                          </div>
                          <div>
                            {t('contest.list.participants')}: {contest.participantCount}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase">{contest.rule}</span>
                        <button
                          type="button"
                          onClick={() => openPasswordModal(contest)}
                          className="px-4 py-2 rounded bg-primary text-white text-sm font-semibold hover:bg-blue-600"
                        >
                          {t('contest.list.join')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm leading-normal">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.name')}</th>
                      <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.startTime')}</th>
                      <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.endTime')}</th>
                      <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.status')}</th>
                      <th className="px-4 py-2 border-b bg-gray-50 text-left">{t('contest.list.participants')}</th>
                      <th className="px-4 py-2 border-b bg-gray-50 text-right">{t('contest.list.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contests.map((contest) => {
                      const status = getStatus(contest.startTime, contest.endTime);
                      let statusText = '';
                      let statusClass = '';

                      if (status === 'upcoming') {
                        statusText = t('contest.status.upcoming');
                        statusClass = 'bg-blue-100 text-blue-700';
                      } else if (status === 'ongoing') {
                        statusText = t('contest.status.ongoing');
                        statusClass = 'bg-green-100 text-green-700';
                      } else {
                        statusText = t('contest.status.finished');
                        statusClass = 'bg-gray-200 text-gray-700';
                      }

                      return (
                        <tr key={contest.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 border-b">
                            <div className="font-semibold text-primary">{contest.name}</div>
                            <div className="text-xs text-gray-500 line-clamp-1">{contest.description || ''}</div>
                          </td>
                          <td className="px-4 py-2 border-b text-xs text-gray-600">{formatDateTime(contest.startTime)}</td>
                          <td className="px-4 py-2 border-b text-xs text-gray-600">{formatDateTime(contest.endTime)}</td>
                          <td className="px-4 py-2 border-b">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                              {statusText}
                            </span>
                          </td>
                          <td className="px-4 py-2 border-b text-center text-xs text-gray-700">
                            {contest.participantCount}
                          </td>
                          <td className="px-4 py-2 border-b text-right">
                            <button
                              type="button"
                              onClick={() => openPasswordModal(contest)}
                              className="px-3 py-1 rounded bg-primary text-white text-xs font-semibold hover:bg-blue-600"
                            >
                              {t('contest.list.join')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {t('contest.list.pagination', {
                page,
                totalPages
              })}
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50"
              >
                {t('contest.list.prev')}
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50"
              >
                {t('contest.list.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedContest && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-4 text-primary">
              {t('contest.password.title', { name: selectedContest.name })}
            </h3>
            {selectedContest.hasPassword && (
              <div className="mb-4">
                <div className="relative">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder={t('contest.password.placeholder')}
                    className="w-full border border-gray-300 rounded p-2 pr-16 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((prev) => !prev)}
                    className="absolute inset-y-0 right-2 px-2 text-xs text-gray-600 hover:text-gray-800"
                  >
                    {passwordVisible ? t('contest.password.hide') : t('contest.password.show')}
                  </button>
                </div>
                {passwordStrength && (
                  <div className="mt-1 text-xs">
                    <span className="text-gray-500 mr-2">{t('contest.password.strength')}</span>
                    <span
                      className={
                        passwordStrength === 'strong'
                          ? 'text-green-600'
                          : passwordStrength === 'medium'
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }
                    >
                      {t(`contest.password.strength.${passwordStrength}`)}
                    </span>
                  </div>
                )}
              </div>
            )}
            {passwordError && (
              <div className="mb-2 text-sm text-red-600">{passwordError}</div>
            )}
            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={closePasswordModal}
                className="px-4 py-2 text-sm rounded border border-gray-300"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="px-4 py-2 text-sm rounded bg-primary text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {joining ? t('common.loading') : t('contest.password.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContestList;
