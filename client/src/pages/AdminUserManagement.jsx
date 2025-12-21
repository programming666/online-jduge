import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import TurnstileWidget from '../components/TurnstileWidget';
import * as echarts from 'echarts';

const API_URL = '/api';

function AdminUserManagement({ embedded = false }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [bannedIPs, setBannedIPs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  
  // Ban dialog state
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banUserId, setBanUserId] = useState(null);
  const [banReason, setBanReason] = useState('');

  const [queryUserInput, setQueryUserInput] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const suggestionsRef = useRef(null);

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessRecords, setAccessRecords] = useState([]);
  const [accessError, setAccessError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [ipFilter, setIpFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [exporting, setExporting] = useState(false);

  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileVerifying, setTurnstileVerifying] = useState(false);

  const [ipTags, setIpTags] = useState({});
  const [tagDialogIp, setTagDialogIp] = useState('');
  const [tagLabelsInput, setTagLabelsInput] = useState('');
  const [tagReasonInput, setTagReasonInput] = useState('');
  const [showTagDialog, setShowTagDialog] = useState(false);

  const trendRef = useRef(null);
  const mapRef = useRef(null);
  const trendChartRef = useRef(null);
  const mapChartRef = useRef(null);
  const [worldMapLoaded, setWorldMapLoaded] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');

  const userSuggestions = useMemo(() => {
    const q = queryUserInput.trim().toLowerCase();
    if (!q) return [];
    const list = users.filter((u) => {
      const name = (u.username || '').toLowerCase();
      const idStr = String(u.id);
      return name.includes(q) || idStr.includes(q);
    });
    return list.slice(0, 10);
  }, [queryUserInput, users]);

  const filteredAccessRecords = useMemo(() => {
    return accessRecords.filter((r) => {
      const ipOk = ipFilter
        ? (r.ip || '').toLowerCase().includes(ipFilter.toLowerCase())
        : true;
      const typeOk = typeFilter
        ? (r.accessType || '').toLowerCase().includes(typeFilter.toLowerCase())
        : true;
      return ipOk && typeOk;
    });
  }, [accessRecords, ipFilter, typeFilter]);

  const sortedAccessRecords = useMemo(() => {
    const sorted = [...filteredAccessRecords].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'createdAt') {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return (ta - tb) * dir;
      }
      if (sortField === 'ip') {
        return ((a.ip || '').localeCompare(b.ip || '')) * dir;
      }
      if (sortField === 'location') {
        const la = `${a.country || ''}-${a.city || ''}`;
        const lb = `${b.country || ''}-${b.city || ''}`;
        return la.localeCompare(lb) * dir;
      }
      if (sortField === 'device') {
        const da = `${a.browser || ''}-${a.os || ''}`;
        const db = `${b.browser || ''}-${b.os || ''}`;
        return da.localeCompare(db) * dir;
      }
      if (sortField === 'accessType') {
        return ((a.accessType || '').localeCompare(b.accessType || '')) * dir;
      }
      return 0;
    });
    return sorted;
  }, [filteredAccessRecords, sortDirection, sortField]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((sortedAccessRecords.length || 0) / pageSize));
  }, [sortedAccessRecords.length, pageSize]);

  const pagedAccessRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedAccessRecords.slice(start, end);
  }, [sortedAccessRecords, currentPage, pageSize]);

  const suspiciousIpList = useMemo(() => {
    const stats = new Map();
    accessRecords.forEach((r) => {
      if (!r.ip) return;
      const key = r.ip;
      const cur = stats.get(key) || {
        ip: key,
        total: 0,
        countries: new Set(),
      };
      cur.total += 1;
      if (r.country) cur.countries.add(r.country);
      stats.set(key, cur);
    });
    const list = Array.from(stats.values()).map((v) => {
      const c = v.countries.size;
      const suspicious = v.total > 100 || c > 2;
      return { ...v, countryCount: c, suspicious };
    });
    return list.filter((v) => v.suspicious).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [accessRecords]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, ipsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`),
        axios.get(`${API_URL}/admin/banned-ips`)
      ]);
      setUsers(usersRes.data || []);
      setBannedIPs(ipsRes.data || []);
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedTags = window.localStorage.getItem('admin:ipTags');
    if (storedTags) {
      try {
        const parsed = JSON.parse(storedTags);
        if (parsed && typeof parsed === 'object') {
          setIpTags(parsed);
        }
      } catch {
      }
    }
    const storedQuery = window.localStorage.getItem('admin:accessHistory:lastQuery');
    const storedData = window.localStorage.getItem('admin:accessHistory:lastData');
    if (storedQuery && storedData) {
      try {
        const queryMeta = JSON.parse(storedQuery);
        const data = JSON.parse(storedData);
        if (Array.isArray(data)) {
          if (queryMeta.fromDate) setFromDate(queryMeta.fromDate);
          if (queryMeta.toDate) setToDate(queryMeta.toDate);
          if (queryMeta.username) {
            setSelectedUserId(queryMeta.userId || null);
            setSelectedUsername(queryMeta.username || '');
            setQueryUserInput(
              queryMeta.userId && queryMeta.username
                ? `${queryMeta.userId} - ${queryMeta.username}`
                : queryMeta.username
            );
          }
          setAccessRecords(data);
        }
      } catch {
      }
    }
    const loadTurnstile = async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/turnstile`);
        const enabled = !!res.data.enabled;
        setTurnstileEnabled(enabled);
        const k = res.data?.siteKey;
        const fromApi = typeof k === 'string' ? k.trim() : '';
        const fromEnv = typeof import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY === 'string'
          ? import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY.trim()
          : '';
        setTurnstileSiteKey(fromApi || fromEnv);
      } catch {
      }
    };
    loadTurnstile();
  }, []);

  useEffect(() => {
    if (activeTab !== 'access') return;
    if (!trendRef.current) return;
    const existing = echarts.getInstanceByDom(trendRef.current);
    if (existing) existing.dispose();
    if (!accessRecords.length) return;
    const chart = echarts.init(trendRef.current);
    trendChartRef.current = chart;
    const byDay = new Map();
    accessRecords.forEach((r) => {
      const d = new Date(r.createdAt);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });
    const days = Array.from(byDay.keys()).sort();
    const values = days.map((k) => byDay.get(k) || 0);
    chart.setOption({
      tooltip: {
        trigger: 'axis',
      },
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: days,
      },
      yAxis: {
        type: 'value',
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          type: 'line',
          smooth: true,
          data: values,
        },
      ],
    });
    const resizeHandler = () => chart.resize();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
      chart.dispose();
    };
  }, [activeTab, accessRecords]);

  useEffect(() => {
    const loadWorld = async () => {
      try {
        const res = await fetch(
          'https://echarts.apache.org/examples/data/asset/geo/world.json'
        );
        const json = await res.json();
        echarts.registerMap('world', json);
        setWorldMapLoaded(true);
      } catch {
      }
    };
    loadWorld();
  }, []);

  useEffect(() => {
    if (activeTab !== 'access') return;
    if (!worldMapLoaded) return;
    if (!mapRef.current) return;
    const existing = echarts.getInstanceByDom(mapRef.current);
    if (existing) existing.dispose();
    if (!accessRecords.length) return;
    const chart = echarts.init(mapRef.current);
    mapChartRef.current = chart;
    const byCountry = new Map();
    accessRecords.forEach((r) => {
      const c = r.country || 'Unknown';
      byCountry.set(c, (byCountry.get(c) || 0) + 1);
    });
    const data = Array.from(byCountry.entries()).map(([name, value]) => ({
      name,
      value,
    }));
    chart.setOption({
      tooltip: {
        trigger: 'item',
      },
      visualMap: {
        min: 0,
        max: Math.max(1, ...data.map((d) => d.value)),
        text: ['High', 'Low'],
        realtime: true,
        calculable: true,
      },
      series: [
        {
          type: 'map',
          map: 'world',
          roam: true,
          emphasis: {
            label: {
              show: false,
            },
          },
          data,
        },
      ],
    });
    chart.on('click', (params) => {
      if (params && params.name) {
        setSelectedCountry(params.name);
      }
    });
    const resizeHandler = () => chart.resize();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
      chart.dispose();
    };
  }, [activeTab, accessRecords, worldMapLoaded]);

  const handleBanUser = async () => {
    if (!banUserId) return;
    
    try {
      await axios.post(`${API_URL}/admin/users/${banUserId}/ban`, { reason: banReason, banIP: true });
      setMessage(t('settings.userManagement.success.ban'));
      setShowBanDialog(false);
      setBanUserId(null);
      setBanReason('');
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.ban'));
    }
  };

  const handleUnbanUser = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmUnban', { username }))) return;
    
    try {
      await axios.post(`${API_URL}/admin/users/${userId}/unban`);
      setMessage(t('settings.userManagement.success.unban'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.unban'));
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmDelete', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`);
      setMessage(t('settings.userManagement.success.delete'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.delete'));
    }
  };

  const handleDeleteUserWithBanIP = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmDeleteWithBanIP', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}?banIP=true`);
      setMessage(t('settings.userManagement.success.deleteWithBanIP'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.deleteWithBanIP'));
    }
  };

  const handleClearSubmissions = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmClearSubmissions', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}/submissions`);
      setMessage(t('settings.userManagement.success.clearSubmissions'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.clearSubmissions'));
    }
  };

  const handleUnbanIP = async (ip) => {
    if (!window.confirm(t('settings.bannedIPs.confirmUnban', { ip }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/banned-ips/${encodeURIComponent(ip)}`);
      setMessage(t('settings.bannedIPs.success.unban'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.bannedIPs.error.unban'));
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className={embedded ? '' : 'max-w-6xl mx-auto'}>
      {!embedded && (
        <h2 className="text-2xl font-bold text-primary dark:text-blue-400 mb-4">{t('settings.userManagement.title')}</h2>
      )}

      {/* Messages */}
      {message && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800">
          {message}
          <button
            onClick={() => setMessage('')}
            className="ml-2 text-green-800 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200"
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded border border-red-200 dark:border-red-800">
          {error}
          <button
            onClick={() => setError('')}
            className="ml-2 text-red-800 dark:text-red-300 hover:text-red-900 dark:hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'users'
              ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('settings.userManagement.title')}
        </button>
        <button
          onClick={() => setActiveTab('bannedIPs')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'bannedIPs'
              ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('settings.bannedIPs.title')}
        </button>
        <button
          onClick={() => setActiveTab('access')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'access'
              ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('settings.userAccess.title')}
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          <div className="mb-4 max-w-md">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('settings.userManagement.searchPlaceholder')}
              fullWidth
            />
          </div>

          <Card className="overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.id')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.username')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.role')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.createdAt')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      {t('settings.userManagement.noUsers')}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-900 dark:text-gray-200">{user.id}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-200">{user.username}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.role === 'ADMIN' 
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        {user.isBanned ? (
                          <div>
                            <span className="px-2 py-1 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                              {t('settings.userManagement.status.banned')}
                            </span>
                            {user.bannedReason && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {t('settings.userManagement.bannedReason')}: {user.bannedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                            {t('settings.userManagement.status.active')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {user.isBanned ? (
                            <Button
                              size="sm"
                              onClick={() => handleUnbanUser(user.id, user.username)}
                              className="text-xs bg-green-500 hover:bg-green-600 text-white"
                            >
                              {t('settings.userManagement.actions.unban')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setBanUserId(user.id);
                                setShowBanDialog(true);
                              }}
                              className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white"
                            >
                              {t('settings.userManagement.actions.ban')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleClearSubmissions(user.id, user.username)}
                            className="text-xs bg-gray-500 hover:bg-gray-600 text-white"
                          >
                            {t('settings.userManagement.actions.clearSubmissions')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="text-xs bg-red-500 hover:bg-red-600 text-white"
                          >
                            {t('settings.userManagement.actions.delete')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeleteUserWithBanIP(user.id, user.username)}
                            className="text-xs bg-red-700 hover:bg-red-800 text-white"
                          >
                            {t('settings.userManagement.actions.deleteWithBanIP')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    )}

    {activeTab === 'bannedIPs' && (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.bannedIPs.description')}</p>
        
        <Card className="overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                  {t('settings.bannedIPs.columns.ip')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                  {t('settings.bannedIPs.columns.reason')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                  {t('settings.bannedIPs.columns.bannedAt')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                  {t('settings.bannedIPs.columns.expiresAt')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                  {t('settings.bannedIPs.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {bannedIPs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.noIPs')}
                  </td>
                </tr>
              ) : (
                bannedIPs.map((ip) => (
                  <tr key={ip.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-200">{ip.ip}</td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-900 dark:text-gray-200">{ip.reason || '-'}</td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(ip.bannedAt)}
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                      {ip.expiresAt ? formatDate(ip.expiresAt) : t('settings.bannedIPs.permanent')}
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                      <Button
                        size="sm"
                        onClick={() => handleUnbanIP(ip.ip)}
                        className="text-xs bg-green-500 hover:bg-green-600 text-white"
                      >
                        {t('settings.bannedIPs.unban')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )}

      {activeTab === 'access' && (
        <div className="space-y-6">
          <Card className="border border-gray-200 dark:border-gray-700">
            <div className="p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.userAccess.userSearchLabel')}
                  </div>
                  <div className="relative">
                    <Input
                      value={queryUserInput}
                      onChange={(e) => {
                        setQueryUserInput(e.target.value);
                        setShowUserSuggestions(true);
                        setSelectedUserId(null);
                        setSelectedUsername('');
                      }}
                      onFocus={() => setShowUserSuggestions(true)}
                      placeholder={t('settings.userAccess.userSearchPlaceholder')}
                      fullWidth
                    />
                    {showUserSuggestions && queryUserInput.trim() && userSuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg"
                      >
                        {userSuggestions.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100"
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setSelectedUsername(u.username);
                              setQueryUserInput(`${u.id} - ${u.username}`);
                              setShowUserSuggestions(false);
                            }}
                          >
                            <span className="font-mono mr-2 text-xs text-gray-500 dark:text-gray-400">
                              #{u.id}
                            </span>
                            <span>{u.username}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.userAccess.userSearchHint')}
                  </div>
                </div>

                <div className="md:col-span-1">
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.userAccess.dateRangeLabel')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-gray-500 dark:text-gray-400">~</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.userAccess.dateRangeHint')}
                  </div>
                </div>

                <div className="md:col-span-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.userAccess.quickActions')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setAccessError('');
                          const input = queryUserInput.trim();
                          if (!input) {
                            setAccessError(t('settings.userAccess.error.userRequired'));
                            return;
                          }
                          let userId = selectedUserId;
                          let username = selectedUsername;
                          if (!userId) {
                            const isId = /^\d+$/.test(input);
                            if (isId) {
                              const idNum = Number(input);
                              const found = users.find((u) => u.id === idNum);
                              if (!found) {
                                setAccessError(t('settings.userAccess.error.userNotFound'));
                                return;
                              }
                              userId = found.id;
                              username = found.username;
                            } else {
                              const lower = input.toLowerCase();
                              const candidates = users.filter((u) =>
                                (u.username || '').toLowerCase().includes(lower)
                              );
                              if (candidates.length === 0) {
                                setAccessError(t('settings.userAccess.error.userNotFound'));
                                return;
                              }
                              if (candidates.length > 1) {
                                const exact = candidates.find(
                                  (u) => (u.username || '').toLowerCase() === lower
                                );
                                const chosen = exact || candidates[0];
                                userId = chosen.id;
                                username = chosen.username;
                              } else {
                                userId = candidates[0].id;
                                username = candidates[0].username;
                              }
                            }
                          }
                          if (!fromDate || !toDate) {
                            setAccessError(t('settings.userAccess.error.dateRequired'));
                            return;
                          }
                          const from = new Date(fromDate);
                          const to = new Date(toDate);
                          if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                            setAccessError(t('settings.userAccess.error.dateInvalid'));
                            return;
                          }
                          if (from > to) {
                            setAccessError(t('settings.userAccess.error.dateOrder'));
                            return;
                          }
                          const diffDays = Math.abs(to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
                          if (diffDays > 366) {
                            setAccessError(t('settings.userAccess.error.dateTooLong'));
                            return;
                          }
                          setAccessLoading(true);
                          setAccessError('');
                          try {
                            const res = await axios.get(
                              `${API_URL}/admin/access-history/user/${userId}`,
                              { params: { limit: 1000 } }
                            );
                            const all = res.data || [];
                            const fromBoundary = new Date(fromDate + 'T00:00:00Z');
                            const toBoundary = new Date(toDate + 'T23:59:59Z');
                            const filtered = all.filter((r) => {
                              const t = new Date(r.createdAt);
                              return t >= fromBoundary && t <= toBoundary;
                            });
                            setSelectedUserId(userId);
                            setSelectedUsername(username);
                            setAccessRecords(filtered);
                            setCurrentPage(1);
                            const queryMeta = {
                              userId,
                              username,
                              fromDate,
                              toDate,
                              savedAt: Date.now(),
                            };
                            window.localStorage.setItem(
                              'admin:accessHistory:lastQuery',
                              JSON.stringify(queryMeta)
                            );
                            window.localStorage.setItem(
                              'admin:accessHistory:lastData',
                              JSON.stringify(filtered)
                            );
                          } catch (e) {
                            setAccessError(
                              e.response?.data?.error || t('settings.userAccess.error.fetchFailed')
                            );
                          } finally {
                            setAccessLoading(false);
                          }
                        }}
                        disabled={accessLoading}
                        className="text-xs"
                      >
                        {accessLoading ? t('common.loading') : t('settings.userAccess.queryButton')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setQueryUserInput('');
                          setSelectedUserId(null);
                          setSelectedUsername('');
                          setFromDate(defaultFrom);
                          setToDate(defaultTo);
                          setAccessRecords([]);
                          setCurrentPage(1);
                          setIpFilter('');
                          setTypeFilter('');
                          setAccessError('');
                        }}
                        className="text-xs"
                      >
                        {t('settings.userAccess.resetButton')}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.userAccess.securityNote')}
                  </div>
                </div>
              </div>

              {accessError && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded border border-red-200 dark:border-red-800">
                  {accessError}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-4">
              <Card className="border border-gray-200 dark:border-gray-700">
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {t('settings.userAccess.tableTitle')}
                    </div>
                    {selectedUsername && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.userAccess.currentUserLabel', {
                          id: selectedUserId || '',
                          username: selectedUsername || '',
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ipFilter}
                        onChange={(e) => {
                          setIpFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder={t('settings.userAccess.ipFilterPlaceholder')}
                        className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100"
                      />
                      <input
                        type="text"
                        value={typeFilter}
                        onChange={(e) => {
                          setTypeFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder={t('settings.userAccess.typeFilterPlaceholder')}
                        className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <Select
                      value={String(pageSize)}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 20;
                        setPageSize(v);
                        setCurrentPage(1);
                      }}
                      options={[
                        { value: '20', label: '20' },
                        { value: '50', label: '50' },
                        { value: '100', label: '100' },
                      ]}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-300">
                          {[
                            { key: 'createdAt', label: t('settings.userAccess.columns.createdAt') },
                            { key: 'ip', label: t('settings.userAccess.columns.ip') },
                            { key: 'location', label: t('settings.userAccess.columns.location') },
                            { key: 'device', label: t('settings.userAccess.columns.device') },
                            { key: 'accessType', label: t('settings.userAccess.columns.accessType') },
                          ].map((col) => (
                            <th
                              key={col.key}
                              className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer select-none"
                              onClick={() => {
                                if (sortField === col.key) {
                                  setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortField(col.key);
                                  setSortDirection('desc');
                                }
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <span>{col.label}</span>
                                {sortField === col.key && (
                                  <span className="text-[10px]">
                                    {sortDirection === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedAccessRecords.map((r) => {
                          const location = [
                            r.country || '',
                            r.city || '',
                          ]
                            .filter(Boolean)
                            .join(' / ');
                          const device = [
                            r.browser || '',
                            r.os || '',
                          ]
                            .filter(Boolean)
                            .join(' / ');
                          const isTagged = ipTags[r.ip || ''];
                          return (
                            <tr
                              key={r.id}
                              className={`text-xs border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                                isTagged ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                              }`}
                            >
                              <td className="px-3 py-2 whitespace-nowrap text-gray-800 dark:text-gray-100">
                                {formatDate(r.createdAt)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                                  onClick={() => {
                                    if (!r.ip) return;
                                    window.open(`https://ipinfo.io/${encodeURIComponent(r.ip)}`, '_blank');
                                  }}
                                >
                                  {r.ip}
                                </button>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                                {location || '-'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                                {device || '-'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                                <div className="flex items-center gap-2">
                                  <span>{r.accessType || '-'}</span>
                                  <button
                                    type="button"
                                    className="text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => {
                                      if (!r.ip) return;
                                      setTagDialogIp(r.ip);
                                      const existing = ipTags[r.ip];
                                      setTagLabelsInput(existing?.labels?.join(',') || '');
                                      setTagReasonInput(existing?.reason || '');
                                      setShowTagDialog(true);
                                    }}
                                  >
                                    {t('settings.userAccess.tagButton')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {accessRecords.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400"
                            >
                              {accessLoading
                                ? t('common.loading')
                                : t('settings.userAccess.empty')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCurrentPage((p) => Math.max(1, p - 1));
                        }}
                        disabled={currentPage === 1}
                        className="text-xs"
                      >
                        {t('problem.list.prev')}
                      </Button>
                      <span>
                        {t('contest.list.pagination', {
                          page: currentPage,
                          totalPages: totalPages,
                        })}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const maxPage = totalPages;
                          setCurrentPage((p) => Math.min(maxPage, p + 1));
                        }}
                        disabled={
                          currentPage >= totalPages
                        }
                        className="text-xs"
                      >
                        {t('problem.list.next')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!accessRecords.length || exporting}
                        onClick={() => {
                          if (!accessRecords.length) return;
                          setExporting(true);
                          try {
                            const header = [
                              'id',
                              'userId',
                              'username',
                              'createdAt',
                              'ip',
                              'country',
                              'city',
                              'browser',
                              'os',
                              'accessType',
                              'webrtcIP',
                            ];
                            const rows = accessRecords.map((r) => [
                              r.id,
                              r.userId,
                              r.username || '',
                              r.createdAt,
                              r.ip || '',
                              r.country || '',
                              r.city || '',
                              r.browser || '',
                              r.os || '',
                              r.accessType || '',
                              r.webrtcIP || '',
                            ]);
                            const allRows = [header, ...rows];
                            const csv = allRows
                              .map((cols) =>
                                cols
                                  .map((v) => {
                                    const s = String(v ?? '');
                                    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                                      return `"${s.replace(/"/g, '""')}"`;
                                    }
                                    return s;
                                  })
                                  .join(',')
                              )
                              .join('\n');
                            const ts = new Date().toISOString().replace(/[:.]/g, '-');
                            const name = `user-${selectedUserId || 'unknown'}_${fromDate || 'from'}_${toDate || 'to'}_${ts}`;
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `${name}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                          } finally {
                            setExporting(false);
                          }
                        }}
                        className="text-xs"
                      >
                        {t('settings.userAccess.exportCSV')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!accessRecords.length || exporting}
                        onClick={() => {
                          if (!accessRecords.length) return;
                          setExporting(true);
                          try {
                            const header = [
                              'id',
                              'userId',
                              'username',
                              'createdAt',
                              'ip',
                              'country',
                              'city',
                              'browser',
                              'os',
                              'accessType',
                              'webrtcIP',
                            ];
                            const rows = accessRecords.map((r) => [
                              r.id,
                              r.userId,
                              r.username || '',
                              r.createdAt,
                              r.ip || '',
                              r.country || '',
                              r.city || '',
                              r.browser || '',
                              r.os || '',
                              r.accessType || '',
                              r.webrtcIP || '',
                            ]);
                            const allRows = [header, ...rows];
                            const csv = allRows
                              .map((cols) =>
                                cols
                                  .map((v) => {
                                    const s = String(v ?? '');
                                    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                                      return `"${s.replace(/"/g, '""')}"`;
                                    }
                                    return s;
                                  })
                                  .join(',')
                              )
                              .join('\n');
                            const ts = new Date().toISOString().replace(/[:.]/g, '-');
                            const name = `user-${selectedUserId || 'unknown'}_${fromDate || 'from'}_${toDate || 'to'}_${ts}`;
                            const blob = new Blob([csv], {
                              type: 'application/vnd.ms-excel;charset=utf-8;',
                            });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `${name}.xls`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                          } finally {
                            setExporting(false);
                          }
                        }}
                        className="text-xs"
                      >
                        {t('settings.userAccess.exportExcel')}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <Card className="border border-gray-200 dark:border-gray-700">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {t('settings.userAccess.trendTitle')}
                    </div>
                  </div>
                  <div
                    ref={trendRef}
                    className="w-full"
                    style={{ height: '220px' }}
                  />
                </div>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-700">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {t('settings.userAccess.mapTitle')}
                    </div>
                    {selectedCountry && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t('settings.userAccess.selectedCountryLabel', {
                          country: selectedCountry,
                        })}
                      </div>
                    )}
                  </div>
                  <div
                    ref={mapRef}
                    className="w-full"
                    style={{ height: '220px' }}
                  />
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 text-xs text-gray-600 dark:text-gray-300">
                    <div className="font-medium mb-1">
                      {t('settings.userAccess.suspiciousTitle')}
                    </div>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {suspiciousIpList.map((s) => (
                        <div
                          key={s.ip}
                          className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] text-red-700 dark:text-red-300">
                                {s.ip}
                              </span>
                            </div>
                            <div className="text-[11px] text-red-800 dark:text-red-200">
                              {t('settings.userAccess.suspiciousDesc', {
                                total: s.total,
                                countryCount: s.countryCount,
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="text-[10px] bg-red-600 hover:bg-red-700 text-white"
                              onClick={async () => {
                                if (!s.ip) return;
                                if (!turnstileEnabled || !turnstileSiteKey) {
                                  if (
                                    !window.confirm(
                                      t('settings.userAccess.confirmBanWithoutTurnstile', {
                                        ip: s.ip,
                                      })
                                    )
                                  ) {
                                    return;
                                  }
                                }
                                if (turnstileEnabled && turnstileSiteKey) {
                                  if (!turnstileToken) {
                                    alert(t('settings.userAccess.error.turnstileRequired'));
                                    return;
                                  }
                                  setTurnstileVerifying(true);
                                  try {
                                    const verifyRes = await axios.post(
                                      `${API_URL}/settings/turnstile/verify`,
                                      { response: turnstileToken }
                                    );
                                    if (!verifyRes.data?.success) {
                                      alert(
                                        t('settings.userAccess.error.turnstileFailed')
                                      );
                                      return;
                                    }
                                  } catch {
                                    alert(
                                      t('settings.userAccess.error.turnstileFailed')
                                    );
                                    return;
                                  } finally {
                                    setTurnstileVerifying(false);
                                  }
                                }
                                if (
                                  !window.confirm(
                                    t('settings.userAccess.confirmBanIp', { ip: s.ip })
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  await axios.post(`${API_URL}/admin/banned-ips`, {
                                    ip: s.ip,
                                    userId: selectedUserId || undefined,
                                    reason: t('settings.userAccess.autoBanReason'),
                                  });
                                  setMessage(t('settings.userAccess.banSuccess'));
                                  fetchData();
                                } catch (e) {
                                  setError(
                                    e.response?.data?.error ||
                                      t('settings.userAccess.banFailed')
                                  );
                                }
                              }}
                              disabled={turnstileVerifying}
                            >
                              {t('settings.userAccess.banButton')}
                            </Button>
                          </div>
                        </div>
                      ))}
                      {suspiciousIpList.length === 0 && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t('settings.userAccess.noSuspicious')}
                        </div>
                      )}
                    </div>
                    {turnstileEnabled && turnstileSiteKey && (
                      <div className="mt-2">
                        <TurnstileWidget
                          siteKey={turnstileSiteKey}
                          onToken={setTurnstileToken}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-700">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {t('settings.userAccess.tagListTitle')}
                    </div>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-auto text-xs">
                    {Object.keys(ipTags).length === 0 && (
                      <div className="text-gray-500 dark:text-gray-400">
                        {t('settings.userAccess.tagListEmpty')}
                      </div>
                    )}
                    {Object.entries(ipTags).map(([ip, info]) => (
                      <div
                        key={ip}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] text-gray-800 dark:text-gray-100">
                              {ip}
                            </span>
                            {info.labels && info.labels.length > 0 && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-300">
                                [{info.labels.join(', ')}]
                              </span>
                            )}
                          </div>
                          {info.reason && (
                            <div className="text-[11px] text-gray-600 dark:text-gray-300">
                              {info.reason}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px]"
                            onClick={() => {
                              setTagDialogIp(ip);
                              setTagLabelsInput(info.labels?.join(',') || '');
                              setTagReasonInput(info.reason || '');
                              setShowTagDialog(true);
                            }}
                          >
                            {t('settings.userAccess.tagEdit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] text-red-600"
                            onClick={() => {
                              const next = { ...ipTags };
                              delete next[ip];
                              setIpTags(next);
                              window.localStorage.setItem(
                                'admin:ipTags',
                                JSON.stringify(next)
                              );
                            }}
                          >
                            {t('settings.userAccess.tagRemove')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {showBanDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {t('settings.userManagement.banDialog.title')}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('settings.userManagement.banDialog.reason')}
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t('settings.userManagement.banDialog.reasonPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowBanDialog(false);
                  setBanUserId(null);
                  setBanReason('');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={handleBanUser}>
                {t('settings.userManagement.banDialog.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTagDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              {t('settings.userAccess.tagDialogTitle', { ip: tagDialogIp })}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.userAccess.tagLabels')}
                </label>
                <input
                  type="text"
                  value={tagLabelsInput}
                  onChange={(e) => setTagLabelsInput(e.target.value)}
                  placeholder={t('settings.userAccess.tagLabelsPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.userAccess.tagReason')}
                </label>
                <textarea
                  value={tagReasonInput}
                  onChange={(e) => setTagReasonInput(e.target.value)}
                  placeholder={t('settings.userAccess.tagReasonPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowTagDialog(false);
                  setTagDialogIp('');
                  setTagLabelsInput('');
                  setTagReasonInput('');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!tagDialogIp) return;
                  const reason = tagReasonInput.trim();
                  if (!reason) {
                    alert(t('settings.userAccess.error.tagReasonRequired'));
                    return;
                  }
                  const labels = tagLabelsInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const next = {
                    ...ipTags,
                    [tagDialogIp]: {
                      labels,
                      reason,
                      updatedAt: new Date().toISOString(),
                    },
                  };
                  setIpTags(next);
                  window.localStorage.setItem('admin:ipTags', JSON.stringify(next));
                  setShowTagDialog(false);
                  setTagDialogIp('');
                  setTagLabelsInput('');
                  setTagReasonInput('');
                }}
              >
                {t('settings.userAccess.tagSave')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUserManagement;
