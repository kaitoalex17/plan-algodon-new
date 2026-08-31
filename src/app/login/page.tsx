"use client";
import { signIn, useSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Cargando...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLoggedOut = searchParams.get("loggedOut") === "true";
  const { data: session, status: authStatus } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Si el usuario ya está autenticado y no acaba de cerrar sesión, redirigir a la página principal
  useEffect(() => {
    if (authStatus === "authenticated" && !isLoggedOut) {
      const role = (session?.user as any)?.role;
      if (role === "GESTOR") {
        window.location.href = "/gestion";
      } else {
        window.location.href = "/";
      }
    }
  }, [authStatus, isLoggedOut, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      redirect: false,
      email: email.trim(),
      password: password.trim(),
    });
    if (res?.error) {
      setError(res.error);
    } else {
      window.location.href = "/";
    }
  };

  if (authStatus === "authenticated" && !isLoggedOut) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', color: '#111827', fontWeight: 700 }}>
        Redirigiendo a tu sesión...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '400px', background: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Plan Algodon Auditoria</h1>
          <p style={{ color: '#4b5563', fontSize: '0.95rem', marginTop: '0.5rem' }}>Acceso al sistema</p>
        </div>

        {isLoggedOut && (
          <div style={{ background: '#dbeafe', color: '#1e40af', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.88rem', textAlign: 'center', fontWeight: 600 }}>
            ℹ️ Has cerrado sesión correctamente. Introduce tus credenciales para volver a ingresar.
          </div>
        )}
        
        {error && <div style={{ background: '#fee2e2', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Correo Electrónico</label>
          <input 
            type="email" 
            name="email"
            id="email"
            autoComplete="username email" 
            autoCapitalize="none"
            required 
            className="input-field" 
            placeholder="admin@algodon.xyz" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
          />
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Contraseña</label>
          <input 
            type="password" 
            name="password"
            id="password"
            autoComplete="current-password" 
            required 
            className="input-field" 
            placeholder="••••••••" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
          />
        </div>
        
        <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '1.1rem', padding: '0.85rem' }}>Ingresar</button>
      </form>
    </div>
  );
}
