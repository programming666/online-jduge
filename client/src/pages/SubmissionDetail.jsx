import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { dracula } from '@uiw/codemirror-theme-dracula';
import * as Diff from 'diff';

const API_URL = '/api';

const DiffViewer = ({ actual, expected }) => {
  const { t } = useTranslation();

  const actualStr = actual || '';
  const expectedStr = expected || '';

  const normalize = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const expectedLines = normalize(expectedStr).split('\n');
  const actualLines = normalize(actualStr).split('\n');

  let sameLines = 0;
  expectedLines.forEach((line, idx) => {
    if (line === (actualLines[idx] ?? '')) {
      sameLines += 1;
    }
  });
  const differentLines = expectedLines.length - sameLines;

  const diff = Diff.diffLines(expectedStr, actualStr);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-4 text-xs font-bold">
        <span className="text-green-600 bg-green-50 px-2 py-1 rounded">{t('problem.detail.diffSame')}: {sameLines}</span>
        <span className="text-red-600 bg-red-50 px-2 py-1 rounded">{t('problem.detail.diffDifferent')}: {differentLines}</span>
      </div>
      <div className="font-mono text-xs border rounded overflow-auto max-h-64 whitespace-pre bg-white">
        {diff?.map((part, index) => {
          const color = part.added ? 'bg-green-100 text-green-800' :
                        part.removed ? 'bg-red-100 text-red-800' :
                        'text-gray-600';
          const prefix = part.added ? '+' : part.removed ? '-' : ' ';

          const lines = part.value?.split('\n') || [];

          return lines.map((line, lineIndex) => {
            if (lineIndex === lines.length - 1 && line === '' && lines.length > 1) return null;

            return (
              <div key={`${index}-${lineIndex}`} className={`${color} px-2 py-0.5 w-full flex`}>
                <span className="select-none w-4 inline-block text-center mr-2 opacity-50 font-bold">{prefix}</span>
                <span>{line}</span>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};

function SubmissionDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tests');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const fetchSubmission = () => {
    axios.get(`${API_URL}/submissions/${id}`)
      .then(res => {
        setSubmission(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Failed to load submission');
        setLoading(false);
      });
  };

  const hasTestCases = submission?.testCaseResults && submission.testCaseResults.length > 0;
  const hasExpectedOutput = submission?.testCaseResults && submission.testCaseResults.some(result => result.expectedOutput);

  useEffect(() => {
    if (!hasTestCases) {
      setActiveTab('code');
    }
  }, [hasTestCases]);

  if (loading) return <div className="p-8 text-center">{t('common.loading')}</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!submission) return <div className="p-8 text-center">{t('submission.detail.notFound')}</div>;

  const getStatusColor = (status) => {
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '');
    switch (normalizedStatus) {
      case 'accepted': return 'text-green-600 bg-green-100';
      case 'wronganswer': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'timelimitexceeded': return 'text-orange-600 bg-orange-100';
      case 'compilationerror':
      case 'compileerror': return 'text-yellow-700 bg-yellow-200';
      case 'runtimeerror': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const translateStatus = (status) => {
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '');
    switch (normalizedStatus) {
      case 'accepted': return t('submission.status.accepted');
      case 'wronganswer': return t('submission.status.wrongAnswer');
      case 'pending': return t('submission.status.pending');
      case 'timelimitexceeded': return t('submission.status.timeLimitExceeded');
      case 'memorylimitexceeded': return t('submission.status.memoryLimitExceeded');
      case 'runtimeerror': return t('submission.status.runtimeError');
      case 'compilationerror':
      case 'compileerror': return t('submission.status.compileError');
      default: return status;
    }
  };

  const getResultShortStatus = (status) => {
    switch (status) {
      case 'Accepted': return 'AC';
      case 'Wrong Answer': return 'WA';
      case 'Time Limit Exceeded': return 'TLE';
      case 'Memory Limit Exceeded': return 'MLE';
      case 'Compilation Error': return 'CE';
      case 'Runtime Error': return 'RE';
      case 'System Error': return 'SE';
      case 'Pending': return 'PD';
      default: return status || '-';
    }
  };

  const getResultCardBg = (status) => {
    switch (status) {
      case 'Accepted': return 'bg-green-500';
      case 'Wrong Answer': return 'bg-red-500';
      case 'Time Limit Exceeded': return 'bg-orange-500';
      case 'Memory Limit Exceeded': return 'bg-purple-500';
      case 'Compilation Error': return 'bg-yellow-500';
      case 'Runtime Error': return 'bg-pink-500';
      case 'Pending': return 'bg-gray-400';
      case 'System Error': return 'bg-slate-600';
      default: return 'bg-slate-500';
    }
  };

  const formatMemory = (memoryUsed) => {
    if (memoryUsed === null || memoryUsed === undefined) return '-';
    if (memoryUsed >= 1024) {
      return `${(memoryUsed / 1024).toFixed(2)}${t('common.unit.mb')}`;
    }
    return `${Number(memoryUsed).toFixed(2)}${t('common.unit.kb')}`;
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-primary border-b-4 border-secondary inline-block pb-1">
          {t('submission.detail.title')} #{submission.id}
        </h2>
        <Link to={`/problem/${submission.problem.id}`} className="text-blue-600 hover:underline">
          {t('submission.detail.backToProblem')}
        </Link>
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200 mb-6 p-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="font-semibold text-gray-700">{t('submission.detail.user')}:</span> {submission.user?.username}
          </div>
          <div>
            <span className="font-semibold text-gray-700">{t('submission.detail.problem')}:</span> {submission.problem.title}
          </div>
          <div>
             <span className="font-semibold text-gray-700">{t('submission.detail.language')}:</span> <span className="uppercase">{submission.language}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-700">{t('submission.detail.submittedAt')}:</span> {new Date(submission.createdAt).toLocaleString()}
          </div>
          <div>
            <span className="font-semibold text-gray-700">{t('submission.detail.time')}:</span> {submission.timeUsed ?? 0} {t('common.unit.ms')}
          </div>
          <div>
            <span className="font-semibold text-gray-700">{t('submission.detail.memory')}:</span> {submission.memoryUsed ?? 0} {t('common.unit.kb')}
          </div>
          <div>
             <span className="font-semibold text-gray-700">{t('submission.detail.status')}:</span>
             <span className={`ml-2 px-2 py-1 rounded-full font-bold text-xs ${getStatusColor(submission.status)}`}>
               {translateStatus(submission.status)}
             </span>
          </div>
          <div>
             <span className="font-semibold text-gray-700">{t('submission.detail.score')}:</span>
             <span className="ml-2 font-bold text-lg text-secondary">
               {submission.score ?? 0} / 100
             </span>
          </div>
        </div>

        {submission.status !== 'Accepted' && submission.output && (
            <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-2">{t('submission.detail.outputInfo')}:</h3>
                <pre className="bg-gray-100 p-4 rounded text-sm font-mono whitespace-pre-wrap text-red-600 border border-red-200">
                    {submission.output}
                </pre>
            </div>
        )}

        <div className="mt-6">
          <div className="border-b border-gray-200 mb-4 flex space-x-6">
            {hasTestCases && (
              <button
                type="button"
                onClick={() => setActiveTab('tests')}
                className={`px-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'tests'
                    ? 'border-secondary text-primary'
                    : 'border-transparent text-gray-500 hover:text-primary hover:border-gray-300'
                }`}
              >
                {t('submission.detail.testPoints')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'code'
                  ? 'border-secondary text-primary'
                  : 'border-transparent text-gray-500 hover:text-primary hover:border-gray-300'
              }`}
            >
              {t('submission.detail.sourceCode')}
            </button>
          </div>

          {activeTab === 'code' && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">{t('submission.detail.sourceCode')}:</h3>
              <div className="border rounded overflow-hidden">
                <CodeMirror
                  value={submission.code}
                  height="auto"
                  theme={dracula}
                  extensions={[submission.language === 'cpp' ? cpp() : python()]}
                  readOnly={true}
                  editable={false}
                />
              </div>
            </div>
          )}

          {activeTab === 'tests' && hasTestCases && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">{t('submission.detail.testPoints')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(submission.testCaseResults || []).map((result) => {
                  const shortStatus = getResultShortStatus(result.status);
                  const cardBg = getResultCardBg(result.status);
                  const memoryText = formatMemory(result.memoryUsed);
                  return (
                    <div
                      key={result.id}
                      className={`${cardBg} rounded-lg p-4 text-white shadow flex flex-col justify-between min-h-[120px]`}
                    >
                      <div className="flex justify-between items-start text-sm opacity-80">
                        <span>{t('submission.detail.caseNumber')}{result.id}</span>
                        <span className="font-mono">
                          {result.timeUsed ?? 0}{t('common.unit.ms')}/{memoryText}
                        </span>
                      </div>
                      <div className="mt-4 text-center">
                        <div className="text-3xl font-bold leading-none">{shortStatus}</div>
                        <div className="text-xs mt-1 opacity-80">{translateStatus(result.status)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(hasExpectedOutput || submission.testCaseResults.some((r) => r.output)) && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowDetails((prev) => !prev)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {showDetails ? t('submission.detail.hideDetails') : t('submission.detail.showDetails')}
                  </button>

                  {showDetails && (
                    <div className="mt-3 overflow-x-auto border border-gray-200 rounded">
                      <table className="min-w-full leading-normal text-sm">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-100 text-left font-semibold text-gray-600 uppercase tracking-wider">
                              {t('submission.detail.caseNumber')}
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-100 text-left font-semibold text-gray-600 uppercase tracking-wider">
                              {t('submission.detail.status')}
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-100 text-left font-semibold text-gray-600 uppercase tracking-wider">
                              {t('submission.detail.time')}
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-100 text-left font-semibold text-gray-600 uppercase tracking-wider">
                              {t('submission.detail.memory')}
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-100 text-left font-semibold text-gray-600 uppercase tracking-wider">
                              {t('submission.detail.output')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(submission.testCaseResults || []).map((result) => (
                            <tr key={result.id}>
                              <td className="px-4 py-3 border-b border-gray-200">{result.id}</td>
                              <td className="px-4 py-3 border-b border-gray-200">
                                <span className={`px-2 py-1 rounded-full font-semibold text-xs ${getStatusColor(result.status)}`}>
                                  {translateStatus(result.status)}
                                </span>
                              </td>
                              <td className="px-4 py-3 border-b border-gray-200 text-gray-600">{result.timeUsed} {t('common.unit.ms')}</td>
                              <td className="px-4 py-3 border-b border-gray-200 text-gray-600">{result.memoryUsed ?? 0} {t('common.unit.kb')}</td>
                              <td className="px-4 py-3 border-b border-gray-200 font-mono text-gray-600">
                                <div className="max-w-md overflow-auto max-h-96 whitespace-pre-wrap">
                                  {result.status === 'Wrong Answer' && result.expectedOutput ? (
                                    <DiffViewer actual={result.output} expected={result.expectedOutput} />
                                  ) : (
                                    <>
                                      <div>
                                        <span className="text-xs text-gray-400">{t('submission.detail.actual')}:</span>
                                        <div className="bg-gray-50 p-1 rounded">{result.output}</div>
                                      </div>
                                      {result.expectedOutput && (
                                        <div className="mt-2">
                                          <span className="text-xs text-green-600">{t('submission.detail.expected')}:</span>
                                          <div className="bg-green-50 p-1 rounded border border-green-100">{result.expectedOutput}</div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubmissionDetail;
