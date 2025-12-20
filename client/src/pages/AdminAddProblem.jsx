import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MarkdownEditorWithPreview from '../components/MarkdownEditorWithPreview';

const API_URL = '/api';

function AdminAddProblem() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
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

    const contestId = searchParams.get('contestId');

    const payload = {
      title: form.title,
      description: form.description,
      timeLimit: parseInt(form.timeLimit),
      memoryLimit: parseInt(form.memoryLimit),
      defaultCompileOptions: form.defaultCompileOptions,
      difficulty: form.difficulty,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      config,
      testCases,
      contestId: contestId ? Number(contestId) : undefined
    };

    try {
      await axios.post(`${API_URL}/problems`, payload);
      navigate('/');
    } catch (error) {
      alert(t('problem.add.errorAdding') + ': ' + error.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-primary mb-6">{t('problem.add.title')}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Basic Info */}
        <div className="grid grid-cols-1 gap-6">
            <div>
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">{t('problem.add.problemTitle')}</label>
                <input required type="text" name="title" value={form.title} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">{t('problem.detail.difficulty')}</label>
              <select name="difficulty" value={form.difficulty} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
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
              <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">{t('problem.add.tags')}</label>
              <input
                type="text"
                name="tags"
                value={form.tags}
                onChange={handleChange}
                placeholder={t('problem.add.tagsPlaceholder')}
                className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            
            <div>
                <MarkdownEditorWithPreview
                  value={form.description}
                  onChange={(v) => setForm({ ...form, description: v })}
                  storageKey="problem-add-description"
                  label={t('problem.add.description')}
                  placeholder={t('problem.add.description')}
                  rows={8}
                />
            </div>
        </div>

        {/* Global Limits */}
        <div className="grid grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
            <div>
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">{t('problem.add.defaultTimeLimit')}</label>
                <input required type="number" name="timeLimit" value={form.timeLimit} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">{t('problem.add.memoryLimit')}</label>
                <input required type="number" name="memoryLimit" value={form.memoryLimit} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
        </div>

        {/* Advanced Config */}
        <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded border border-yellow-200 dark:border-yellow-900/30">
            <h3 className="font-bold text-secondary dark:text-yellow-500 mb-3">{t('problem.add.languageSpecific')}</h3>
            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-gray-700 dark:text-gray-300 text-sm mb-1">{t('problem.add.cppTimeLimit')}</label>
                    <input type="number" name="cppTimeLimit" value={form.cppTimeLimit} onChange={handleChange} placeholder="e.g. 500" className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
                <div>
                    <label className="block text-gray-700 dark:text-gray-300 text-sm mb-1">{t('problem.add.pythonTimeLimit')}</label>
                    <input type="number" name="pythonTimeLimit" value={form.pythonTimeLimit} onChange={handleChange} placeholder="e.g. 2000" className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
            </div>
            <div className="mt-4">
                 <label className="block text-gray-700 dark:text-gray-300 text-sm mb-1">{t('problem.add.cppCompileOptions')}</label>
                 <input type="text" name="defaultCompileOptions" value={form.defaultCompileOptions} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
        </div>

        {/* Test Cases */}
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">{t('problem.add.testCases')}</h3>
                <button type="button" onClick={addTestCase} className="text-primary hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold">{t('problem.add.addCase')}</button>
            </div>
            
            {testCases.map((tc, index) => (
                <div key={index} className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded relative bg-gray-50 dark:bg-gray-900">
                    <button type="button" onClick={() => removeTestCase(index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 dark:hover:text-red-400">{t('problem.add.remove')}</button>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{t('problem.add.input')}</label>
                            <textarea value={tc.input} onChange={(e) => handleTestCaseChange(index, 'input', e.target.value)} rows="2" className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"></textarea>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{t('problem.add.expectedOutput')}</label>
                            <textarea value={tc.expectedOutput} onChange={(e) => handleTestCaseChange(index, 'expectedOutput', e.target.value)} rows="2" className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"></textarea>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        <button type="submit" className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 px-4 rounded shadow-lg transition-transform transform hover:scale-[1.01]">
            {t('problem.add.createProblem')}
        </button>

      </form>
    </div>
  );
}

export default AdminAddProblem;
