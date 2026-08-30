"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });
    if (res?.error) {
      setError(res.error);
    } else {
      router.push("/");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '400px', background: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Plan Algodon Auditoria</h1>
          <p style={{ color: '#4b5563', fontSize: '0.95rem', marginTop: '0.5rem' }}>Acceso al sistema</p>
        </div>
        
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

        <div style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '10px', fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
          <span>Credenciales iniciales: <strong>admin@algodon.xyz</strong> / <strong>AlgodonAdmin2026</strong></span>
        </div>
        
        <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '1.1rem', padding: '0.85rem' }}>Ingresar</button>
      </form>
    </div>
  );
}
