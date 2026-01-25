export function LoginRequired() {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h2 className="text-2xl font-bold text-ink mb-4">Admin Access Required</h2>
      <p className="text-ink/70 mb-6">
        You need to be logged in as an admin to access this page.
      </p>
      <a
        href="/api/admin/auth/check"
        className="inline-block px-6 py-3 bg-amber text-ink font-medium rounded-lg hover:bg-amber/90 transition-colors"
      >
        Log in with Cloudflare Access
      </a>
    </div>
  );
}
