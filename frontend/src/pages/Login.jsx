import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth, ROLE_HOME } from "@/context/AuthContext";

const DEMO_ACCOUNTS = [
  { username: "kitchen01", label: "Kitchen Staff" },
  { username: "operations01", label: "Operations Staff (M001-M003)" },
  { username: "operations02", label: "Operations Staff (M004-M005)" },
  { username: "operations_sup01", label: "Operations Supervisor" },
  { username: "tech01", label: "Maintenance Technician" },
  { username: "tech02", label: "Maintenance Technician" },
  { username: "tech03", label: "Maintenance Technician" },
  { username: "maintenance_sup01", label: "Maintenance Supervisor" },
  { username: "admin01", label: "Admin" },
];

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const autoFill = (user_id) => {
    setUsername(user_id);
    setPassword("1234");
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await login(username.trim().toLowerCase(), password);
    setLoading(false);
    if (res.success) {
      navigate(ROLE_HOME[res.user.role] || "/login");
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in fade-in duration-500">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 rounded-full bg-beet items-center justify-center mb-3">
            <span className="font-display text-2xl font-bold text-bone lowercase">t</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink lowercase">tare</h1>
          <p className="text-sm text-ink/60 tracking-wide">Measured to the gram. &middot; Maintenance App</p>
        </div>
        <Card className="bg-oat border-clay/40 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>Enter your User ID and password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">User ID</Label>
                <Input
                  id="username"
                  data-testid="login-username-input"
                  placeholder="e.g. kitchen01"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-bone"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="login-password-input"
                  placeholder="••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-bone"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2" data-testid="login-error-message">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={loading || !username || !password}
                data-testid="login-submit-btn"
                className="w-full bg-beet hover:bg-beet-hover text-bone h-11 text-base font-semibold"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-5">
          <p className="text-xs text-center text-ink/50 mb-2 tracking-wide uppercase">Quick Demo Login (password auto-fills)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                onClick={() => autoFill(acc.username)}
                data-testid={`quick-login-${acc.username}`}
                className="text-left bg-oat hover:bg-stone/40 border border-clay/40 rounded-md px-2.5 py-1.5 transition-colors"
              >
                <p className="text-xs font-mono font-semibold text-ink truncate">{acc.username}</p>
                <p className="text-[11px] text-ink/60 truncate">{acc.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
