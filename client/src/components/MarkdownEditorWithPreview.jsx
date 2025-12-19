import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function MarkdownEditorWithPreview({
  value,
  onChange,
  storageKey,
  label,
  placeholder,
  rows = 8
}) {
  const [previewVisible, setPreviewVisible] = useState(true);
  const [debouncedValue, setDebouncedValue] = useState(value || '');

  useEffect(() => {
    const stored = localStorage.getItem(`${storageKey}:previewVisible`);
    if (stored === 'false') {
      setPreviewVisible(false);
    }
  }, [storageKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value || '');
    }, 150);

    return () => clearTimeout(timer);
  }, [value]);

  const handleTogglePreview = () => {
    const next = !previewVisible;
    setPreviewVisible(next);
    localStorage.setItem(`${storageKey}:previewVisible`, String(next));
  };

  const handleChange = (e) => {
    onChange(e.target.value);
  };

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <label className="block text-gray-700 font-bold">{label}</label>
          <button
            type="button"
            onClick={handleTogglePreview}
            className="text-sm text-primary hover:text-blue-700"
          >
            {previewVisible ? '隐藏预览' : '显示预览'}
          </button>
        </div>
      )}

      {previewVisible ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <textarea
            value={value}
            onChange={handleChange}
            rows={rows}
            placeholder={placeholder}
            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none font-mono text-sm"
          />

          <div className="border border-gray-200 rounded bg-gray-50 overflow-hidden transition-all duration-300 max-h-[600px] opacity-100">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-200">
              预览
            </div>
            <div className="p-3 overflow-auto max-h-[560px] prose max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                skipHtml={true}
              >
                {debouncedValue || ''}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full">
          <textarea
            value={value}
            onChange={handleChange}
            rows={rows}
            placeholder={placeholder}
            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-primary focus:outline-none font-mono text-sm"
          />
        </div>
      )}
    </div>
  );
}

export default MarkdownEditorWithPreview;

