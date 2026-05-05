import { useEffect, useRef, useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const POLL_INTERVAL_MS = 10_000; // Cada 10 segundos

/**
 * Hook que sincroniza el rol del usuario con el backend en tiempo real.
 * Si el admin cambia el rol, el usuario activo lo verá en hasta 10 segundos
 * sin necesidad de cerrar sesión.
 *
 * @param {Function} onRoleChange - Callback llamado cuando el rol cambia.
 *   Recibe el nuevo rol como argumento.
 */
export function useRoleSync(onRoleChange) {
  const lastRoleRef = useRef(null);
  // Si no hay callback (usuario no autenticado), el hook no hace nada
  const intervalRef = useRef(null);

  const checkRole = useCallback(async () => {
    if (!onRoleChange) return; // No autenticado
    const token = sessionStorage.getItem('chalaca_token');
    if (!token) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const { role } = await res.json();

      if (lastRoleRef.current === null) {
        lastRoleRef.current = role;
        return;
      }

      if (role !== lastRoleRef.current) {
        lastRoleRef.current = role;

        const stored = sessionStorage.getItem('chalaca_user');
        if (stored) {
          try {
            const user = JSON.parse(stored);
            user.role = role;
            sessionStorage.setItem('chalaca_user', JSON.stringify(user));
          } catch { /* ignorar */ }
        }

        onRoleChange(role);
      }
    } catch { /* Silencioso */ }
  }, [onRoleChange]);

  useEffect(() => {
    if (!onRoleChange) return; // No montar el intervalo si no hay callback

    lastRoleRef.current = null; // Reset al cambiar auth state
    checkRole();

    intervalRef.current = setInterval(checkRole, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkRole();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkRole, onRoleChange]);
}
