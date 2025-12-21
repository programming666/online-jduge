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
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

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
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testError, setTestError] = useState('');
  const [testing, setTesting] = useState(false);

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
    <div className="min-h-[calc(100vh-5rem)] flex flex-col gap-4">
      <Card className="flex-none overflow-y-auto border border-gray-200 dark:border-gray-700">
        <div className="p-4 md:p-6">
          <h2 className="text-2xl md:text-3xl font-bold text-primary mb-4">{problem.title}</h2>

          <div className="mb-4 text-xs md:text-sm text-gray-600 dark:text-gray-300 space-x-0 md:space-x-4 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded flex flex-col md:flex-row gap-2 md:gap-4">
            <span>
              {t('problem.detail.timeLimit')}: <strong>{problem.timeLimit} {t('common.unit.ms')}</strong>
            </span>
            <span>
              {t('problem.detail.memoryLimit')}: <strong>{problem.memoryLimit} {t('common.unit.mb')}</strong>
            </span>
          </div>

          <div className="prose max-w-none">
            <h3 className="text-lg md:text-xl font-semibold mb-2 text-secondary">{t('problem.detail.description')}</h3>
            <div className="text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/40 p-4 rounded border border-gray-200 dark:border-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml={true}>
                {problem.description || ''}
              </ReactMarkdown>
            </div>
          </div>

          {user && typeof user.role === 'string' && user.role.toUpperCase() === 'ADMIN' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={`/admin/edit/${id}`}
                className="inline-flex px-4 py-2 bg-secondary text-white rounded shadow hover:bg-yellow-500 text-sm"
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
                className="inline-flex px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600 text-sm"
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
                className="inline-flex px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600 text-sm"
              >
                {t('common.delete')}
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <Card className="flex-1 min-h-0 flex flex-col border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-base md:text-lg font-semibold text-gray-700 dark:text-gray-200">
              {t('problem.detail.codeEditor')}
            </h3>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
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
            className="flex-1 min-h-0 border-t border-gray-200 dark:border-gray-700"
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

          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? t('problem.detail.submitting') : t('problem.detail.submitSolution')}
            </Button>
          </div>
        </Card>

        <div className="flex-none h-64 md:h-72 flex flex-col md:flex-row gap-4">
          <Card className="flex-1 flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t('problemTest.inputTitle')}
              </span>
              <Button
                size="sm"
                onClick={async () => {
                  setTestError('');
                  setTestStatus('');
                  setTesting(true);
                  setTestOutput('');
                  try {
                    const res = await axios.post(`${API_URL}/run`, {
                      problemId: Number(id),
                      code,
                      language,
                      input: testInput,
                    });
                    const data = res.data || {};
                    setTestStatus(typeof data.status === 'string' ? data.status : '');
                    if (typeof data.output === 'string' && data.output.trim() !== '') {
                      setTestOutput(data.output);
                    } else {
                      setTestOutput('');
                    }
                  } catch (err) {
                    if (err.response && err.response.status === 429) {
                      setTestError(t('problemTest.rateLimited'));
                    } else {
                      const msg = err.response?.data?.error || err.message || '';
                      setTestError(msg ? `${t('problemTest.error')}: ${msg}` : t('problemTest.error'));
                    }
                  } finally {
                    setTesting(false);
                  }
                }}
                loading={testing}
                disabled={testing || !code}
              >
                {t('problemTest.runButton')}
              </Button>
            </div>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="flex-1 w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-0 outline-none resize-none"
              placeholder=""
            />
          </Card>

          <Card className="flex-1 flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t('problemTest.outputTitle')}
              </span>
              {testStatus && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                  {testStatus}
                </span>
              )}
            </div>
            <pre className="flex-1 px-3 py-2 text-xs md:text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-auto whitespace-pre-wrap break-words">
              {testOutput || t('problemTest.noOutput')}
            </pre>
            {testError && (
              <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 border-t border-gray-200 dark:border-gray-700">
                {testError}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ProblemDetail;
