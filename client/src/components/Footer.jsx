import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const API_URL = '/api';

function Footer() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFooter = async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/footer`);
        setContent(res.data.content || '');
      } catch (e) {
        // Silent fail - footer is optional
        console.error('Failed to load footer:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchFooter();
  }, []);

  if (loading || !content) {
    return null;
  }

  return (
    <footer className="bg-gray-100 border-t border-gray-200 mt-auto">
      <div className="container mx-auto px-6 py-4">
        <div className="prose prose-sm max-w-none text-center text-gray-600">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </footer>
  );
}

export default Footer;