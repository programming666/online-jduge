import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as echarts from 'echarts';
import { useNavigate } from 'react-router-dom';
import PageTransition from '../components/PageTransition';
import { useTranslation } from 'react-i18next';
import { useUserUI } from '../context/UserUIContext';
import Button from '../components/ui/Button';

const API_URL = '/api';

const DIFF_RGB = {
  LEVEL1: 'rgb(254, 76, 97)',
  LEVEL2: 'rgb(243, 156, 17)',
  LEVEL3: 'rgb(255, 193, 22)',
  LEVEL4: 'rgb(83, 196, 26)',
  LEVEL5: 'rgb(52, 152, 219)',
  LEVEL6: 'rgb(156, 61, 207)',
  LEVEL7: 'rgb(14, 29, 105)'
};

function alphaColor(rgb, a) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

async function fetchProblemDifficulty(ids) {
  const out = new Map();
  const unique = Array.from(new Set(ids));
  await Promise.all(unique.map(async (id) => {
    try {
      const res = await axios.get(`${API_URL}/problems/${id}`);
      out.set(id, res.data?.difficulty || 'LEVEL2');
    } catch (_) {
      out.set(id, 'LEVEL2');
    }
  }));
  return out;
}

function UserInfo() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const barRef = useRef(null);
  const heatRef = useRef(null);
  const { t } = useTranslation();
  const { isDark } = useUserUI();
  const navigate = useNavigate();

  // Dynamic colors based on theme
  const colors = useMemo(() => ({
    zero: isDark ? '#374151' : '#e5e7eb', // gray-700 : gray-200
    text: isDark ? '#9ca3af' : '#4b5563', // gray-400 : gray-600
    bg: isDark ? '#1f2937' : '#ffffff',   // gray-800 : white
    split: isDark ? '#1f2937' : '#ffffff' // gap color matching bg
  }), [isDark]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/submissions`, { params: { limit: 1000 } });
        const arr = Array.isArray(res.data) ? res.data : [];
        setSubmissions(arr);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const todayStats = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    let total = 0, ac = 0, wrong = 0;
    submissions.forEach(s => {
      const t = new Date(s.createdAt);
      if (t.getFullYear() === y && t.getMonth() === m && t.getDate() === d) {
        total++;
        const st = (s.status || '').toLowerCase().replace(/\s+/g, '');
        if (st === 'accepted') ac++;
        else if (st && st !== 'pending' && st !== 'submitted') wrong++;
      }
    });
    const rate = total > 0 ? Math.round(ac * 1000 / total) / 10 : 0;
    return { total, ac, wrong, rate };
  }, [submissions]);

  // Bar Chart
  useEffect(() => {
    if (!barRef.current) return;
    
    let chartInstance = null;
    let resizeHandler = null;

    const initChart = () => {
      if (!barRef.current) return;
      
      const now = new Date();
      const months = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}年${d.getMonth()+1}月`);
      }
      const counts = Array(5).fill(0);
      submissions.forEach(s => {
        const t = new Date(s.createdAt);
        const diffMonths = (now.getFullYear()*12 + now.getMonth()) - (t.getFullYear()*12 + t.getMonth());
        if (diffMonths >=0 && diffMonths < 5) counts[4-diffMonths]++;
      });
      
      // Dispose existing instance if any
      const existing = echarts.getInstanceByDom(barRef.current);
      if (existing) existing.dispose();

      const chart = echarts.init(barRef.current);
      chartInstance = chart;
      
      chart.setOption({
        grid: { left: 40, right: 20, top: 20, bottom: 40 },
        xAxis: { 
          type: 'category', 
          data: months,
          axisLabel: { color: colors.text }
        },
        yAxis: { 
          type: 'value',
          axisLabel: { color: colors.text },
          splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
        },
        tooltip: { 
          trigger: 'axis',
          backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
        },
        series: [{
          type: 'bar',
          data: counts,
          itemStyle: { color: DIFF_RGB.LEVEL5, borderRadius: [4, 4, 0, 0] },
          emphasis: { focus: 'series' }
        }]
      });
      
      resizeHandler = () => chart.resize();
      window.addEventListener('resize', resizeHandler);
    };

    initChart();

    return () => {
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (chartInstance) chartInstance.dispose();
    };
  }, [submissions, colors, isDark]);

  // Heatmap
  useEffect(() => {
    if (!heatRef.current) return;
    
    let chartInstance = null;
    let resizeHandler = null;

    const renderChart = async () => {
      if (!heatRef.current) return;

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth()-4, 1);
      const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

      const inRange = submissions.filter(s => {
        const t = new Date(s.createdAt);
        return t >= start && t <= end;
      });
      const byDay = new Map();
      const problems = inRange.map(s => s.problemId);
      const diffMap = await fetchProblemDifficulty(problems);
      inRange.forEach(s => {
        const d = new Date(s.createdAt);
        const key = d.toISOString().slice(0,10);
        const cur = byDay.get(key) || { count: 0, accDiffs: {}, latestDiff: 'LEVEL2' };
        cur.count++;
        const diff = diffMap.get(s.problemId) || 'LEVEL2';
        cur.latestDiff = diff;
        cur.accDiffs[diff] = (cur.accDiffs[diff] || 0) + 1;
        byDay.set(key, cur);
      });
      const maxCount = Math.max(1, ...Array.from(byDay.values()).map(v => v.count));
      const data = [];
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)) {
        const key = dt.toISOString().slice(0,10);
        const val = byDay.get(key);
        if (!val) {
          data.push({ value: [key, 0], itemStyle: { color: colors.zero } });
        } else {
          const diff = Object.entries(val.accDiffs).sort((a,b)=>b[1]-a[1])[0]?.[0] || val.latestDiff;
          const base = DIFF_RGB[diff] || DIFF_RGB.LEVEL2;
          const a = Math.min(1, 0.2 + (val.count / maxCount) * 0.8);
          data.push({ value: [key, val.count], itemStyle: { color: alphaColor(base, a) } });
        }
      }

      // Dispose existing instance if any
      const existing = echarts.getInstanceByDom(heatRef.current);
      if (existing) existing.dispose();

      const chart = echarts.init(heatRef.current);
      chartInstance = chart;
      
      chart.setOption({
        tooltip: { 
          formatter: (p) => `${p.value[0]}：${p.value[1]} 次`,
          backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' },
          padding: [8, 12],
          extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 8px;'
        },
        calendar: {
          range: [`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-01`, `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`],
          cellSize: [22, 22],
          left: 40,
          right: 20,
          top: 40,
          bottom: 20,
          itemStyle: { 
            color: 'transparent', 
            borderColor: 'transparent',
            borderWidth: 0
          },
          splitLine: { show: false },
          yearLabel: { show: false },
          dayLabel: { 
            firstDay: 0, 
            nameMap: ['日','一','二','三','四','五','六'],
            color: colors.text
          },
          monthLabel: { 
            nameMap: 'cn',
            color: colors.text
          }
        },
        series: [{
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: data,
          itemStyle: {
            borderRadius: 10,
            borderColor: colors.split,
            borderWidth: 3
          }
        }]
      });
      
      resizeHandler = () => chart.resize();
      window.addEventListener('resize', resizeHandler);
    };

    renderChart();

    return () => {
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (chartInstance) chartInstance.dispose();
    };
  }, [submissions, colors, isDark]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-primary dark:text-blue-400">{t('user.info.title')}</h2>
          <Button onClick={() => navigate('/user/code')} variant="outline" size="sm">
            {t('user.menu.code')}
          </Button>
        </div>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.total')}</div>
            <div className="text-2xl font-bold dark:text-gray-200">{todayStats.total}</div>
          </div>
          <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.ac')}</div>
            <div className="text-2xl font-bold" style={{ color: DIFF_RGB.LEVEL4 }}>{todayStats.ac}</div>
          </div>
          <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.wrong')}</div>
            <div className="text-2xl font-bold" style={{ color: DIFF_RGB.LEVEL1 }}>{todayStats.wrong}</div>
          </div>
          <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.rate')}</div>
            <div className="text-2xl font-bold dark:text-gray-200">{todayStats.rate}%</div>
          </div>
        </section>

        <section className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
          <h3 className="text-lg font-semibold mb-2 dark:text-gray-200">{t('user.info.bar.title')}</h3>
          <div ref={barRef} style={{ width: '100%', height: 300 }} />
        </section>

        <section className="bg-surface dark:bg-surface-dark rounded-xl shadow-card p-4 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold dark:text-gray-200">{t('user.info.heat.title')}</h3>
            <span className="text-sm text-gray-400">{t('user.info.heat.note')}</span>
          </div>
          <div ref={heatRef} style={{ width: '100%', height: 280 }} />
        </section>
      </div>
    </PageTransition>
  );
}

export default UserInfo;
