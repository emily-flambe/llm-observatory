import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-paper-dark animate-pulse" />
    );
  }

  if (!user) {
    // For local dev, use dev-login; for production, Cloudflare Access handles auth
    const isLocalDev = window.location.hostname === 'localhost';
    const loginUrl = isLocalDev ? '/api/auth/dev-login' : '/';

    return (
      <a
        href={loginUrl}
        className="text-ink-muted hover:text-ink transition-colors text-sm"
      >
        Sign In
      </a>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full border border-border"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-amber/20 border border-amber/40 flex items-center justify-center">
            <span className="text-amber text-sm font-medium">
              {(user.display_name || user.email)[0].toUpperCase()}
            </span>
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-lg shadow-lg py-1 z-50">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-ink text-sm font-medium truncate">
              {user.display_name || 'User'}
            </p>
            <p className="text-ink-muted text-xs truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              setIsOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-sm text-ink-muted hover:bg-paper hover:text-ink transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
