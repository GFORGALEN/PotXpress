import { useEffect, useRef, useState } from 'react';
import { changePassword } from '../../api/auth.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export function ChangePasswordDialog({ open, onClose }) {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const firstFieldRef = useRef(null);
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      showToast('密码已修改，请重新登录', 'success');
      onClose();
      await logout();
    } catch (error) {
      showToast(error.message, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-soft" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <h2 id="change-password-title" className="text-xl font-black">修改密码</h2>
        <p className="mt-2 text-sm text-stone-500">修改成功后，所有已登录设备都会退出。</p>
        <form className="mt-5 grid gap-3" onSubmit={submit}>
          <input ref={firstFieldRef} className="min-h-11 rounded-xl border border-stone-300 px-3" type="password" autoComplete="current-password" required placeholder="当前密码" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          <input className="min-h-11 rounded-xl border border-stone-300 px-3" type="password" autoComplete="new-password" required minLength="8" maxLength="64" placeholder="新密码（至少 8 位）" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          <input className="min-h-11 rounded-xl border border-stone-300 px-3" type="password" autoComplete="new-password" required placeholder="再次输入新密码" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="min-h-11 rounded-xl border border-stone-300 px-4 font-bold" onClick={onClose}>取消</button>
            <button className="min-h-11 rounded-xl bg-ink-900 px-4 font-bold text-white disabled:opacity-50" disabled={saving}>{saving ? '修改中…' : '确认修改'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
