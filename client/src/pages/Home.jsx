import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';

function Home() {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHomeContent = async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/homepage`);
        setContent(res.data.content || '');
      } catch (e) {
        console.error('Failed to load homepage content', e);
        setError('Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    fetchHomeContent();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-gray-100 min-h-[400px]">
      <div className="prose max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {content || `# ${t('nav.title')}\n\nWelcome to our Online Judge system.`}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default Home;