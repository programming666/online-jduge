import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';
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

function ContestProblem() {
  const { id, order } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences, isDark } = useUserUI();
  const { t } = useTranslation();

  const [contest, setContest] = useState(null);
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('// Write your solution here\n#include <iostream>\n\nint main() {\n    return 0;\n}');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [contestLanguages, setContestLanguages] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [pRes, cRes] = await Promise.all([
          axios.get(`${API_URL}/contests/public/${id}/problem/${order}`),
          axios.get(`${API_URL}/contests/public/${id}`)
        ]);
        setProblem(pRes.data);
        const data = cRes.data || {};
        setContest(data);
        if (Array.isArray(data.languages) && data.languages.length > 0) {
          setContestLanguages(data.languages);
          if (!data.languages.includes(language)) {
            const nextLang = data.languages.includes('cpp') ? 'cpp' : data.languages[0];
            setLanguage(nextLang);
            if (nextLang === 'cpp') {
              setCode('// Write your solution here\n#include <iostream>\n\nint main() {\n    return 0;\n}');
            } else if (nextLang === 'python') {
              setCode('# Write your solution here\nimport sys\n\n# Read from stdin');
            }
          }
        }
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load problem');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, order, language]);

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    if (contestLanguages.length > 0 && !contestLanguages.includes(lang)) {
      return;
    }
    setLanguage(lang);
    if (lang === 'cpp') {
      setCode('');
    } else {
      setCode('# Write your solution here\nimport sys\n\n# Read from stdin');
    }
  };

  const handleSubmit = async () => {
    const ended = contest && contest.rule === 'OI' && (new Date() > new Date(contest.endTime));
    if (ended) {
      alert(t('contest.detail.ended', { defaultValue: '比赛已结束' }));
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/submissions`, {
        problemId: problem.id,
        code,
        language,
        contestId: id
      });
      navigate('/submissions');
    } catch (error) {
      alert(t('problem.detail.submissionFailed') + ': ' + (error.response?.data?.error || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div>{t('common.loading')}</div>;
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate(`/contest/${id}`)}
            className="text-primary hover:text-blue-700 text-sm"
          >
            {t('contest.detail.backToList')}
          </button>
        </div>
        <div className="p-6 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }
  if (!problem) return null;
  const ended = contest && contest.rule === 'OI' && (new Date() > new Date(contest.endTime));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold text-primary">{problem.title}</h2>
          <div className="flex items-center gap-3">
            <Link to={`/contest/${id}`} className="text-primary hover:text-blue-700 text-sm">
              {t('contest.detail.backToList')}
            </Link>
            <Link
              to={`/contest/${id}/leaderboard`}
              className="px-4 py-2 bg-primary text-white rounded shadow text-sm hover:bg-blue-600"
            >
              {t('contest.leaderboard.button', { defaultValue: t('contest.leaderboard.title', { defaultValue: '排行榜' }) })}
            </Link>
          </div>
        </div>

        {contest && (
          <div className="mb-4 text-sm">
            <span className="font-semibold mr-2">{t('contest.detail.status', { defaultValue: 'Status' })}:</span>
            <span className={ended ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>
              {ended ? t('contest.detail.ended', { defaultValue: '已结束' }) : t('contest.detail.ongoing', { defaultValue: '进行中' })}
            </span>
          </div>
        )}

        <div className="mb-4 text-sm text-gray-600 space-x-4 bg-yellow-50 p-3 rounded">
          <span>
            {t('problem.detail.timeLimit')}: <strong>{problem.timeLimit} {t('common.unit.ms')}</strong>
          </span>
          <span>
            {t('problem.detail.memoryLimit')}: <strong>{problem.memoryLimit} {t('common.unit.mb')}</strong>
          </span>
        </div>

        <div className="prose max-w-none">
          <h3 className="text-xl font-semibold mb-2 text-secondary">{t('problem.detail.description')}</h3>
          <div className="text-gray-700 bg-gray-50 p-4 rounded border border-gray-200">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml={true}>
              {problem.description || ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200 flex flex-col h-[600px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-700">{t('problem.detail.codeEditor')}</h3>
          <select
            value={language}
            onChange={handleLanguageChange}
            className="border border-gray-300 rounded px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {(!contestLanguages.length || contestLanguages.includes('cpp')) && (
              <option value="cpp">{t('language.cpp')}</option>
            )}
            {(!contestLanguages.length || contestLanguages.includes('python')) && (
              <option value="python">{t('language.python')}</option>
            )}
          </select>
        </div>

        <div className="flex-grow border border-gray-300 rounded overflow-auto min-h-0" style={{ fontFamily: `${preferences.fontFamily}, monospace`, fontSize: `${preferences.fontSize}px` }}>
          <CodeMirror
            value={code}
            height="100%"
            minHeight="200px"
            maxHeight="100%"
            extensions={[
              language === 'cpp' ? cpp() : python(),
              indentUnit.of(" ".repeat(preferences.tabSize)),
              EditorState.tabSize.of(preferences.tabSize),
              EditorView.theme({
                "&": { fontFamily: `${preferences.fontFamily}, monospace` },
                ".cm-scroller": { fontFamily: `${preferences.fontFamily}, monospace` },
                ".cm-content": { fontFamily: `${preferences.fontFamily}, monospace` }
              })
            ]}
            onChange={(val) => setCode(val)}
            theme={isDark ? dracula : 'light'}
            basicSetup={{
              lineNumbers: preferences.lineNumbers,
              highlightActiveLineGutter: true,
              highlightSpecialChars: true,
              history: true,
              foldGutter: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              syntaxHighlighting: true,
              bracketMatching: true,
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
            }}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || ended}
            className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-6 rounded shadow-md transition-colors disabled:opacity-50"
          >
            {ended
              ? t('contest.detail.ended', { defaultValue: '比赛已结束' })
              : (submitting ? t('problem.detail.submitting') : t('problem.detail.submitSolution'))
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContestProblem;
