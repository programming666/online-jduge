import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminProblemList from './AdminProblemList';
import AdminContestList from './AdminContestList';
import AdminSettings from './AdminSettings';
import AdminUserManagement from './AdminUserManagement';

const MENU_ITEMS = [
  { key: 'problems', icon: '📝', labelKey: 'admin.menu.problems' },
  { key: 'contests', icon: '🏆', labelKey: 'admin.menu.contests' },
  { key: 'users', icon: '👥', labelKey: 'admin.menu.users' },
  { key: 'settings', icon: '⚙️', labelKey: 'admin.menu.settings' }
];

function AdminDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('problems');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'problems':
        return <AdminProblemList embedded />;
      case 'contests':
        return <AdminContestList embedded />;
      case 'users':
        return <AdminUserManagement embedded />;
      case 'settings':
        return <AdminSettings embedded />;
      default:
        return <AdminProblemList embedded />;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div
        className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        {/* Hamburger Menu Button */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={sidebarOpen ? t('admin.sidebar.collapse') : t('admin.sidebar.expand')}
          >
            <svg
              className="w-6 h-6 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Menu Items */}
        <nav className="p-2">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center px-3 py-3 rounded-lg mb-1 transition-colors ${
                activeTab === item.key
                  ? 'bg-primary text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && (
                <span className="ml-3 font-medium whitespace-nowrap">
                  {t(item.labelKey)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900 overflow-auto transition-colors duration-200">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-primary dark:text-blue-400">
            {t('admin.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t(`admin.menu.${activeTab}`)}
          </p>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

export default AdminDashboard;