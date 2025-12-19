import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const API_URL = '/api';

function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [userSubmissions, setUserSubmissions] = useState([]);

  useEffect(() => {
    const key = `contest_access_${id}`;

    const fetchContest = async () => {
      setLoading(true);
      setError('');
      try {
        const [res, attachRes, subRes] = await Promise.all([
          axios.get(`${API_URL}/contests/public/${id}`),
          axios.get(`${API_URL}/contests/public/${id}/attachments`),
          axios.get(`${API_URL}/submissions`, { params: { contest_id: id, limit: 100 } })
        ]);
        setContest(res.data);
        setAttachments(Array.isArray(attachRes.data) ? attachRes.data : []);
        setUserSubmissions(Array.isArray(subRes.data) ? subRes.data : []);
      } catch (e) {
        const status = e.response?.status;
        const message = e.response?.data?.error || 'Failed to load contest';
        setError(message);
        if (status === 403) {
          sessionStorage.removeItem(key);
          sessionStorage.removeItem(`contest_access_meta_${id}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchContest();
  }, [id]);

  const getProblemStyle = (problemId) => {
    if (!contest) return '';
    const subs = userSubmissions.filter(s => s.problemId === problemId);
    const isSubmitted = subs.length > 0;
    const isEnded = new Date() > new Date(contest.endTime);
    
    if (contest.rule === 'OI' && !isEnded) {
      if (isSubmitted) {
        return 'bg-green-100 border-l-4 border-green-500';
      } else {
        return 'bg-red-50 border-l-4 border-red-500';
      }
    } else {
      if (!isSubmitted) return '';
      
      const score = contest.rule === 'OI'
        ? (subs[0]?.score || 0)
        : Math.max(...(subs || []).map(s => s.score || 0));
      if (score === 100) return 'bg-green-100';
      if (score >= 60) return 'bg-yellow-100';
      if (score > 0) return 'bg-orange-100';
      return 'bg-red-100';
    }
  };

  const getSubmittedCount = () => {
    if (!contest || !contest.problems) return 0;
    const submittedProblemIds = new Set((userSubmissions || []).map(s => s.problemId));
    // Filter ids that are actually in the contest problem list
    const contestProblemIds = (contest.problems || []).map(p => p.id);
    let count = 0;
    contestProblemIds.forEach(pid => {
        if (submittedProblemIds.has(pid)) count++;
    });
    return count;
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
            onClick={() => navigate('/contest')}
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

  if (!contest) {
    return null;
  }
  const ended = new Date() > new Date(contest.endTime);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-primary border-b-4 border-secondary inline-block pb-1">
          {contest.name}
        </h2>
        <button
          type="button"
          onClick={() => navigate('/contest')}
          className="text-primary hover:text-blue-700 text-sm"
        >
          {t('contest.detail.backToList')}
        </button>
      </div>

      <div className="bg-white shadow-lg rounded-lg border border-gray-200 mb-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700 mb-4">
          <div>
            <div className="font-semibold">{t('contest.list.startTime')}</div>
            <div>{new Date(contest.startTime).toLocaleString()}</div>
          </div>
          <div>
            <div className="font-semibold">{t('contest.list.endTime')}</div>
            <div>{new Date(contest.endTime).toLocaleString()}</div>
          </div>
          <div>
            <div className="font-semibold">{t('contest.list.participants')}</div>
            <div>{contest.participantCount}</div>
          </div>
          <div>
            <div className="font-semibold">{t('contest.detail.status', { defaultValue: 'Status' })}</div>
            <div className={ended ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>
              {ended ? t('contest.detail.ended', { defaultValue: '已结束' }) : t('contest.detail.ongoing', { defaultValue: '进行中' })}
            </div>
          </div>
          <div>
            <div className="font-semibold">{t('contest.detail.myProgress', { defaultValue: 'My Progress' })}</div>
            <div>
                {contest.rule === 'OI' 
                    ? `${getSubmittedCount()} / ${(contest.problems?.length || 0) - getSubmittedCount()}`
                    : `${getSubmittedCount()} / ${contest.problems?.length || 0}`
                }
            </div>
          </div>
          <div>
            <div className="font-semibold">{t('contest.detail.rule')}</div>
            <div>{contest.rule}</div>
          </div>
        </div>

        <div className="prose max-w-none">
          <h3 className="text-xl font-semibold mb-2 text-secondary">{t('contest.detail.description')}</h3>
          <div className="bg-gray-50 border border-gray-200 rounded p-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              skipHtml={true}
            >
              {contest.description || ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-6">
        <h3 className="text-xl font-semibold mb-4 text-secondary">{t('contest.detail.problems')}</h3>
        {(!contest.problems || contest.problems.length === 0) ? (
          <div className="text-gray-500 text-sm">{t('contest.detail.noProblems')}</div>
        ) : (
          <ul className="space-y-2">
            {contest.problems.map((p, idx) => (
              <li key={p.id} className={`flex items-center justify-between border-b border-gray-100 p-3 rounded ${getProblemStyle(p.id)}`}>
                <div>
                  <div className="font-semibold text-primary">{p.title}</div>
                  <div className="text-xs text-gray-500">{t(`problem.difficulty.${p.difficulty || 'LEVEL2'}`)}</div>
                </div>
                <Link
                  to={`/contest/${id}/problem/${idx}`}
                  className="text-primary hover:text-blue-700 text-sm font-semibold"
                >
                  {t('contest.detail.viewProblem')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-6 mt-6">
        <h3 className="text-xl font-semibold mb-4 text-secondary">{t('contest.detail.attachments')}</h3>
        {(attachments.length === 0) ? (
          <div className="text-gray-500 text-sm">{t('contest.detail.noAttachments')}</div>
        ) : (
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.name} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="text-sm text-gray-700">{a.name}</div>
                <a
                  href={`${API_URL}/contests/public/${id}/attachments/${encodeURIComponent(a.name)}`}
                  className="text-primary hover:text-blue-700 text-sm"
                >
                  {t('contest.detail.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6 flex justify-end space-x-4">
        <Link
          to={`/contest/${id}/submissions`}
          className="inline-block px-4 py-2 bg-secondary text-white rounded shadow hover:bg-green-600 text-sm"
        >
           {t('contest.mySubmissions', { defaultValue: 'My Submissions' })}
        </Link>
        <Link
          to={`/contest/${id}/leaderboard`}
          className="inline-block px-4 py-2 bg-primary text-white rounded shadow hover:bg-blue-600 text-sm"
        >
          {t('contest.leaderboard.button', { defaultValue: t('contest.leaderboard.title', { defaultValue: '排行榜' }) })}
        </Link>
      </div>
    </div>
  );
}

export default ContestDetail;

