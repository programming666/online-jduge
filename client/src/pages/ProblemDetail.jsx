import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { useAuth } from '../context/AuthContext';
import { useUserUI } from '../context/UserUIContext';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const API_URL = '/api';

function ProblemDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences, isDark } = useUserUI();
  const { t } = useTranslation();
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [contestLanguages, setContestLanguages] = useState([]);
  const [debouncedPreferences, setDebouncedPreferences] = useState(preferences);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/problems/${id}`);
        setProblem(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    const loadContestLanguages = async () => {
      const contestId = searchParams.get('contestId');
      if (!contestId) return;
      try {
        const res = await axios.get(`${API_URL}/contests/public/${contestId}`);
        const data = res.data || {};
        if (Array.isArray(data.languages) && data.languages.length > 0) {
          setContestLanguages(data.languages);
          if (!data.languages.includes(language)) {
            const nextLang = data.languages.includes('cpp') ? 'cpp' : data.languages[0];
            setLanguage(nextLang);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    load();
    loadContestLanguages();
  }, [id, searchParams, language]);

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    if (contestLanguages.length > 0 && !contestLanguages.includes(lang)) {
      return;
    }
    setLanguage(lang);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPreferences(preferences);
    }, 500);
    return () => clearTimeout(timer);
  }, [preferences]);

  const editorExtensions = useMemo(() => {
    const lineHeight = debouncedPreferences.lineHeight || 1.5;
    const color = isDark ? '#e5e7eb' : '#111827';
    const exts = [
      language === 'cpp' ? cpp() : python(),
      indentUnit.of(' '.repeat(debouncedPreferences.tabSize)),
      EditorState.tabSize.of(debouncedPreferences.tabSize),
    ];

    exts.push(
      EditorView.theme({
        '&': {
          fontFamily: `${debouncedPreferences.fontFamily}, monospace`,
          fontSize: `${debouncedPreferences.fontSize}px`,
          lineHeight,
          color,
          transition:
            'font-size 300ms ease, font-family 300ms ease, line-height 300ms ease, color 300ms ease',
        },
        '.cm-scroller': {
          fontFamily: `${debouncedPreferences.fontFamily}, monospace`,
          fontSize: `${debouncedPreferences.fontSize}px`,
          lineHeight,
          color,
          transition:
            'font-size 300ms ease, font-family 300ms ease, line-height 300ms ease, color 300ms ease',
        },
        '.cm-content': {
          fontFamily: `${debouncedPreferences.fontFamily}, monospace`,
          fontSize: `${debouncedPreferences.fontSize}px`,
          lineHeight,
          color,
          transition:
            'font-size 300ms ease, font-family 300ms ease, line-height 300ms ease, color 300ms ease',
        },
      }),
    );

    return exts;
  }, [language, debouncedPreferences, isDark]);

  const editorStyle = useMemo(() => {
    const lineHeight = debouncedPreferences.lineHeight || 1.5;
    const color = isDark ? '#e5e7eb' : '#111827';
    return {
      fontFamily: `${debouncedPreferences.fontFamily}, monospace`,
      fontSize: `${debouncedPreferences.fontSize}px`,
      lineHeight,
      color,
      transition:
        'font-size 300ms ease, font-family 300ms ease, line-height 300ms ease, color 300ms ease'
    };
  }, [debouncedPreferences, isDark]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const contestId = searchParams.get('contestId');
      await axios.post(`${API_URL}/submissions`, {
        problemId: id,
        code,
        language,
        contestId: contestId || undefined
      });
      navigate('/submissions');
    } catch (error) {
      alert(t('problem.detail.submissionFailed') + ': ' + (error.response?.data?.error || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (!problem) return <div>{t('common.loading')}</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
        <h2 className="text-3xl font-bold text-primary mb-4">{problem.title}</h2>
        
        <div className="mb-4 text-sm text-gray-600 space-x-4 bg-yellow-50 p-3 rounded">
            <span>{t('problem.detail.timeLimit')}: <strong>{problem.timeLimit} {t('common.unit.ms')}</strong></span>
            <span>{t('problem.detail.memoryLimit')}: <strong>{problem.memoryLimit} {t('common.unit.mb')}</strong></span>
        </div>

        <div className="prose max-w-none">
            <h3 className="text-xl font-semibold mb-2 text-secondary">{t('problem.detail.description')}</h3>
            <div className="text-gray-700 bg-gray-50 p-4 rounded border border-gray-200">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml={true}>
                  {problem.description || ''}
                </ReactMarkdown>
            </div>
        </div>

        {user && typeof user.role === 'string' && user.role.toUpperCase() === 'ADMIN' && (
          <div className="mt-4 flex space-x-3">
            <Link
              to={`/admin/edit/${id}`}
              className="inline-block px-4 py-2 bg-secondary text-white rounded shadow hover:bg-yellow-500"
            >
              {t('common.edit')}
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await axios.post(`${API_URL}/problems/${id}/clone`);
                  const newId = res.data.id;
                  navigate(`/admin/edit/${newId}`);
                } catch (e) {
                  alert(t('problem.detail.copyFailed') + ': ' + (e.response?.data?.error || e.message));
                }
              }}
              className="inline-block px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600"
            >
              {t('common.copy')}
            </button>
            <button
              type="button"
              onClick={async () => {
                const confirmDelete = window.confirm(t('problem.detail.deleteConfirm'));
                if (!confirmDelete) return;
                try {
                  await axios.delete(`${API_URL}/problems/${id}`);
                  navigate('/problems');
                } catch (e) {
                  alert(t('problem.detail.deleteFailed') + ': ' + (e.response?.data?.error || e.message));
                }
              }}
              className="inline-block px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600"
            >
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6 border border-gray-200 dark:border-gray-700 flex flex-col h-[600px] transition-colors duration-200">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">{t('problem.detail.codeEditor')}</h3>
            <select
                value={language}
                onChange={handleLanguageChange}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary transition-colors duration-200"
            >
                {(!contestLanguages.length || contestLanguages.includes('cpp')) && (
                  <option value="cpp">{t('language.cpp')}</option>
                )}
                {(!contestLanguages.length || contestLanguages.includes('python')) && (
                  <option value="python">{t('language.python')}</option>
                )}
            </select>
        </div>
        
        <div
          className="flex-grow border border-gray-300 rounded overflow-auto min-h-0"
          style={editorStyle}
        >
            <CodeMirror
                key={`${debouncedPreferences.fontFamily}-${debouncedPreferences.fontSize}-${debouncedPreferences.tabSize}`}
                value={code}
                height="100%"
                minHeight="200px"
                maxHeight="100%"
                extensions={editorExtensions}
                onChange={(val) => setCode(val)}
                theme={isDark ? dracula : 'light'}
                basicSetup={{
                  lineNumbers: debouncedPreferences.lineNumbers,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: debouncedPreferences.foldGutter,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: debouncedPreferences.matchBrackets,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  defaultKeymap: true,
                  searchKeymap: true,
                  historyKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                  tabSize: debouncedPreferences.tabSize,
                }}
            />
        </div>

        <div className="mt-4 flex justify-end">
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-6 rounded shadow-md transition-colors disabled:opacity-50"
            >
                {submitting ? t('problem.detail.submitting') : t('problem.detail.submitSolution')}
            </button>
        </div>
      </div>
    </div>
  );
}

export default ProblemDetail;
