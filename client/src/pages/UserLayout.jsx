import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserUI } from '../context/UserUIContext';
import PageTransition from '../components/PageTransition';

const Icons = {
  Info: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  Code: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  Preferences: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.581-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Menu: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  ChevronLeft: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  ),
  ChevronRight: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
};

function UserLayout() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUserUI();
  const loc = useLocation();
  const { t } = useTranslation();
  const isActive = (path) => loc.pathname.startsWith(path);

  const menuItems = [
    { path: '/user/info', icon: <Icons.Info className="w-6 h-6" />, label: t('user.menu.info') },
    { path: '/user/code', icon: <Icons.Code className="w-6 h-6" />, label: t('user.menu.code') },
    { path: '/user/preferences', icon: <Icons.Preferences className="w-6 h-6" />, label: t('user.menu.preferences') },
  ];

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar Backdrop for Mobile */}
      {!sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed md:sticky top-0 md:top-[64px] h-full md:h-[calc(100vh-64px)] 
          bg-surface dark:bg-surface-dark border-r border-gray-200 dark:border-gray-700 
          shadow-card z-40 transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? '-translate-x-full md:translate-x-0 md:w-20' : 'translate-x-0 w-64'}
        `}
      >
        <div className="flex items-center justify-between p-4 h-16 border-b border-gray-100 dark:border-gray-800">
          <span className={`font-bold text-lg text-primary truncate transition-all duration-300 ${sidebarCollapsed ? 'md:opacity-0 md:w-0' : 'opacity-100 w-auto'}`}>
            用户中心
          </span>
          <button 
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="toggle-sidebar"
          >
             {sidebarCollapsed ? <Icons.ChevronRight className="w-5 h-5" /> : <Icons.ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="mt-4 px-2 space-y-2">
          {menuItems.map((item) => (
            <Link 
              key={item.path}
              to={item.path} 
              className={`
                flex items-center px-4 py-3 rounded-xl transition-all duration-200 group relative
                ${isActive(item.path) 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
                ${sidebarCollapsed ? 'justify-center' : ''}
              `}
              title={sidebarCollapsed ? item.label : ''}
            >
              <div className={`${sidebarCollapsed ? '' : 'mr-3'} transition-transform duration-200 ${isActive(item.path) ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'hidden opacity-0 w-0' : 'block opacity-100 w-auto'}`}>
                {item.label}
              </span>
              
              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-x-hidden w-full transition-all duration-300">
         {/* Mobile Toggle Button (only visible when sidebar is collapsed on mobile, but here sidebar is fixed left so this button is for when sidebar is hidden) */}
         <button 
           className={`md:hidden fixed left-4 top-20 z-20 bg-surface dark:bg-surface-dark p-2 rounded-lg shadow-card border border-gray-200 dark:border-gray-700 text-gray-600 ${!sidebarCollapsed ? 'hidden' : 'block'}`}
           onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
         >
           <Icons.Menu className="w-6 h-6" />
         </button>
         
        <PageTransition>
          <div className="max-w-6xl mx-auto">
             <Outlet />
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

export default UserLayout;
