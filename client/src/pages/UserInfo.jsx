import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as echarts from 'echarts';
import PageTransition from '../components/PageTransition';
import { useTranslation } from 'react-i18next';

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

const ZERO_RGB = 'rgb(230,230,230)';

function alphaColor(rgb, a) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${d.getMonth()+1}`;
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

  useEffect(() => {
    if (!barRef.current) return;
    const chart = echarts.init(barRef.current);
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
    chart.setOption({
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value' },
      tooltip: { trigger: 'axis' },
      series: [{
        type: 'bar',
        data: counts,
        itemStyle: { color: DIFF_RGB.LEVEL5 },
        emphasis: { focus: 'series' }
      }]
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [submissions]);

  useEffect(() => {
    if (!heatRef.current) return;
    (async () => {
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
          data.push({ value: [key, 0], itemStyle: { color: ZERO_RGB } });
        } else {
          const diff = Object.entries(val.accDiffs).sort((a,b)=>b[1]-a[1])[0]?.[0] || val.latestDiff;
          const base = DIFF_RGB[diff] || DIFF_RGB.LEVEL2;
          const a = Math.min(1, 0.2 + (val.count / maxCount) * 0.8);
          data.push({ value: [key, val.count], itemStyle: { color: alphaColor(base, a) } });
        }
      }

      const chart = echarts.init(heatRef.current);
      chart.setOption({
        tooltip: { formatter: (p) => `${p.value[0]}：${p.value[1]} 次` },
        calendar: {
          range: [`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-01`, `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`],
          cellSize: [18, 18],
          left: 40,
          right: 20,
          top: 40,
          bottom: 20,
          itemStyle: { color: ZERO_RGB, borderColor: 'rgb(240,240,240)' },
          yearLabel: { show: false },
          dayLabel: { firstDay: 0, nameMap: ['日','一','二','三','四','五','六'] },
          monthLabel: { nameMap: 'cn' }
        },
        series: [{
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: data
        }]
      });
      const onResize = () => chart.resize();
      window.addEventListener('resize', onResize);
      return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
    })();
  }, [submissions]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-primary dark:text-blue-400">{t('user.info.title')}</h2>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.total')}</div>
            <div className="text-2xl font-bold dark:text-gray-200">{todayStats.total}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.ac')}</div>
            <div className="text-2xl font-bold" style={{ color: DIFF_RGB.LEVEL4 }}>{todayStats.ac}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.wrong')}</div>
            <div className="text-2xl font-bold" style={{ color: DIFF_RGB.LEVEL1 }}>{todayStats.wrong}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('user.info.today.rate')}</div>
            <div className="text-2xl font-bold dark:text-gray-200">{todayStats.rate}%</div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
          <h3 className="text-lg font-semibold mb-2 dark:text-gray-200">{t('user.info.bar.title')}</h3>
          <div ref={barRef} style={{ width: '100%', height: 300 }} />
        </section>

        <section className="bg-white dark:bg-gray-800 rounded shadow p-4 border dark:border-gray-700 transition-colors duration-200">
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
