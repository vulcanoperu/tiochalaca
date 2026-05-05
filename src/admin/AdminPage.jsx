import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Trash2, Users, UserPlus, Crown, RefreshCw, ArrowLeft, LogOut, Search, Download, KeySquare } from 'lucide-react';
import { fetchAdminUsers, deleteUser, getAuthHeaders, forceResetPassword, logoutUser } from '../services/backendApi';
import { toast } from 'react-hot-toast';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

async function changeUserRole(userId, newRole) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cambiar rol');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function adminRegisterUser(username, password, role = 'user') {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear usuario');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [expandedRow, setExpandedRow] = useState(null);
  const navigate = useNavigate();

  const currentUser = JSON.parse(sessionStorage.getItem('chalaca_user') || '{}');

  useEffect(() => {
    loadUsers();
    // Auto-refresh cada 10 segundos en segundo plano
    const interval = setInterval(() => {
      loadUsers(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadUsers = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetchAdminUsers();
    if (res.success) {
      setUsers(res.users);
    } else if (!silent) {
      setError(res.error || 'Error al cargar usuarios. ¿Eres administrador?');
    }
    if (!silent) setLoading(false);
  };

  const handleDelete = async (id, username) => {
    if (window.confirm(`¿Estás seguro de eliminar al usuario "${username}" y todo su historial?`)) {
      const res = await deleteUser(id);
      if (res.success) {
        toast.success(`Usuario ${username} eliminado.`);
        loadUsers();
      } else {
        toast.error(res.error || 'Error al eliminar usuario');
      }
    }
  };

  const handleRoleChange = async (id, username, currentRole) => {
    // Si es admin, no lo cambiamos (para evitar quitarse admin por accidente)
    if (currentRole === 'admin') return toast.error('No se puede cambiar el rol de un administrador desde aquí.');
    
    const newRoleVal = currentRole === 'pending' ? 'vip' : 'pending';

    // Optimistic UI update
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRoleVal } : u));

    const res = await changeUserRole(id, newRoleVal);
    if (res.success) {
      toast.success(`${username} ahora es ${newRoleVal === 'vip' ? 'VIP ⭐' : 'Pendiente ⏳'}.`);
    } else {
      toast.error('Error al cambiar rol. Revirtiendo...');
      loadUsers(); // revert
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setAdding(true);
    const res = await adminRegisterUser(newUsername.trim(), newPassword.trim(), newRole);
    if (res.success) {
      toast.success(`Usuario "${newUsername}" creado correctamente.`);
      setNewUsername(''); setNewPassword(''); setNewRole('user');
      setShowAddUser(false);
      loadUsers();
    } else {
      toast.error(res.error || 'Error al crear usuario');
    }
    setAdding(false);
  };

  const handleForcePasswordReset = async (id, username) => {
    const newPass = window.prompt(`Ingresa la nueva contraseña para el usuario "${username}":`);
    if (!newPass) return;
    if (newPass.length < 4) return toast.error('La contraseña debe tener al menos 4 caracteres.');
    
    if (window.confirm(`¿Confirmas el cambio de contraseña para "${username}"?`)) {
      const res = await forceResetPassword(id, newPass);
      if (res.success) toast.success(`Contraseña de ${username} actualizada.`);
      else toast.error(res.error || 'Error al cambiar contraseña');
    }
  };

  const handleExportCSV = () => {
    if (users.length === 0) return toast.error('No hay datos para exportar');
    const headers = ['ID', 'Usuario', 'Rol', 'Fecha de Registro'];
    const rows = users.map(u => [u.id, u.username, u.role, new Date(u.created_at).toISOString().split('T')[0]]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `usuarios_chalaca_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredUsers = useMemo(() => {
    let result = [...users];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(u => u.username.toLowerCase().includes(lower) || u.role.toLowerCase().includes(lower));
    }
    result.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [users, searchTerm, sortConfig]);

  if (loading) return (
    <div className="p-12 text-center">
      <RefreshCw size={24} className="text-purple-400 mx-auto mb-3 animate-spin" />
      <p className="text-slate-400">Cargando panel de administración…</p>
    </div>
  );

  if (error) return (
    <div className="p-12 text-center">
      <Shield size={32} className="text-red-400 mx-auto mb-3" />
      <p className="text-red-400 font-semibold">{error}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 animate-fade-in space-y-6">
      
      {/* Admin Topbar */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <button onClick={() => navigate('/')} className="btn-ghost text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Volver a Pronósticos
        </button>
        <button onClick={async () => { await logoutUser(); window.location.href = '/'; }} 
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-bold transition-colors">
          <LogOut size={14} /> Salir
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <Shield className="text-purple-400" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Panel de Administración</h1>
            <p className="text-xs text-slate-500 mt-0.5">Gestión de usuarios del sistema</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} className="btn-ghost border border-surface-600 text-slate-300">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            onClick={() => setShowAddUser(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              background: showAddUser ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#a78bfa',
            }}
          >
            <UserPlus size={14} />
            {showAddUser ? 'Cancelar' : 'Nuevo Usuario'}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-purple-400" />
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Total</p>
          </div>
          <p className="text-2xl font-black font-mono text-purple-400">{users.length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown size={14} className="text-yellow-400" />
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">VIP Activos</p>
          </div>
          <p className="text-2xl font-black font-mono text-yellow-400">{users.filter(u => u.role === 'vip').length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-orange-400" />
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Pendientes</p>
          </div>
          <p className="text-2xl font-black font-mono text-orange-400">{users.filter(u => u.role === 'pending').length}</p>
        </div>
      </div>

      {/* Formulario Nuevo Usuario */}
      {showAddUser && (
        <div className="glass-card p-5 animate-in slide-in-from-top-2 duration-200"
          style={{ border: '1px solid rgba(139,92,246,0.2)' }}>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <UserPlus size={15} className="text-purple-400" />
            Registrar Nuevo Usuario
          </h3>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Nombre de usuario"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              className="input-field sm:col-span-1 text-xs py-1.5"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input-field sm:col-span-1 text-xs py-1.5"
              required
            />
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="input-field sm:col-span-1 text-xs py-1.5"
            >
              <option value="pending">Pendiente</option>
              <option value="vip">VIP</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="submit" disabled={adding}
              className="btn-primary justify-center sm:col-span-1 text-xs py-1.5"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
              {adding ? <RefreshCw size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {adding ? 'Creando…' : 'Crear'}
            </button>
          </form>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Users size={16} className="text-slate-400" />
            <h2 className="font-bold text-white">Usuarios Registrados ({users.length})</h2>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar usuario..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs w-full"
              />
            </div>
            <button onClick={handleExportCSV} title="Exportar CSV"
              className="btn-ghost border border-surface-600 text-slate-300 p-2 shrink-0">
              <Download size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase bg-surface-900/50 text-slate-500 tracking-widest cursor-pointer select-none">
              <tr>
                <th className="px-5 py-3 hover:text-white transition-colors" onClick={() => handleSort('username')}>Usuario</th>
                <th className="px-5 py-3 hover:text-white transition-colors" onClick={() => handleSort('role')}>Rol</th>
                <th className="px-5 py-3 hover:text-white transition-colors" onClick={() => handleSort('created_at')}>Registro</th>
                <th className="px-5 py-3 text-right cursor-default">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isSelf = u.id === currentUser.id;
                const isExpanded = expandedRow === u.id;
                return (
                  <React.Fragment key={u.id}>
                  <tr className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer ${isSelf ? 'bg-accent-green/[0.03]' : ''} ${isExpanded ? 'bg-white/[0.02]' : ''}`} onClick={() => setExpandedRow(isExpanded ? null : u.id)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                          u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' 
                          : u.role === 'vip' || u.role === 'user' ? 'bg-accent-green/10 text-accent-green'
                          : 'bg-yellow-500/20 text-yellow-500'
                        }`}>
                          {u.role === 'admin' ? <Shield size={12} /> : u.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{u.username}</p>
                          {isSelf && <p className="text-[9px] text-accent-green font-bold uppercase tracking-wider">Tú</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] uppercase font-black px-2 py-1 rounded ${
                        u.role === 'admin'
                          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                          : u.role === 'vip' || u.role === 'user'
                          ? 'bg-accent-green/15 text-accent-green border border-accent-green/20'
                          : 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/20'
                      }`}>
                        {u.role === 'admin' ? '👑 Admin' : u.role === 'vip' || u.role === 'user' ? '⭐ VIP' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(u.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => handleForcePasswordReset(u.id, u.username)}
                              title="Cambiar contraseña"
                              className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 text-slate-500 hover:text-blue-400"
                            >
                              <KeySquare size={14} />
                            </button>

                            {/* Toggle VIP / Pendiente */}
                            {u.role !== 'admin' && (
                              <button
                                onClick={() => handleRoleChange(u.id, u.username, u.role)}
                                title={u.role === 'vip' ? 'Quitar VIP → Pendiente' : 'Activar VIP'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-200 hover:scale-105 select-none"
                                style={u.role === 'vip' ? {
                                  background: 'linear-gradient(135deg, rgba(250,204,21,0.2), rgba(234,179,8,0.1))',
                                  border: '1px solid rgba(250,204,21,0.4)',
                                  color: '#fbbf24',
                                  boxShadow: '0 0 12px rgba(250,204,21,0.2)',
                                } : {
                                  background: 'rgba(100,116,139,0.1)',
                                  border: '1px solid rgba(100,116,139,0.2)',
                                  color: '#64748b',
                                }}
                              >
                                <Crown size={11} />
                                {u.role === 'vip' ? 'VIP' : 'Activar'}
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(u.id, u.username)}
                              title="Eliminar usuario"
                              className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 text-slate-500 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {isSelf && (
                          <span className="text-[9px] text-slate-600 px-2 py-1 rounded bg-surface-800">Tu cuenta</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr className="bg-surface-800/30 border-b border-white/5 animate-in slide-in-from-top-2">
                      <td colSpan="4" className="px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="glass-card p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Datos de Contacto</p>
                            <p className="text-xs text-slate-300"><span className="text-slate-500">Email:</span> {u.email || 'No registrado'}</p>
                            <p className="text-xs text-slate-300 mt-1"><span className="text-slate-500">Google Auth:</span> {u.google_id ? '✅ Vinculado' : '❌ No'}</p>
                          </div>
                          <div className="glass-card p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Sesión y Dispositivo</p>
                            <p className="text-xs text-slate-300"><span className="text-slate-500">Última IP:</span> {u.last_ip || 'Desconocida'}</p>
                            <p className="text-xs text-slate-300 mt-1"><span className="text-slate-500">Último Acceso:</span> {u.last_login ? new Date(u.last_login).toLocaleString('es-PE') : 'Nunca'}</p>
                          </div>
                          <div className="glass-card p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Estadísticas de Picks</p>
                            <div className="flex gap-4">
                              <div>
                                <p className="text-xl font-mono text-white">{u.stats?.total || 0}</p>
                                <p className="text-[9px] text-slate-500 uppercase">Total</p>
                              </div>
                              <div>
                                <p className="text-xl font-mono text-accent-green">{u.stats?.won || 0}</p>
                                <p className="text-[9px] text-slate-500 uppercase">Ganadas</p>
                              </div>
                              <div>
                                <p className="text-xl font-mono text-accent-red">{u.stats?.lost || 0}</p>
                                <p className="text-[9px] text-slate-500 uppercase">Perdidas</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="p-8 text-center text-slate-500">No hay usuarios registrados.</div>
          )}
        </div>
      </div>
    </div>
  );
}
