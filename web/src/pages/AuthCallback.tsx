import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Extract tokens from URL hash (Supabase OAuth redirect)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken) {
      localStorage.setItem('authToken', accessToken);
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }
    }

    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-slate-400">Signing you in...</p>
    </div>
  );
}
