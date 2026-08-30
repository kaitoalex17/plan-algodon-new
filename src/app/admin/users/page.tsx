"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const PRESET_COLORS = [
  "#FF7900", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#f59e0b", "#06b6d4", "#ec4899", "#6366f1", "#14b8a6",
  "#84cc16", "#f97316", "#a855f7", "#0ea5e9", "#22c55e",
];

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  lastLogin?: string | null;
  _count?: { assignedCTOs: number };
};

const emptyForm = { name: "", email: "", password: "", role: "USER", color: "#3b82f6" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ name: user.name || "", email: user.email, password: "", role: user.role, color: user.color });
    setError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
    const method = editingUser ? "PUT" : "POST";

    const payload: any = { name: form.name, email: form.email, role: form.role, color: form.color };
    if (form.password) payload.password = form.password;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      closeModal();
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar el usuario");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteConfirm(null);
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Error al eliminar el usuario");
      setDeleteConfirm(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: "1.5rem" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#111827" }}>Gestión de Usuarios</h1>
            <p style={{ color: "#6b7280", marginTop: "0.25rem" }}>Control de accesos, roles y última conexión de técnicos</p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link href="/admin" className="btn" style={{ background: "#e5e7eb", color: "#374151", minHeight: "44px", padding: "0.6rem 1.2rem", fontSize: "0.9rem" }}>
              Volver al Admin
            </Link>
            <button onClick={openCreate} className="btn btn-primary" style={{ minHeight: "44px", padding: "0.6rem 1.2rem", fontSize: "0.9rem" }}>
              + Nuevo Usuario
            </button>
          </div>
        </div>

        {/* Tabla de usuarios */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#6b7280" }}>Cargando usuarios...</div>
        ) : (
          <div className="glass-panel" style={{ overflow: "hidden" }}>
            {users.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
                <p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>No hay usuarios registrados.</p>
                <button onClick={openCreate} className="btn btn-primary">Crear primer usuario</button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Color</th>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Nombre</th>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rol</th>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Última Conexión</th>
                      <th style={{ padding: "1rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>CTOs asignadas</th>
                      <th style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => (
                      <tr key={user.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "white" : "#fafafa" }}>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: user.color, border: "3px solid white", boxShadow: "0 0 0 2px " + user.color + "40" }} />
                        </td>
                        <td style={{ padding: "1rem", fontWeight: 600, color: "#111827" }}>{user.name || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Sin nombre</span>}</td>
                        <td style={{ padding: "1rem", color: "#374151", fontSize: "0.95rem" }}>{user.email}</td>
                        <td style={{ padding: "1rem" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 700,
                            background: user.role === "ADMIN" ? "#FF790020" : user.role === "GESTOR" ? "#10B98120" : "#e5e7eb",
                            color: user.role === "ADMIN" ? "#FF7900" : user.role === "GESTOR" ? "#10B981" : "#374151",
                          }}>
                            {user.role === "ADMIN" ? "Administrador" : user.role === "GESTOR" ? "Gestor" : "Técnico"}
                          </span>
                        </td>
                        <td style={{ padding: "1rem" }}>
                          {user.lastLogin ? (
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
                                {new Date(user.lastLogin).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                              </span>
                              <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                                {new Date(user.lastLogin).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.78rem", color: "#9ca3af", fontStyle: "italic" }}>
                              Nunca conectado
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "1rem", color: "#374151", fontWeight: 600 }}>
                          {user._count?.assignedCTOs ?? 0}
                        </td>
                        <td style={{ padding: "1rem", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", alignItems: "center" }}>
                            {/* Botón Forzar Cierre de Sesión */}
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(`¿Forzar el cierre de sesión de ${user.name || user.email}? El usuario será desconectado inmediatamente del sistema.`)) {
                                  try {
                                    const res = await fetch(`/api/users/${user.id}/force-logout`, { method: "POST" });
                                    const data = await res.json();
                                    if (res.ok) {
                                      alert(`✓ Sesión cerrada con éxito para ${user.name || user.email}`);
                                    } else {
                                      alert(data.error || "No se pudo cerrar la sesión");
                                    }
                                  } catch (e) {
                                    alert("Error al conectar con el servidor.");
                                  }
                                }
                              }}
                              title="Expulsar y cerrar sesión activa inmediatamente"
                              style={{ 
                                padding: "6px 10px", 
                                border: "1px solid #fecaca", 
                                borderRadius: "6px", 
                                background: "#fff1f2", 
                                cursor: "pointer", 
                                fontWeight: 700, 
                                fontSize: "0.8rem", 
                                color: "#b91c1c",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <span>🚫</span> Expulsar
                            </button>

                            <button
                              onClick={() => openEdit(user)}
                              style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: "6px", background: "white", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "#374151" }}
                            >
                              Editar
                            </button>
                            {deleteConfirm === user.id ? (
                              <>
                                <button
                                  onClick={() => handleDelete(user.id)}
                                  style={{ padding: "6px 14px", border: "none", borderRadius: "6px", background: "#ef4444", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", color: "white" }}
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", background: "white", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "#374151" }}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(user.id)}
                                style={{ padding: "6px 14px", border: "1px solid #fecaca", borderRadius: "6px", background: "#fff5f5", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "#ef4444" }}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "500px", padding: "2rem", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem", color: "#111827" }}>
              {editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}
            </h2>

            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ background: "#fee2e2", color: "#dc2626", padding: "0.75rem", borderRadius: "8px", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nombre del técnico o administrador"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  className="input-field"
                  placeholder="tecnico@ejemplo.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  {editingUser ? "Nueva Contraseña (dejar vacío para no cambiar)" : "Contraseña *"}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  className="input-field"
                  placeholder={editingUser ? "••••••••  (opcional)" : "••••••••"}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  Rol
                </label>
                <select
                  className="input-field"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="USER">Técnico (solo lectura/edición)</option>
                  <option value="GESTOR">Gestor (auditoría/evidencias)</option>
                  <option value="ADMIN">Administrador (acceso completo)</option>
                </select>
              </div>

              <div style={{ marginBottom: "1.75rem" }}>
                <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  Color identificativo en el mapa
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "0.75rem" }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: "36px", height: "36px", borderRadius: "50%", background: c, border: "none", cursor: "pointer",
                        boxShadow: form.color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "0 2px 4px rgba(0,0,0,0.15)",
                        transform: form.color === c ? "scale(1.2)" : "scale(1)",
                        transition: "all 0.15s",
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                    style={{ width: "44px", height: "44px", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", padding: "2px" }}
                  />
                  <span style={{ fontSize: "0.9rem", color: "#6b7280" }}>Color personalizado: <strong style={{ color: form.color }}>{form.color}</strong></span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn"
                  style={{ flex: 1, background: "#e5e7eb", color: "#374151" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : (editingUser ? "Guardar Cambios" : "Crear Usuario")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
