const MissingConfigPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md text-center space-y-4">
      <h1 className="text-2xl font-bold">Supabase Not Configured</h1>
      <p className="text-muted-foreground">
        Set <code className="bg-muted px-1 rounded text-sm">VITE_SUPABASE_URL</code> and{" "}
        <code className="bg-muted px-1 rounded text-sm">VITE_SUPABASE_PUBLISHABLE_KEY</code> in
        your environment variables.
      </p>
      <p className="text-sm text-muted-foreground">
        See <code className="bg-muted px-1 rounded text-xs">.env.example</code> for reference.
      </p>
    </div>
  </div>
);

export default MissingConfigPage;
