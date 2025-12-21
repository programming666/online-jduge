import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import * as echarts from 'echarts';
import AdminProblemList from './AdminProblemList';
import AdminContestList from './AdminContestList';
import AdminSettings from './AdminSettings';
import AdminUserManagement from './AdminUserManagement';

const MENU_ITEMS = [
  { key: 'problems', icon: '📝', labelKey: 'admin.menu.problems' },
  { key: 'contests', icon: '🏆', labelKey: 'admin.menu.contests' },
  { key: 'users', icon: '👥', labelKey: 'admin.menu.users' },
  { key: 'settings', icon: '⚙️', labelKey: 'admin.menu.settings' }
];

function AdminDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('problems');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [systemStatus, setSystemStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [historyPoints, setHistoryPoints] = useState([]);

  const API_URL = '/api';

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const loadStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/security/system-status`);
      const data = res.data || {};
      setSystemStatus(data);
      setStatusError('');
      const now = Date.now();
      const point = {
        time: now,
        value: typeof data.cgroupRatio === 'number' ? data.cgroupRatio : 0,
      };
      setHistoryPoints((prev) => {
        const next = [...prev, point];
        const cutoff = now - 60 * 60 * 1000;
        return next.filter((p) => p.time >= cutoff);
      });
    } catch (e) {
      setStatusError(
        e.response?.data?.error || t('admin.systemStatus.error.load')
      );
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!refreshInterval || refreshInterval < 5000) return;
    const id = setInterval(() => {
      loadStatus();
    }, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  const hostPercent = useMemo(() => {
    if (!systemStatus) return 0;
    if (typeof systemStatus.hostRatio === 'number') {
      return Math.round(systemStatus.hostRatio * 100);
    }
    return 0;
  }, [systemStatus]);

  const cgroupPercent = useMemo(() => {
    if (!systemStatus) return 0;
    if (typeof systemStatus.cgroupRatio === 'number') {
      return Math.round(systemStatus.cgroupRatio * 100);
    }
    return 0;
  }, [systemStatus]);

  const cgroupUsedHuman = useMemo(() => {
    if (!systemStatus) return '';
    const used = systemStatus.cgroupUsedBytes;
    const total = systemStatus.cgroupLimitBytes;
    if (!used || !total) return '';
    const toUnit = (v) => {
      if (v >= 1024 * 1024 * 1024) {
        return `${(v / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      }
      return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    };
    return `${toUnit(used)} / ${toUnit(total)}`;
  }, [systemStatus]);

  const throttled = systemStatus && systemStatus.memoryThrottle;

  useEffect(() => {
    if (!chartRef.current) return;
    if (!historyPoints.length) return;
    const existing = echarts.getInstanceByDom(chartRef.current);
    if (existing) {
      chartInstanceRef.current = existing;
    } else {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }
    const chart = chartInstanceRef.current;
    const data = historyPoints.map((p) => [
      new Date(p.time).toISOString(),
      Number(p.value || 0),
    ]);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (value) => {
            const d = new Date(value);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
          },
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: {
          formatter: (v) => `${Math.round(Number(v) * 100)}%`,
        },
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100 },
      ],
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: {},
          data,
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [historyPoints]);

  const renderContent = () => {
    switch (activeTab) {
      case 'problems':
        return <AdminProblemList embedded />;
      case 'contests':
        return <AdminContestList embedded />;
      case 'users':
        return <AdminUserManagement embedded />;
      case 'settings':
        return <AdminSettings embedded />;
      default:
        return <AdminProblemList embedded />;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div
        className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        {/* Hamburger Menu Button */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={sidebarOpen ? t('admin.sidebar.collapse') : t('admin.sidebar.expand')}
          >
            <svg
              className="w-6 h-6 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Menu Items */}
        <nav className="p-2">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center px-3 py-3 rounded-lg mb-1 transition-colors ${
                activeTab === item.key
                  ? 'bg-primary text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && (
                <span className="ml-3 font-medium whitespace-nowrap">
                  {t(item.labelKey)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900 overflow-auto transition-colors duration-200">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-primary dark:text-blue-400">
            {t('admin.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t(`admin.menu.${activeTab}`)}
          </p>
        </div>
        <div className="mb-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {t('admin.systemStatus.title')}
                  </div>
                  {systemStatus && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('admin.systemStatus.containerLabel', {
                        id: systemStatus.containerId || 'unknown',
                      })}
                    </div>
                  )}
                </div>
                <div
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    throttled
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
                  }`}
                >
                  <span className="mr-1">
                    {throttled ? '⚠️' : '●'}
                  </span>
                  {throttled
                    ? t('admin.systemStatus.status.throttled')
                    : t('admin.systemStatus.status.normal')}
                </div>
              </div>
              {statusError && (
                <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                  {statusError}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {t('admin.systemStatus.cgroupMemory')}
                    </span>
                    <span className="text-xs font-mono text-gray-800 dark:text-gray-100">
                      {cgroupPercent}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cgroupPercent >= 90
                          ? 'bg-red-500'
                          : cgroupPercent >= 70
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, cgroupPercent))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {cgroupUsedHuman || t('admin.systemStatus.notAvailable')}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {t('admin.systemStatus.hostMemory')}
                    </span>
                    <span className="text-xs font-mono text-gray-800 dark:text-gray-100">
                      {hostPercent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        hostPercent >= 90
                          ? 'bg-red-400'
                          : hostPercent >= 70
                            ? 'bg-yellow-400'
                            : 'bg-green-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, hostPercent))}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <span>{t('admin.systemStatus.refreshInterval')}</span>
                  <select
                    value={refreshInterval}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 30000;
                      setRefreshInterval(v);
                    }}
                    className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs"
                  >
                    <option value={15000}>15s</option>
                    <option value={30000}>30s</option>
                    <option value={60000}>60s</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      loadStatus();
                    }}
                    className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {t('admin.systemStatus.refreshNow')}
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t('admin.systemStatus.trendTitle')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.systemStatus.trendSubtitle')}
                </div>
              </div>
              <div
                ref={chartRef}
                style={{ width: '100%', height: '220px' }}
              />
            </div>
          </div>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

export default AdminDashboard;
