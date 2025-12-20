import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserUI } from '../context/UserUIContext';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';

function UserPreferences() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = useUserUI();
  const [previewLang, setPreviewLang] = useState('cpp');
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'

  const fonts = [
    { name: 'Cascadia Code', value: 'Cascadia Code' },
    { name: 'Fira Code', value: 'Fira Code' },
    { name: 'JetBrains Mono', value: 'JetBrains Mono' },
    { name: 'Consolas', value: 'Consolas' },
    { name: 'Monaspace Neon', value: 'Monaspace Neon' },
    { name: 'Anonymous Pro', value: 'Anonymous Pro' },
    { name: 'Hack', value: 'Hack' },
    { name: 'System Default', value: 'monospace' }
  ];

  const themes = [
    { name: t('user.preferences.themes.system'), value: 'system' },
    { name: t('user.preferences.themes.light'), value: 'light' },
    { name: t('user.preferences.themes.dark'), value: 'dark' }
  ];

  const tabSizes = [2, 4, 8];

  const handleChange = async (key, value) => {
    setSaveStatus('saving');
    try {
      await updatePreferences({ [key]: value });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const handleFontChange = (e) => {
    handleChange('fontFamily', e.target.value);
  };

  const handleThemeChange = (e) => {
    handleChange('theme', e.target.value);
  };

  const handleTabSizeChange = (e) => {
    const size = parseInt(e.target.value, 10);
    setSaveStatus('saving');
    try {
      updatePreferences({ tabSize: size, indentUnit: size });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const handleFontSizeChange = (e) => {
    handleChange('fontSize', parseInt(e.target.value, 10));
  };

  const getPreviewExtensions = () => {
    const exts = [];
    if (previewLang === 'cpp') exts.push(cpp());
    if (previewLang === 'python') exts.push(python());

    // Dynamic settings
    exts.push(indentUnit.of(" ".repeat(preferences.tabSize)));
    exts.push(EditorState.tabSize.of(preferences.tabSize));
    exts.push(EditorView.theme({
      "&": { fontFamily: preferences.fontFamily },
      ".cm-scroller": { fontFamily: preferences.fontFamily },
      ".cm-content": { fontFamily: preferences.fontFamily }
    }));

    return exts;
  };

  const isDark = preferences.theme === 'dark' || (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const previewCode = {
    cpp: `#include <iostream>
using namespace std;

int main() {
    // This is a sample code
    cout << "Hello, World!" << endl;
    for (int i = 0; i < 10; i++) {
        if (i % 2 == 0) {
            cout << i << " is even" << endl;
        }
    }
    return 0;
}`,
    python: `def main():
    # This is a sample code
    print("Hello, World!")
    for i in range(10):
        if i % 2 == 0:
            print(f"{i} is even")

if __name__ == "__main__":
    main()`
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('user.preferences.title')}</h2>
        {saveStatus === 'saving' && <span className="text-sm text-gray-500 dark:text-gray-400">Saving...</span>}
        {saveStatus === 'saved' && <span className="text-sm text-green-500 font-medium">Saved</span>}
        {saveStatus === 'error' && <span className="text-sm text-red-500 font-medium">Error saving</span>}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Settings Form */}
        <div className="space-y-6">
          
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('user.preferences.theme')}
            </label>
            <select
              value={preferences.theme}
              onChange={handleThemeChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {themes.map((theme) => (
                <option key={theme.value} value={theme.value}>{theme.name}</option>
              ))}
            </select>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('user.preferences.fontFamily')}
            </label>
            <select
              value={preferences.fontFamily}
              onChange={handleFontChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              style={{ fontFamily: preferences.fontFamily }}
            >
              {fonts.map((font) => (
                <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('user.preferences.fontSize')} ({preferences.fontSize}px)
            </label>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={preferences.fontSize}
              onChange={handleFontSizeChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>

          {/* Tab Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('user.preferences.tabSize')}
            </label>
            <select
              value={preferences.tabSize}
              onChange={handleTabSizeChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {tabSizes.map((size) => (
                <option key={size} value={size}>{size} {t('common.unit.spaces')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('user.preferences.preview')}
            </label>
            <select
              value={previewLang}
              onChange={(e) => setPreviewLang(e.target.value)}
              className="text-xs border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="cpp">C++</option>
              <option value="python">Python</option>
            </select>
          </div>
          <div className="border rounded-md overflow-hidden" style={{ fontFamily: preferences.fontFamily, fontSize: `${preferences.fontSize}px` }}>
            <CodeMirror
              value={previewCode[previewLang]}
              height="300px"
              extensions={getPreviewExtensions()}
              theme={isDark ? dracula : 'light'}
              editable={false}
              basicSetup={{
                lineNumbers: preferences.lineNumbers,
                foldGutter: preferences.foldGutter,
                highlightActiveLine: true,
                indentOnInput: true,
                bracketMatching: preferences.matchBrackets,
                tabSize: preferences.tabSize,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('user.preferences.previewHint')}
          </p>
        </div>
      </div>
    </div>
  );
}

export default UserPreferences;
