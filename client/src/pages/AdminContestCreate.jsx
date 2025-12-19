import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

const API_URL = '/api';

const DIFFICULTIES = ['LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5', 'LEVEL6', 'LEVEL7'];
const RULES = ['OI', 'IOI', 'ACM'];

function AdminContestCreate() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState({
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    rule: 'OI',
    languages: ['cpp', 'python'],
    isPublished: false,
    password: ''
  });

  const [problems, setProblems] = useState([]);
  const [selectedProblems, setSelectedProblems] = useState([]);
  const [difficulty, setDifficulty] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProblems = async () => {
    setLoadingProblems(true);
    setError('');
    try {
      const params = {};
      if (difficulty) params.difficulty = difficulty;
      if (search) params.search = search.trim();
      const tags = tagFilter.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) params.tags = tags.join(',');

      const res = await axios.get(`${API_URL}/problems`, { params });
      setProblems(res.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load problems');
    } finally {
      setLoadingProblems(false);
    }
  };

  useEffect(() => {
    loadProblems();
  }, []);

  useEffect(() => {
    const loadContest = async () => {
      if (!id) return;
      setError('');
      try {
        const res = await axios.get(`${API_URL}/contests/${id}`);
        const data = res.data || {};
        const toInputValue = (value) => {
          if (!value) return '';
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) return '';
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          return `${y}-${m}-${day}T${h}:${min}`;
        };

        setForm({
          name: data.name || '',
          description: data.description || '',
          startTime: toInputValue(data.startTime),
          endTime: toInputValue(data.endTime),
          rule: data.rule || 'OI',
          languages: Array.isArray(data.languages) && data.languages.length > 0 ? data.languages : ['cpp', 'python'],
          isPublished: !!data.isPublished,
          password: ''
        });

        const contestProblems = Array.isArray(data.problems) ? data.problems : [];
        const idsFromContest = (contestProblems || [])
          .map((cp) => {
            if (typeof cp.problemId === 'number') return cp.problemId;
            if (cp.problem && typeof cp.problem.id === 'number') return cp.problem.id;
            return null;
          })
          .filter((v) => v !== null);
        setSelectedProblems(idsFromContest);
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load contest');
      }
    };

    if (isEdit) {
      loadContest();
    }
  }, [id, isEdit]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'languages') {
      const lang = value;
      let next = form.languages || [];
      if (checked) {
        if (!next.includes(lang)) {
          next = [...next, lang];
        }
      } else {
        next = next.filter((x) => x !== lang);
      }
      if (next.length === 0) {
        return;
      }
      setForm({ ...form, languages: next });
      return;
    }

    if (name === 'isPublished') {
      setForm({ ...form, isPublished: type === 'checkbox' ? checked : !!value });
      return;
    }

    setForm({ ...form, [name]: value });
  };

  const toggleProblem = (id) => {
    setSelectedProblems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const validate = () => {
    if (!form.name.trim()) {
      setError(t('contest.create.nameRequired'));
      return false;
    }
    if (!form.startTime || !form.endTime) {
      setError(t('contest.create.timeRequired'));
      return false;
    }
    const start = new Date(form.startTime);
    const end = new Date(form.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError(t('contest.create.timeInvalid'));
      return false;
    }
    if (!RULES.includes(form.rule)) {
      setError(t('contest.create.ruleRequired'));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!validate()) return;

    if (!window.confirm(isEdit ? t('contest.edit.submitConfirm') : t('contest.create.submitConfirm'))) return;

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        rule: form.rule,
        problemIds: selectedProblems,
        languages: form.languages,
        isPublished: form.isPublished,
        password: form.password
      };

      if (isEdit) {
        await axios.put(`${API_URL}/contests/${id}`, payload);
      } else {
        await axios.post(`${API_URL}/contests`, payload);
      }
      setMessage(isEdit ? t('contest.edit.success') : t('contest.create.success'));
    } catch (e) {
      setError(e.response?.data?.error || t('contest.create.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h2 className="text-2xl font-bold text-primary mb-4">
          {isEdit ? t('contest.edit.title') : t('contest.create.title')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('contest.create.name')}</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleFormChange}
              required
              className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('contest.create.description')}</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleFormChange}
              rows="3"
              className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">语言限制</label>
              <div className="flex items-center space-x-4">
                <label className="inline-flex items-center space-x-1 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="languages"
                    value="cpp"
                    checked={form.languages.includes('cpp')}
                    onChange={handleFormChange}
                  />
                  <span>C++</span>
                </label>
                <label className="inline-flex items-center space-x-1 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="languages"
                    value="python"
                    checked={form.languages.includes('python')}
                    onChange={handleFormChange}
                  />
                  <span>Python</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">发布状态</label>
              <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="isPublished"
                  checked={form.isPublished}
                  onChange={handleFormChange}
                />
                <span>{form.isPublished ? '已发布' : '未发布'}</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">比赛密码（可选）</label>
            <input
              type="text"
              name="password"
              value={form.password}
              onChange={handleFormChange}
              placeholder="留空表示无密码或保持原密码"
              className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('contest.create.startTime')}</label>
              <input
                type="datetime-local"
                name="startTime"
                value={form.startTime}
                onChange={handleFormChange}
                required
                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('contest.create.endTime')}</label>
              <input
                type="datetime-local"
                name="endTime"
                value={form.endTime}
                onChange={handleFormChange}
                required
                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('contest.create.rule')}</label>
            <select
              name="rule"
              value={form.rule}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
            >
              {RULES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded bg-primary text-white font-semibold hover:bg-blue-600 disabled:opacity-60"
          >
            {submitting ? t('common.loading') : (isEdit ? t('contest.edit.submit') : t('contest.create.submit'))}
          </button>

          {message && <div className="mt-2 text-sm text-green-600">{message}</div>}
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </form>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">{t('contest.create.problemBank')}</h3>

        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder={t('problem.list.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="">{t('problem.list.allDifficulties')}</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{t(`problem.difficulty.${d}`)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t('contest.create.tagPlaceholder')}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="min-w-[180px] border border-gray-300 rounded p-2 focus:ring-2 focus:ring-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={loadProblems}
            className="px-4 py-2 rounded bg-primary text-white font-semibold hover:bg-blue-600"
          >
            {t('common.search')}
          </button>
        </div>

        {loadingProblems ? (
          <div className="text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full leading-normal text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 border-b bg-gray-100">
                    {t('contest.create.select')}
                  </th>
                  <th className="px-4 py-2 border-b bg-gray-100">{t('problem.list.id')}</th>
                  <th className="px-4 py-2 border-b bg-gray-100">{t('problem.list.problemTitle')}</th>
                  <th className="px-4 py-2 border-b bg-gray-100">{t('problem.list.difficulty')}</th>
                  <th className="px-4 py-2 border-b bg-gray-100">{t('contest.create.tags')}</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border-b text-center">
                      <input
                        type="checkbox"
                        checked={selectedProblems.includes(p.id)}
                        onChange={() => toggleProblem(p.id)}
                      />
                    </td>
                    <td className="px-4 py-2 border-b">{p.id}</td>
                    <td className="px-4 py-2 border-b">{p.title}</td>
                    <td className="px-4 py-2 border-b">
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                        {t(`problem.difficulty.${p.difficulty || 'LEVEL2'}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b">
                      {(p.tags || []).join(', ')}
                    </td>
                  </tr>
                ))}
                {problems.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-4 py-4 text-center text-gray-500">
                      {t('problem.list.noProblems')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminContestCreate;

