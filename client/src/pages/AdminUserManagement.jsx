import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const API_URL = '/api';

function AdminUserManagement({ embedded = false }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [bannedIPs, setBannedIPs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  
  // Ban dialog state
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banUserId, setBanUserId] = useState(null);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, ipsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`),
        axios.get(`${API_URL}/admin/banned-ips`)
      ]);
      setUsers(usersRes.data || []);
      setBannedIPs(ipsRes.data || []);
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async () => {
    if (!banUserId) return;
    
    try {
      await axios.post(`${API_URL}/admin/users/${banUserId}/ban`, { reason: banReason });
      setMessage(t('settings.userManagement.success.ban'));
      setShowBanDialog(false);
      setBanUserId(null);
      setBanReason('');
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.ban'));
    }
  };

  const handleUnbanUser = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmUnban', { username }))) return;
    
    try {
      await axios.post(`${API_URL}/admin/users/${userId}/unban`);
      setMessage(t('settings.userManagement.success.unban'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.unban'));
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmDelete', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`);
      setMessage(t('settings.userManagement.success.delete'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.delete'));
    }
  };

  const handleDeleteUserWithBanIP = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmDeleteWithBanIP', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}?banIP=true`);
      setMessage(t('settings.userManagement.success.deleteWithBanIP'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.deleteWithBanIP'));
    }
  };

  const handleClearSubmissions = async (userId, username) => {
    if (!window.confirm(t('settings.userManagement.confirmClearSubmissions', { username }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}/submissions`);
      setMessage(t('settings.userManagement.success.clearSubmissions'));
    } catch (e) {
      setError(e.response?.data?.error || t('settings.userManagement.error.clearSubmissions'));
    }
  };

  const handleUnbanIP = async (ip) => {
    if (!window.confirm(t('settings.bannedIPs.confirmUnban', { ip }))) return;
    
    try {
      await axios.delete(`${API_URL}/admin/banned-ips/${encodeURIComponent(ip)}`);
      setMessage(t('settings.bannedIPs.success.unban'));
      fetchData();
    } catch (e) {
      setError(e.response?.data?.error || t('settings.bannedIPs.error.unban'));
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className={embedded ? '' : 'max-w-6xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700'}>
      {!embedded && (
        <h2 className="text-2xl font-bold text-primary dark:text-blue-400 mb-4">{t('settings.userManagement.title')}</h2>
      )}

      {/* Messages */}
      {message && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800">
          {message}
          <button 
            onClick={() => setMessage('')} 
            className="ml-2 text-green-800 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200"
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded border border-red-200 dark:border-red-800">
          {error}
          <button 
            onClick={() => setError('')} 
            className="ml-2 text-red-800 dark:text-red-300 hover:text-red-900 dark:hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'users'
              ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('settings.userManagement.title')}
        </button>
        <button
          onClick={() => setActiveTab('bannedIPs')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'bannedIPs'
              ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('settings.bannedIPs.title')}
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder={t('settings.userManagement.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.id')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.username')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.role')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.createdAt')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.userManagement.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      {t('settings.userManagement.noUsers')}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-900 dark:text-gray-200">{user.id}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-200">{user.username}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.role === 'ADMIN' 
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        {user.isBanned ? (
                          <div>
                            <span className="px-2 py-1 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                              {t('settings.userManagement.status.banned')}
                            </span>
                            {user.bannedReason && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {t('settings.userManagement.bannedReason')}: {user.bannedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                            {t('settings.userManagement.status.active')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {user.isBanned ? (
                            <button
                              onClick={() => handleUnbanUser(user.id, user.username)}
                              className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                            >
                              {t('settings.userManagement.actions.unban')}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setBanUserId(user.id);
                                setShowBanDialog(true);
                              }}
                              className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                            >
                              {t('settings.userManagement.actions.ban')}
                            </button>
                          )}
                          <button
                            onClick={() => handleClearSubmissions(user.id, user.username)}
                            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                          >
                            {t('settings.userManagement.actions.clearSubmissions')}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            {t('settings.userManagement.actions.delete')}
                          </button>
                          <button
                            onClick={() => handleDeleteUserWithBanIP(user.id, user.username)}
                            className="px-2 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-800"
                          >
                            {t('settings.userManagement.actions.deleteWithBanIP')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'bannedIPs' && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('settings.bannedIPs.description')}</p>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.columns.ip')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.columns.reason')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.columns.bannedAt')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.columns.expiresAt')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">
                    {t('settings.bannedIPs.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bannedIPs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      {t('settings.bannedIPs.noIPs')}
                    </td>
                  </tr>
                ) : (
                  bannedIPs.map((ip) => (
                    <tr key={ip.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-200">{ip.ip}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-900 dark:text-gray-200">{ip.reason || '-'}</td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(ip.bannedAt)}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                        {ip.expiresAt ? formatDate(ip.expiresAt) : t('settings.bannedIPs.permanent')}
                      </td>
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                        <button
                          onClick={() => handleUnbanIP(ip.ip)}
                          className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          {t('settings.bannedIPs.unban')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Ban Dialog */}
      {showBanDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{t('settings.userManagement.banDialog.title')}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('settings.userManagement.banDialog.reason')}
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t('settings.userManagement.banDialog.reasonPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBanDialog(false);
                  setBanUserId(null);
                  setBanReason('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleBanUser}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t('settings.userManagement.banDialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUserManagement;