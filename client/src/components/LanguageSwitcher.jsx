import React from 'react';
import { useTranslation } from 'react-i18next';

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const currentLang = i18n.language;

  const languages = [
    { code: 'zh-CN', label: '中文' },
    { code: 'en-US', label: 'EN' }
  ];

  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
      {languages.map((lang) => {
        // Check if this is the active language
        // We check if the current language starts with the code (e.g. zh-CN matches zh-CN)
        // Or if it's strictly equal
        const isActive = currentLang === lang.code || 
                        (currentLang && currentLang.startsWith(lang.code.split('-')[0]) && lang.code !== 'en-US' && currentLang !== 'en-US'); // Fallback logic if needed, but strict is better usually

        // Simplified active check for this specific setup where we expect zh-CN or en-US
        const isSelected = currentLang === lang.code;

        return (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none
              ${isSelected 
                ? 'bg-white text-secondary shadow-sm ring-1 ring-gray-200' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
            `}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
