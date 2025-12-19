import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useUserUI } from '../context/UserUIContext';

function UserAvatarMenu() {
  const { user, logout } = useAuth();
  const { avatarOpen, setAvatarOpen, setLastUserPath } = useUserUI();
  const nav = useNavigate();
  const ref = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    const onClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setAvatarOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [setAvatarOpen]);

  if (!user) return null;

  const initials = (user.username || '?').slice(0, 1).toUpperCase();

  const goto = (path) => {
    setLastUserPath(path);
    setAvatarOpen(false);
    nav(path);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="user-avatar"
        onClick={() => setAvatarOpen(!avatarOpen)}
        className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white hover:bg-white/30 transition-colors"
      >
        {initials}
      </button>

      {avatarOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white text-gray-800 rounded shadow-lg border border-gray-200 z-50">
          <div className="px-3 py-2 text-sm text-gray-600">{user.username}</div>
          <div className="border-t border-gray-200" />
          <button onClick={() => goto('/user/info')} className="w-full text-left px-3 py-2 hover:bg-gray-50">{t('user.menu.info')}</button>
          <button onClick={() => goto('/user/code')} className="w-full text-left px-3 py-2 hover:bg-gray-50">{t('user.menu.code')}</button>
          <button onClick={() => goto('/user/security')} className="w-full text-left px-3 py-2 hover:bg-gray-50">{t('user.menu.security')}</button>
          <button onClick={() => goto('/user/preferences')} className="w-full text-left px-3 py-2 hover:bg-gray-50">{t('user.menu.preferences')}</button>
          <div className="border-t border-gray-200" />
          <button onClick={logout} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">退出登录</button>
        </div>
      )}
    </div>
  );
}

export default UserAvatarMenu;
