import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MarkdownEditorWithPreview from '../components/MarkdownEditorWithPreview';

const API_URL = 'http://localhost:3000/api';

function AdminEditProblem() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    timeLimit: 1000,
    memoryLimit: 128,
    defaultCompileOptions: '-O2',
    difficulty: 'LEVEL2',
    tags: '',
    cppTimeLimit: '',
    pythonTimeLimit: ''
  });

  const [testCases, setTestCases] = useState([{ input: '', expectedOutput: '' }]);

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        const res = await axios.get(`${API_URL}/problems/${id}/admin`);
        const data = res.data;

        setForm({
          title: data.title,
          description: data.description,
          timeLimit: data.timeLimit,
          memoryLimit: data.memoryLimit,
          defaultCompileOptions: data.defaultCompileOptions,
          difficulty: data.difficulty || 'LEVEL2',
          tags: (data.tags || []).join(', '),
          cppTimeLimit: data.config && data.config.cpp ? data.config.cpp.timeLimit : '',
          pythonTimeLimit: data.config && data.config.python ? data.config.python.timeLimit : ''
        });

        if (data.testCases && data.testCases.length > 0) {
          setTestCases(
            (data.testCases || []).map((tc) => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput
            }))
          );
        } else {
          setTestCases([{ input: '', expectedOutput: '' }]);
        }

        setLoading(false);
      } catch (e) {
        setError(e.response?.data?.error || t('problem.edit.errorUpdating'));
        setLoading(false);
      }
    };

    fetchProblem();
  }, [id]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleTestCaseChange = (index, field, value) => {
    const newTestCases = [...testCases];
    newTestCases[index][field] = value;
    setTestCases(newTestCases);
  };

  const addTestCase = () => {
    setTestCases([...testCases, { input: '', expectedOutput: '' }]);
  };

  const removeTestCase = (index) => {
    const newTestCases = testCases.filter((_, i) => i !== index);
    setTestCases(newTestCases);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const config = {};
    if (form.cppTimeLimit) {
      config.cpp = { timeLimit: parseInt(form.cppTimeLimit) };
    }
    if (form.pythonTimeLimit) {
      config.python = { timeLimit: parseInt(form.pythonTimeLimit) };
    }

    const payload = {
      title: form.title,
      description: form.description,
      timeLimit: parseInt(form.timeLimit),
      memoryLimit: parseInt(form.memoryLimit),
      defaultCompileOptions: form.defaultCompileOptions,
      difficulty: form.difficulty,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      config,
      testCases
    };

    try {
      await axios.put(`${API_URL}/problems/${id}`, payload);
      navigate(`/problem/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || t('problem.edit.errorUpdating'));
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto p-8">{t('common.loading')}</div>;
  }

  if (error) {
    return <div className="max-w-4xl mx-auto p-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-primary mb-6">{t('problem.edit.title')} #{id}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-gray-700 font-bold mb-2">{t('problem.add.problemTitle')}</label>
            <input required type="text" name="title" value={form.title} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none" />
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">{t('problem.detail.difficulty')}</label>
              <select name="difficulty" value={form.difficulty} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none">
                <option value="LEVEL1">{t('problem.difficulty.LEVEL1')}</option>
                <option value="LEVEL2">{t('problem.difficulty.LEVEL2')}</option>
                <option value="LEVEL3">{t('problem.difficulty.LEVEL3')}</option>
                <option value="LEVEL4">{t('problem.difficulty.LEVEL4')}</option>
                <option value="LEVEL5">{t('problem.difficulty.LEVEL5')}</option>
                <option value="LEVEL6">{t('problem.difficulty.LEVEL6')}</option>
                <option value="LEVEL7">{t('problem.difficulty.LEVEL7')}</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">{t('problem.add.tags')}</label>
              <input
                type="text"
                name="tags"
                value={form.tags}
                onChange={handleChange}
                placeholder={t('problem.add.tagsPlaceholder')}
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            
            <div>
              <MarkdownEditorWithPreview
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                storageKey={`problem-edit-description-${id}`}
                label={t('problem.add.description')}
                placeholder={t('problem.add.description')}
                rows={8}
              />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded border border-gray-200">
          <div>
            <label className="block text-gray-700 font-bold mb-2">{t('problem.add.defaultTimeLimit')}</label>
            <input
              required
              type="number"
              name="timeLimit"
              value={form.timeLimit}
              onChange={handleChange}
              className="w-full border border-gray-300 p-2 rounded"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-bold mb-2">{t('problem.add.memoryLimit')}</label>
            <input
              required
              type="number"
              name="memoryLimit"
              value={form.memoryLimit}
              onChange={handleChange}
              className="w-full border border-gray-300 p-2 rounded"
            />
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
          <h3 className="font-bold text-secondary mb-3">{t('problem.add.languageSpecific')}</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 text-sm mb-1">{t('problem.add.cppTimeLimit')}</label>
              <input
                type="number"
                name="cppTimeLimit"
                value={form.cppTimeLimit}
                onChange={handleChange}
                placeholder="e.g. 500"
                className="w-full border border-gray-300 p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm mb-1">{t('problem.add.pythonTimeLimit')}</label>
              <input
                type="number"
                name="pythonTimeLimit"
                value={form.pythonTimeLimit}
                onChange={handleChange}
                placeholder="e.g. 2000"
                className="w-full border border-gray-300 p-2 rounded"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-gray-700 text-sm mb-1">{t('problem.add.cppCompileOptions')}</label>
            <input
              type="text"
              name="defaultCompileOptions"
              value={form.defaultCompileOptions}
              onChange={handleChange}
              className="w-full border border-gray-300 p-2 rounded font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-700">{t('problem.add.testCases')}</h3>
            <button
              type="button"
              onClick={addTestCase}
              className="text-primary hover:text-blue-700 font-bold"
            >
              {t('problem.add.addCase')}
            </button>
          </div>

          {testCases.map((tc, index) => (
            <div key={index} className="mb-4 p-4 border border-gray-200 rounded relative bg-gray-50">
              <button
                type="button"
                onClick={() => removeTestCase(index)}
                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
              >
                {t('problem.add.remove')}
              </button>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">{t('problem.add.input')}</label>
                  <textarea
                    value={tc.input}
                    onChange={(e) => handleTestCaseChange(index, 'input', e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 p-2 rounded font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">{t('problem.add.expectedOutput')}</label>
                  <textarea
                    value={tc.expectedOutput}
                    onChange={(e) => handleTestCaseChange(index, 'expectedOutput', e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 p-2 rounded font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 px-4 rounded shadow-lg transition-transform transform hover:scale-[1.01]"
        >
          {t('problem.edit.updateProblem')}
        </button>
      </form>
    </div>
  );
}

export default AdminEditProblem;
