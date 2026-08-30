"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Settings State: Compression
  const [imageQuality, setImageQuality] = useState(80);
  const [imageMaxWidth, setImageMaxWidth] = useState(1600);

  // Settings State: SFTP
  const [sftpUser, setSftpUser] = useState("sftpuser");
  const [sftpPassword, setSftpPassword] = useState("sftppassword123");
  const [sftpPort, setSftpPort] = useState("2222");
  const [savingSftp, setSavingSftp] = useState(false);

  // Settings State: Mail
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailScheduleHour, setEmailScheduleHour] = useState("20:00");
  const [emailScheduleEnabled, setEmailScheduleEnabled] = useState(false);
  const [publicReportPassword, setPublicReportPassword] = useState("netdata");
  const [emailFooter, setEmailFooter] = useState("");
  const [emailMethod, setEmailMethod] = useState("brevo");
  const [publicAccessToken, setPublicAccessToken] = useState("");
  const [generatingToken, setGeneratingToken] = useState(false);
  const [brevoApiKey, setBrevoApiKey] = useState("");
  const [brevoSenderEmail, setBrevoSenderEmail] = useState("");
  const [brevoSenderName, setBrevoSenderName] = useState("Plan Algodón");

  // Settings State: Questionnaire
  const [questJson, setQuestJson] = useState("");
  const [savingQuest, setSavingQuest] = useState(false);

  // Server metadata
  const [serverTimeMadrid, setServerTimeMadrid] = useState("");
  const [lastSentDate, setLastSentDate] = useState("Nunca");

  const [loading, setLoading] = useState(true);
  const [savingCompression, setSavingCompression] = useState(false);
  const [savingMail, setSavingMail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingManual, setSendingManual] = useState(false);
  const [forceSending, setForceSending] = useState(false);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadSettings();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const loadSettings = async () => {
    try {
      const [resCompression, resMail, resQuest] = await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/email-settings"),
        fetch("/api/admin/questionnaire-settings")
      ]);

      if (resCompression.ok) {
        const settings = await resCompression.json();
        setImageQuality(parseInt(settings.imageQuality) || 80);
        setImageMaxWidth(parseInt(settings.imageMaxWidth) || 1600);
        if (settings.sftpUser) setSftpUser(settings.sftpUser);
        if (settings.sftpPassword) setSftpPassword(settings.sftpPassword);
        if (settings.sftpPort) setSftpPort(settings.sftpPort);
      }

      if (resMail.ok) {
        const settings = await resMail.json();
        setSmtpHost(settings.smtpHost || "");
        setSmtpPort(settings.smtpPort || "587");
        setSmtpSecure(settings.smtpSecure || false);
        setSmtpUser(settings.smtpUser || "");
        setSmtpPass(settings.smtpPass || "");
        setEmailRecipients(settings.emailRecipients || "");
        // Normalize to HH:MM format
        const rawHour = settings.emailScheduleHour || "20";
        if (rawHour.includes(":")) {
          setEmailScheduleHour(rawHour);
        } else {
          setEmailScheduleHour(String(rawHour).padStart(2, "0") + ":00");
        }
        setEmailScheduleEnabled(settings.emailScheduleEnabled || false);
        setPublicReportPassword(settings.publicReportPassword || "netdata");
        setEmailFooter(settings.emailFooter || "");
        setEmailMethod(settings.emailMethod || "brevo");
        setPublicAccessToken(settings.publicAccessToken || "");
        setBrevoApiKey(settings.brevoApiKey || "");
        setBrevoSenderEmail(settings.brevoSenderEmail || "");
        setBrevoSenderName(settings.brevoSenderName || "Plan Algodón");
        setServerTimeMadrid(settings.serverTimeMadrid || "");
        setLastSentDate(settings.lastSentDate || "Nunca");
      }

      if (resQuest.ok) {
        const questData = await resQuest.json();
        setQuestJson(JSON.stringify(questData, null, 2));
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompression = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompression(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageQuality, imageMaxWidth })
      });
      if (res.ok) {
        alert("Ajustes de compresión de imagen (WhatsApp HD) guardados correctamente.");
      } else {
        alert("Error al guardar los ajustes de compresión.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor al guardar compresión.");
    } finally {
      setSavingCompression(false);
    }
  };

  const handleSaveSftp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSftp(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sftpUser, sftpPassword, sftpPort })
      });
      if (res.ok) {
        alert("Credenciales y accesos de SFTP guardados correctamente.");
      } else {
        alert("Error al guardar los ajustes de SFTP.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor al guardar ajustes de SFTP.");
    } finally {
      setSavingSftp(false);
    }
  };

  const handleSaveMail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMail(true);
    try {
      const res = await fetch("/api/admin/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost, smtpPort: parseInt(smtpPort), smtpSecure, smtpUser, smtpPass,
          emailRecipients, emailScheduleHour,
          emailScheduleEnabled, publicReportPassword, emailFooter, emailMethod, publicAccessToken,
          brevoApiKey, brevoSenderEmail, brevoSenderName
        })
      });
      if (res.ok) {
        alert("Ajustes de correo guardados correctamente.");
        loadSettings();
      } else {
        alert("Error al guardar la configuración de correo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor.");
    } finally {
      setSavingMail(false);
    }
  };

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/daily-summary/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTest: true })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Correo de prueba enviado con éxito.");
      } else {
        alert(`Fallo al enviar correo: ${data.error || "Servidor falló"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con el servidor.");
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendDailyReportManual = async () => {
    if (!confirm("¿Deseas enviar el correo resumen de auditoría del día de hoy de forma manual inmediatamente?")) return;
    setSendingManual(true);
    try {
      const res = await fetch("/api/admin/daily-summary/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Reporte del día enviado con éxito.");
      } else {
        alert(`Fallo al enviar: ${data.error || "Servidor falló"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con el servidor.");
    } finally {
      setSendingManual(false);
    }
  };

  const handleForceSend = async () => {
    if (!confirm("¿Forzar el envío del reporte diario AHORA? Esto ignora la hora programada y el control de duplicados.")) return;
    setForceSending(true);
    try {
      const res = await fetch("/api/admin/email-settings/force-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Reporte forzado enviado con éxito.");
        loadSettings();
      } else {
        alert(`Error: ${data.error || "Falló el envío forzado."}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con el servidor.");
    } finally {
      setForceSending(false);
    }
  };

  const handleSaveQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQuest(true);
    try {
      const parsed = JSON.parse(questJson);
      const res = await fetch("/api/admin/questionnaire-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      if (res.ok) {
        alert("Configuración del cuestionario guardada correctamente.");
      } else {
        alert("Error al guardar la configuración del cuestionario.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error en el JSON: ${err.message}. Revisa el formato y comas.`);
    } finally {
      setSavingQuest(false);
    }
  };

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    try {
      const newToken = crypto.randomUUID();
      const res = await fetch("/api/admin/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost, smtpPort: parseInt(smtpPort), smtpSecure, smtpUser, smtpPass,
          emailRecipients, emailScheduleHour: parseInt(emailScheduleHour),
          emailScheduleEnabled, publicReportPassword, emailFooter, emailMethod,
          brevoApiKey, brevoSenderEmail, brevoSenderName,
          publicAccessToken: newToken
        })
      });
      if (res.ok) {
        setPublicAccessToken(newToken);
        alert("Enlace público generado correctamente.");
      } else {
        alert("Error al guardar el token público.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar el enlace público? Quien tenga el enlace ya no podrá acceder.")) return;
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/admin/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost, smtpPort: parseInt(smtpPort), smtpSecure, smtpUser, smtpPass,
          emailRecipients, emailScheduleHour: parseInt(emailScheduleHour),
          emailScheduleEnabled, publicReportPassword, emailFooter, emailMethod,
          brevoApiKey, brevoSenderEmail, brevoSenderName,
          publicAccessToken: ""
        })
      });
      if (res.ok) {
        setPublicAccessToken("");
        alert("Enlace público revocado correctamente.");
      } else {
        alert("Error al revocar el enlace público.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const getPublicLink = () => {
    if (!publicAccessToken) return "";
    return `${window.location.origin}/public-report?token=${publicAccessToken}`;
  };

  if (loading || authStatus === "loading") {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white" }}>
        <p style={{ fontWeight: 700 }}>Cargando Ajustes del Sistema...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "900px", margin: "0 auto", color: "var(--text-color)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>⚙️ Ajustes del Sistema</h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>Plan Algodón v2.8 — Panel de Control de Configuración</p>
        </div>
        <Link href="/admin" className="btn btn-primary">Volver al Panel</Link>
      </div>

      {/* Programador Metadata Card */}
      <div className="glass-panel" style={{ padding: "1rem 1.5rem", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Hora Servidor (Madrid)</span>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--primary-color)" }}>{serverTimeMadrid || "Cargando..."}</span>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Hora Programada</span>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-color)" }}>{emailScheduleHour} Madrid</span>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Envío Automático</span>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: emailScheduleEnabled ? "#10b981" : "#ef4444" }}>
            {emailScheduleEnabled ? "● Activado" : "○ Desactivado"}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Último Reporte Automatico</span>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-color)" }}>{lastSentDate}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>

        {/* 1. AJUSTES DE COMPRESIÓN (WHATSAPP HD) */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: 700, borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            🖼️ Ajustes de Compresión (WhatsApp HD)
          </h2>
          <form onSubmit={handleSaveCompression} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Calidad de Compresión: <strong>{imageQuality}%</strong>
              </label>
              <input 
                type="range" 
                min="50" 
                max="100" 
                value={imageQuality} 
                onChange={(e) => setImageQuality(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: "var(--primary-color)" }}
              />
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Recomendado: 80% (óptimo balance peso/nitidez).</span>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Dimensión Máxima (Ancho/Alto px):
              </label>
              <input 
                type="number" 
                className="input-field" 
                min="600" 
                max="3000" 
                value={imageMaxWidth} 
                onChange={(e) => setImageMaxWidth(parseInt(e.target.value))}
                style={{ padding: "6px 12px", minHeight: "36px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
              />
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Recomendado: 1600px (calidad WhatsApp HD).</span>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ minHeight: "40px", padding: "6px 20px" }}
                disabled={savingCompression}
              >
                {savingCompression ? "Guardando..." : "💾 Guardar Ajustes de Compresión"}
              </button>
            </div>
          </form>
        </div>

        {/* 2. AJUSTES DE ACCESO SFTP (CARPETAS Y FOTOS) */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "var(--card-bg)", border: "1.5px solid #0284c7", borderRadius: "12px", boxShadow: "0 4px 12px rgba(2,132,199,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📁</span> Accesos y Servidor SFTP (Descarga de Fotos)
            </h2>
            <span style={{ fontSize: "0.72rem", background: "rgba(2,132,199,0.15)", color: "#0284c7", border: "1px solid #0284c7", padding: "2px 8px", borderRadius: "12px", fontWeight: 800 }}>
              Puerto {sftpPort}
            </span>
          </div>

          <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "1.25rem" }}>
            Configura las credenciales de conexión para descargar cómodamente las carpetas independientes de CTOs y fechas por SFTP (FileZilla / WinSCP).
          </p>

          <form onSubmit={handleSaveSftp} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Usuario SFTP:
              </label>
              <input 
                type="text" 
                className="input-field" 
                value={sftpUser} 
                onChange={(e) => setSftpUser(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", minHeight: "38px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", fontWeight: 700 }}
                placeholder="sftpuser"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Contraseña SFTP:
              </label>
              <input 
                type="text" 
                className="input-field" 
                value={sftpPassword} 
                onChange={(e) => setSftpPassword(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", minHeight: "38px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", fontWeight: 700 }}
                placeholder="sftppassword123"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Puerto SFTP:
              </label>
              <input 
                type="number" 
                className="input-field" 
                value={sftpPort} 
                onChange={(e) => setSftpPort(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", minHeight: "38px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", fontWeight: 700 }}
                placeholder="2222"
                required
              />
            </div>

            <div style={{ gridColumn: "span 3", background: "rgba(2,132,199,0.06)", border: "1px dashed #0284c7", borderRadius: "8px", padding: "10px 14px", fontSize: "0.8rem", color: "#38bdf8" }}>
              <strong>Guía de conexión:</strong> Servidor: <code>IP_DE_TU_SERVER</code> | Puerto: <code>{sftpPort}</code> | Protocolo: <code>SFTP</code> | Directorio remoto: <code>/upload</code>
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <button 
                type="submit" 
                className="btn" 
                style={{ background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "white", minHeight: "40px", padding: "6px 20px", fontWeight: 800, cursor: "pointer", border: "none", borderRadius: "8px", boxShadow: "0 2px 8px rgba(2,132,199,0.3)" }}
                disabled={savingSftp}
              >
                {savingSftp ? "Guardando..." : "💾 Guardar Accesos SFTP"}
              </button>
            </div>
          </form>
        </div>

        {/* 3. ENLACE PÚBLICO DE ACCESO DIRECTO */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: 700, borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            🔗 Enlace Público de Acceso Directo
          </h2>
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1rem" }}>
            Permite acceder al mapa y listado de hoy de forma interactiva <strong>sin contraseña</strong>.
          </p>

          {publicAccessToken ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <input
                  type="text"
                  readOnly
                  value={getPublicLink()}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: "0.78rem",
                    fontFamily: "monospace",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px"
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => { navigator.clipboard.writeText(getPublicLink()); alert("Enlace copiado al portapapeles."); }}
                  style={{ padding: "6px 12px", background: "#0ea5e9", color: "white", border: "none", fontWeight: 700, borderRadius: "6px", cursor: "pointer" }}
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleRevokeToken}
                  disabled={generatingToken}
                  style={{ padding: "6px 12px", background: "#ef4444", color: "white", border: "none", fontWeight: 700, borderRadius: "6px", cursor: "pointer" }}
                >
                  Revocar
                </button>
              </div>
              <p style={{ fontSize: "0.75rem", color: "#10b981", margin: 0 }}>✅ Enlace activo — cualquiera con esta URL puede acceder sin contraseña.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <p style={{ fontSize: "0.82rem", color: "#f59e0b", margin: 0 }}>⚠️ No hay ningún enlace público generado actualmente.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateToken}
                disabled={generatingToken}
                style={{ alignSelf: "flex-start", fontWeight: 700, padding: "8px 16px" }}
              >
                {generatingToken ? "Generando..." : "🔑 Generar Enlace Público"}
              </button>
            </div>
          )}
        </div>

        {/* 3. AJUSTES DE CORREO Y ENVÍO AUTOMÁTICO */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
          <h2 style={{ marginBottom: "1.25rem", fontSize: "1.2rem", fontWeight: 700, borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            📧 Ajustes de Correo y Envío Automático
          </h2>

          <form onSubmit={handleSaveMail} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Método de Envío</label>
              <select 
                value={emailMethod} 
                onChange={e => setEmailMethod(e.target.value)} 
                className="input-field" 
                style={{ padding: "8px 12px", minHeight: "38px" }}
              >
                <option value="brevo">🚀 Brevo API (Recomendado) — sin SMTP, fiable con adjuntos</option>
                <option value="smtp">SMTP Personalizado — servidor externo con credenciales</option>
                <option value="sendmail">Sendmail Local — sin credenciales (servidor Linux)</option>
              </select>
            </div>

            {/* Brevo Fields */}
            {emailMethod === "brevo" && (
              <>
                <div style={{ gridColumn: "span 2", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: "8px", padding: "12px 16px", fontSize: "0.8rem", color: "#92400e" }}>
                  <strong>🔑 Brevo API:</strong> Accede a tu cuenta de Brevo → SMTP &amp; API y crea una API Key. El email remitente debe estar verificado.
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Clave API de Brevo</label>
                  <input 
                    type="password" 
                    value={brevoApiKey} 
                    onChange={e => setBrevoApiKey(e.target.value)} 
                    className="input-field" 
                    placeholder="xkeysib-..."
                    autoComplete="new-password"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Email Remitente (verificado)</label>
                  <input 
                    type="email" 
                    value={brevoSenderEmail} 
                    onChange={e => setBrevoSenderEmail(e.target.value)} 
                    className="input-field" 
                    placeholder="informes@tudominio.com"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Nombre del Remitente</label>
                  <input 
                    type="text" 
                    value={brevoSenderName} 
                    onChange={e => setBrevoSenderName(e.target.value)} 
                    className="input-field" 
                    placeholder="Plan Algodón"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
              </>
            )}

            {/* SMTP Fields */}
            {emailMethod === "smtp" && (
              <>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Servidor SMTP (Host)</label>
                  <input 
                    type="text" 
                    value={smtpHost} 
                    onChange={e => setSmtpHost(e.target.value)} 
                    className="input-field" 
                    placeholder="smtp.example.com"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Puerto SMTP</label>
                  <input 
                    type="text" 
                    value={smtpPort} 
                    onChange={e => setSmtpPort(e.target.value)} 
                    className="input-field" 
                    placeholder="587"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input 
                    type="checkbox" 
                    id="smtpSecure"
                    checked={smtpSecure} 
                    onChange={e => setSmtpSecure(e.target.checked)} 
                    style={{ width: "18px", height: "18px", accentColor: "var(--primary-color)" }}
                  />
                  <label htmlFor="smtpSecure" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Conexión SSL/TLS (Puerto 465)</label>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Usuario SMTP (Email)</label>
                  <input 
                    type="text" 
                    value={smtpUser} 
                    onChange={e => setSmtpUser(e.target.value)} 
                    className="input-field" 
                    placeholder="noreply@example.com"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Contraseña SMTP</label>
                  <input 
                    type="password" 
                    value={smtpPass} 
                    onChange={e => setSmtpPass(e.target.value)} 
                    className="input-field" 
                    placeholder="••••••••"
                    autoComplete="new-password"
                    style={{ padding: "8px 12px", minHeight: "38px" }}
                  />
                </div>
              </>
            )}

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Destinatarios de correo (separados por comas)</label>
              <input 
                type="text" 
                value={emailRecipients} 
                onChange={e => setEmailRecipients(e.target.value)} 
                className="input-field" 
                placeholder="jefe@example.com, auditor@example.com"
                style={{ padding: "8px 12px", minHeight: "38px" }}
              />
            </div>

            <div style={{ borderTop: "1px dashed var(--border-color)", gridColumn: "span 2", paddingTop: "1rem" }} />

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Hora de Envío Diario (Horario Madrid)</label>
              <input
                type="time"
                value={emailScheduleHour}
                onChange={e => setEmailScheduleHour(e.target.value)}
                className="input-field"
                style={{ padding: "8px 12px", minHeight: "38px" }}
              />
              <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "4px 0 0 0" }}>Formato HH:MM — puedes poner cualquier hora para pruebas</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input 
                type="checkbox" 
                id="emailScheduleEnabled"
                checked={emailScheduleEnabled} 
                onChange={e => setEmailScheduleEnabled(e.target.checked)} 
                style={{ width: "18px", height: "18px", accentColor: "var(--primary-color)", cursor: "pointer" }}
              />
              <label htmlFor="emailScheduleEnabled" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>Activar Envío Diario Automático</label>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Contraseña para Reporte Público (Predeterminada: netdata)</label>
              <input 
                type="text" 
                value={publicReportPassword} 
                onChange={e => setPublicReportPassword(e.target.value)} 
                className="input-field" 
                placeholder="netdata"
                style={{ padding: "8px 12px", minHeight: "38px" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Pie de Página del Correo (Soporta HTML)</label>
              <textarea
                value={emailFooter}
                onChange={e => setEmailFooter(e.target.value)}
                className="input-field"
                placeholder='Ejemplo: <p><a href="...">Info</a></p>'
                rows={3}
                style={{ padding: "8px 12px", minHeight: "80px", fontFamily: "monospace", width: "100%", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
              />
            </div>

            <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  className="btn"
                  disabled={sendingTest || sendingManual || savingMail}
                  style={{ flex: 1, background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 700, minHeight: "44px", cursor: "pointer" }}
                >
                  {sendingTest ? "Enviando..." : "📧 Enviar Correo de Prueba"}
                </button>

                <button
                  type="button"
                  onClick={handleSendDailyReportManual}
                  className="btn"
                  disabled={sendingTest || sendingManual || savingMail}
                  style={{ flex: 1.5, background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 700, minHeight: "44px", cursor: "pointer" }}
                >
                  {sendingManual ? "Enviando..." : "✉️ Enviar Reporte Diario (Manual)"}
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={sendingTest || sendingManual || savingMail}
                style={{ width: "100%", fontWeight: 700, minHeight: "44px", justifyContent: "center" }}
              >
                {savingMail ? "Guardando..." : "Guardar Configuración de Correo"}
              </button>
            </div>

          </form>
        </div>

        {/* 4. PERSONALIZACIÓN DEL CUESTIONARIO Y TRADUCCIONES */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: 700, borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            Personalización del Cuestionario Multilingüe
          </h2>
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1.5rem" }}>
            Configura de forma sencilla las opciones de ubicación, daños, llaves y límites de atenuación para el formulario guiado.
            Los comentarios generados finales siempre se compilarán en español.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Link 
              href="/admin/questionnaire" 
              className="btn btn-primary"
              style={{ justifyContent: "center", minHeight: "44px", fontWeight: 700, borderRadius: "8px" }}
            >
              Configurar Opciones del Formulario Guiado (Visual)
            </Link>

            <details style={{ borderTop: "1px dashed var(--border-color)", paddingTop: "12px", marginTop: "4px" }}>
              <summary style={{ fontSize: "0.82rem", color: "#6b7280", cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>
                Editar Estructura Avanzada (JSON)
              </summary>
              <form onSubmit={handleSaveQuest} style={{ marginTop: "10px" }}>
                <div style={{ marginBottom: "1rem" }}>
                  <textarea 
                    value={questJson}
                    onChange={e => setQuestJson(e.target.value)}
                    rows={12}
                    style={{
                      width: "100%",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      padding: "10px",
                      background: "var(--bg-color)",
                      color: "var(--text-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px"
                    }}
                  />
                </div>
                
                <div style={{ display: "flex", gap: "10px" }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={savingQuest}
                    style={{ flex: 1.5, justifyContent: "center", minHeight: "40px", borderRadius: "6px" }}
                  >
                    {savingQuest ? "Guardando..." : "Guardar JSON"}
                  </button>
                  <button 
                    type="button" 
                    className="btn"
                    onClick={() => {
                      if (confirm("¿Estás seguro de que deseas restablecer los valores predeterminados del cuestionario? Esto sobrescribirá los cambios no guardados.")) {
                        const DEFAULT_CONFIG = {
                          threshold: 22.99,
                          noSignalValue: 70.0,
                          ubicacion: {
                            label_es: "Dónde se encuentra la CTO",
                            label_uk: "Де знаходиться CTO",
                            options: [
                              { es: "Interior - En techo falso", uk: "Внутрішній - у підвісній стелі" },
                              { es: "Interior > en la pared", uk: "Внутрішній > на стіні" },
                              { es: "Poste", uk: "Стовп" },
                              { es: "En Registro", uk: "В коробці/реєстрі" },
                              { es: "Indicar el número de la planta > de metal, grande", uk: "Вказати номер поверху > металевий, великий" },
                              { es: "Indicar el número de la planta > de madera", uk: "Вказати номер поверху > дерев'яний" },
                              { es: "Indicar el número de la planta > en vertical", uk: "Вказати номер поверху > вертикальний" },
                              { es: "Arqueta", uk: "Люк/Колодязь" },
                              { es: "Riti", uk: "Ріті (щитова)" },
                              { es: "Otros (introducir manualmente)", uk: "Інше (ввести вручну)" }
                            ]
                          },
                          danos: {
                            label_es: "¿La CTO está con daños, visibles suciedades?",
                            label_uk: "Чи має CTO видимі пошкодження або бруд?",
                            options: [
                              { es: "Le falta la tapa", uk: "Відсутня кришка" },
                              { es: "Tiene cables rotos o dañados", uk: "Має обірвані або пошкоджені кабелі" },
                              { es: "Tiene cables doblados", uk: "Має загнуті кабелі" },
                              { es: "No se puede cerrar", uk: "Не закривається" },
                              { es: "Está sucia y/o llena de agua", uk: "Брудна та/або заповнена водою" },
                              { es: "Le faltan enfrentadores", uk: "Відсутні з'єднувачі/адаптери" },
                              { es: "Tiene los divisores/splitter rotos", uk: "Має зламані дільники/спліттери" }
                            ]
                          },
                          llaves: {
                            label_es: "¿Se requieren llaves?",
                            label_uk: "Чи потрібні ключі?",
                            options: [
                              { es: "Nombre del presidente/conserje", uk: "Ім'я голови/консьєржа" },
                              { es: "Número de teléfono", uk: "Номер телефону" },
                              { es: "No tengo ningún dato", uk: "Немає жодних даних" }
                            ]
                          },
                          antala: {
                            label_es: "¿Se requiere Levantamiento en Antala?",
                            label_uk: "Чи потрібне внесення в Antala?",
                            text_yes: "Se realiza sincronismo/levantamiento en Antala. Se realizan etiquetas de caja, cable y divisor.",
                            text_failed: "No se ha podido realizar el sincronismo/levantamiento en Antala debido a que:"
                          },
                          influencia: {
                            label_es: "Área de influencia",
                            label_uk: "Зона впливу",
                            options: [
                              { key: "porterillo", es: "Porterillo automático", uk: "Домофон", text: "Se adjunta foto del porterillo automático" },
                              { key: "calle", es: "Calle", uk: "Вулиця" },
                              { key: "otros", es: "Otros", uk: "Інше" }
                            ]
                          }
                        };
                        setQuestJson(JSON.stringify(DEFAULT_CONFIG, null, 2));
                      }
                }}
                style={{ flex: 1, background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", justifyContent: "center", minHeight: "40px", cursor: "pointer", borderRadius: "6px" }}
              >
                Restablecer
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  </div>
</div>
  );
}
