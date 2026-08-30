"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AntiFraudPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadUsers();
        loadLogs();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadLogs = async (userId: string = selectedUser) => {
    setLoading(true);
    try {
      const url = userId ? `/api/admin/anti-fraud?userId=${userId}` : "/api/admin/anti-fraud";
      const res = await fetch(url);
      if (res.ok) setLogs(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", padding: "20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Cabecera */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.9rem", marginBottom: "6px" }}>
              ← Volver al Panel Admin
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0 }}>
              🛡️ Control Antifraude y Verificación GPS de Auditorías
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "4px 0 0 0" }}>
              Verifica que el técnico estuviese físicamente presente al auditar o cerrar cada CTO calculando la distancia exacta.
            </p>
          </div>

          {/* Filtro por Técnico */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                loadLogs(e.target.value);
              }}
              style={{
                background: "var(--card-bg, #1e293b)",
                color: "var(--text-color, white)",
                border: "1px solid var(--border-color, #334155)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "0.88rem",
                outline: "none"
              }}
            >
              <option value="">Todos los técnicos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla de Verificación de Auditorías */}
        <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-color, #0f172a)", borderBottom: "1px solid var(--border-color, #334155)", opacity: 0.8 }}>
                  <th style={{ padding: "12px 16px" }}>Fecha / Hora</th>
                  <th style={{ padding: "12px 16px" }}>Técnico</th>
                  <th style={{ padding: "12px 16px" }}>CTO Auditada</th>
                  <th style={{ padding: "12px 16px" }}>Coordenadas CTO</th>
                  <th style={{ padding: "12px 16px" }}>Coordenadas Técnico</th>
                  <th style={{ padding: "12px 16px" }}>Distancia GPS</th>
                  <th style={{ padding: "12px 16px" }}>Veredicto</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "30px", textAlign: "center", opacity: 0.6 }}>Cargando auditorías...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "30px", textAlign: "center", opacity: 0.6 }}>No hay registros de auditoría recientes.</td>
                  </tr>
                ) : (
                  logs.map((item) => {
                    const isFraud = item.isSuspect;
                    const dateFormatted = new Date(item.timestamp).toLocaleString();

                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid var(--border-color, #334155)", background: isFraud ? "rgba(239, 68, 68, 0.08)" : "transparent" }}>
                        <td style={{ padding: "14px 16px", fontSize: "0.8rem", opacity: 0.8 }}>
                          {dateFormatted}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: item.user?.color || "#FF7900" }} />
                            <span style={{ fontWeight: 700 }}>{item.user?.name || item.user?.email || "Desconocido"}</span>
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontWeight: 800, color: "var(--primary-color, #FF7900)" }}>
                            {item.cto?.num}
                          </span>
                          {item.cto?.municipio && (
                            <span style={{ display: "block", fontSize: "0.72rem", opacity: 0.6 }}>{item.cto.municipio}</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: "0.8rem", fontFamily: "monospace" }}>
                          {item.cto?.lat?.toFixed(5)}, {item.cto?.lng?.toFixed(5)}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: "0.8rem", fontFamily: "monospace" }}>
                          {item.techLat && item.techLng ? (
                            <span>{item.techLat.toFixed(5)}, {item.techLng.toFixed(5)}</span>
                          ) : (
                            <span style={{ opacity: 0.5 }}>{item.techLocation || "No registrada"}</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {item.distanceMeters !== null ? (
                            <span style={{ fontWeight: 800, color: isFraud ? "#ef4444" : "#10b981" }}>
                              {item.distanceMeters} m
                            </span>
                          ) : (
                            <span style={{ opacity: 0.5 }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {isFraud ? (
                            <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid #ef4444", padding: "3px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ⚠️ Sospechosa ({item.distanceMeters}m de distancia)
                            </span>
                          ) : item.distanceMeters !== null ? (
                            <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid #10b981", padding: "3px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ✓ En el lugar (A pie de CTO)
                            </span>
                          ) : (
                            <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>Auditoría sin GPS</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
