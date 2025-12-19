import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserUI } from '../context/UserUIContext';
import PageTransition from '../components/PageTransition';

function UserLayout() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUserUI();
  const loc = useLocation();
  const { t } = useTranslation();
  const active = (path) => loc.pathname.startsWith(path);

  return (
    <div className="flex">
      <aside className={`fixed left-0 top-0 md:top-[64px] h-full md:h-[calc(100vh-64px)] bg-white md:border-r border-gray-200 shadow md:w-56 w-64 z-40 transform transition-transform duration-300 ${sidebarCollapsed ? '-translate-x-full md:translate-x-0 md:w-14' : 'translate-x-0'}`}>
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="font-semibold">用户中心</span>
          <button className="p-2" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="toggle-sidebar">☰</button>
        </div>
        <nav className="mt-2">
          <Link to="/user/info" className={`block px-4 py-3 hover:bg-gray-50 ${active('/user/info') ? 'text-primary font-semibold' : 'text-gray-700'}`}>{t('user.menu.info')}</Link>
          <Link to="/user/code" className={`block px-4 py-3 hover:bg-gray-50 ${active('/user/code') ? 'text-primary font-semibold' : 'text-gray-700'}`}>{t('user.menu.code')}</Link>
          <Link to="/user/preferences" className={`block px-4 py-3 hover:bg-gray-50 ${active('/user/preferences') ? 'text-primary font-semibold' : 'text-gray-700'}`}>{t('user.menu.preferences')}</Link>
        </nav>
      </aside>

      <main className={`flex-1 md:ml-56 ${sidebarCollapsed ? 'ml-0' : 'ml-64 md:ml-56'} p-2 md:p-6`}>
        <button className="md:hidden fixed left-3 top-3 z-50 bg-primary text-white rounded p-2 shadow" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>☰</button>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}

export default UserLayout;
