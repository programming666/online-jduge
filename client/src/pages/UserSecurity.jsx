import React, { useMemo, useState } from 'react';
import axios from 'axios';
import PageTransition from '../components/PageTransition';
import { useTranslation } from 'react-i18next';

const API_URL = '/api';

function strengthLabel(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 5) return '强';
  if (score >= 3) return '中';
  return '弱';
}

function UserSecurity() {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const label = useMemo(() => strengthLabel(pw), [pw]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (pw !== confirm) {
      setErr(t('user.security.mismatch'));
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_URL}/auth/change-password`, { currentPassword: current, newPassword: pw });
      setMsg(t('user.security.success'));
      setCurrent(''); setPw(''); setConfirm('');
    } catch (e) {
      setErr(e.response?.data?.error || t('user.security.fail'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="max-w-md">
        <h2 className="text-2xl font-bold text-primary mb-4">{t('user.security.title')}</h2>
        <form onSubmit={submit} className="bg-white rounded shadow border p-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('user.security.current')}</label>
            <input type="password" value={current} onChange={(e)=>setCurrent(e.target.value)} className="w-full border rounded p-2 focus:ring-2 focus:ring-primary" required />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('user.security.new')}</label>
            <input type="password" value={pw} onChange={(e)=>setPw(e.target.value)} className="w-full border rounded p-2 focus:ring-2 focus:ring-primary" required />
            <div className={`mt-1 text-sm ${label==='强'?'text-green-600':label==='中'?'text-yellow-600':'text-red-600'}`}>{t('user.security.strength')}：{label}</div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('user.security.confirm')}</label>
            <input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} className="w-full border rounded p-2 focus:ring-2 focus:ring-primary" required />
          </div>
          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:bg-gray-400">{saving?t('common.loading'):t('user.security.submit')}</button>
          </div>
          {msg && <div className="text-green-600 text-sm">{msg}</div>}
          {err && <div className="text-red-600 text-sm">{err}</div>}
        </form>
      </div>
    </PageTransition>
  );
}

export default UserSecurity;
