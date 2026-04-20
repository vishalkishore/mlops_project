import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  X,
  Terminal,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
  Zap,
  Download,
  Wand2,
  RefreshCw,
} from "lucide-react";
import SystemUsageChart from "./SystemUsageChart";
import * as api from "../services/features";

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg"];
const ACCEPTED_IMAGE_TYPES = ".png,.jpg,.jpeg,image/png,image/jpeg";

const AdvancedGenerator: React.FC = () => {
  const [mainImage, setMainImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [refImage, setRefImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Array<{ timestamp: number; cpu: number; gpu: number; memory: number }> | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const styles = ["FORMAL", "VOGUE", "GHIBLI"];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isMain: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        addLog(`Unsupported file type: ${file.name}. Only PNG, JPG, and JPEG are allowed.`);
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const base64Data = result.split(",")[1];
        const imageData = { data: base64Data, mimeType: file.type };
        if (isMain) {
          setMainImage(imageData);
          addLog(`Main image uploaded: ${file.name}`);
        } else {
          setRefImage(imageData);
          addLog(`Reference image uploaded: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMainImage = () => {
    setMainImage(null);
    setResultImage(null);
    setMetrics(null);
    if (mainInputRef.current) mainInputRef.current.value = "";
    addLog("Main image cleared.");
  };

  const clearRefImage = () => {
    setRefImage(null);
    if (refInputRef.current) refInputRef.current.value = "";
    addLog("Reference image cleared.");
  };

  const downloadImage = async () => {
    const imageToDownload = resultImage || (mainImage ? `data:${mainImage.mimeType};base64,${mainImage.data}` : null);
    if (!imageToDownload) { addLog("No image to download."); return; }
    try {
      const response = await fetch(imageToDownload);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reimagine_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addLog("Image downloaded successfully.");
    } catch (error: any) {
      addLog(`Download failed: ${error.message}`);
    }
  };

  const executePipeline = async () => {
    if (!mainImage) { addLog("ERROR: Source image is required."); return; }
    setIsProcessing(true);
    setResultImage(null);
    addLog("Initializing stylize pipeline...");
    try {
      const promptToSend = prompt.trim() || undefined;
      const styleToSend = selectedStyle || undefined;
      const refImageToSend = refImage ? refImage.data : undefined;
      addLog("Sending to /stylize API...");
      if (promptToSend) addLog(`  Prompt: "${promptToSend}"`);
      if (styleToSend) addLog(`  Style: ${styleToSend}`);
      if (refImageToSend) addLog(`  Reference image included`);
      const response = await api.stylize(mainImage.data, promptToSend, styleToSend, refImageToSend);
      if (response && response.success && response.data) {
        addLog(`✓ Processing complete: ${response.data.message}`);
        if (response.data.metrics) {
          setMetrics(response.data.metrics);
          addLog(`✓ Received ${response.data.metrics.length} metric samples`);
        }
        if (response.data.image) {
          setResultImage(`data:image/png;base64,${response.data.image}`);
          addLog("✓ Result image received and displayed.");
        }
      } else {
        addLog(`✗ Processing failed: ${response?.error || "Unknown error"}`);
      }
    } catch (error: any) {
      addLog(`CRITICAL ERROR: ${error.message}`);
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: "12px", fontFamily: "'Inter', 'Outfit', system-ui, sans-serif" }}>

      {/* ── MAIN CONTENT COLUMN ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>

        {/* TOP: Input + Output viewers */}
        <div style={{ display: "flex", gap: "10px", height: "46vh" }}>

          {/* INPUT Panel */}
          <div style={{
            flex: 1, position: "relative", borderRadius: "14px", overflow: "hidden",
            background: "linear-gradient(145deg, #0f0f1a, #141428)",
            border: "1px solid rgba(139,92,246,0.25)",
            boxShadow: "0 0 30px rgba(139,92,246,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Label */}
            <div style={{
              position: "absolute", top: 10, left: 12, zIndex: 20,
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 6,
              background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              color: "#a78bfa", textTransform: "uppercase",
            }}>
              <ImageIcon size={11} /> Input
            </div>

            {!mainImage ? (
              <div
                onClick={() => mainInputRef.current?.click()}
                style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  border: "2px dashed rgba(139,92,246,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 12, background: "rgba(139,92,246,0.08)",
                }}>
                  <Upload size={22} color="#7c3aed" />
                </div>
                <span style={{ color: "#6d6d8a", fontSize: 13, fontWeight: 500 }}>Upload Source Image</span>
                <span style={{ color: "#3d3d55", fontSize: 11, marginTop: 4 }}>PNG, JPG, JPEG only</span>
                <input type="file" ref={mainInputRef} onChange={(e) => handleImageUpload(e, true)} accept={ACCEPTED_IMAGE_TYPES} style={{ display: "none" }} />
              </div>
            ) : (
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={`data:${mainImage.mimeType};base64,${mainImage.data}`} alt="Source" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                <button onClick={clearMainImage} style={{
                  position: "absolute", top: 10, right: 10, zIndex: 30,
                  padding: "6px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f87171", display: "flex", alignItems: "center",
                }}>
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* OUTPUT Panel */}
          <div style={{
            flex: 1, position: "relative", borderRadius: "14px", overflow: "hidden",
            background: "linear-gradient(145deg, #0a1a14, #0d1f1a)",
            border: "1px solid rgba(16,185,129,0.25)",
            boxShadow: "0 0 30px rgba(16,185,129,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Label */}
            <div style={{
              position: "absolute", top: 10, left: 12, zIndex: 20,
              display: "flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 6,
              background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              color: "#34d399", textTransform: "uppercase",
            }}>
              <Sparkles size={11} /> Output
            </div>

            {!resultImage ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  border: "2px dashed rgba(16,185,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(16,185,129,0.06)",
                }}>
                  {isProcessing
                    ? <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(52,211,153,0.2)", borderTopColor: "#34d399", animation: "spin 0.8s linear infinite" }} />
                    : <Sparkles size={22} color="#065f46" />}
                </div>
                <span style={{ color: "#1d4d3a", fontSize: 13 }}>{isProcessing ? "Generating…" : "Result will appear here"}</span>
              </div>
            ) : (
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={resultImage} alt="Result" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                <div style={{
                  position: "absolute", bottom: 10, left: 12,
                  padding: "3px 10px", borderRadius: 20,
                  background: "rgba(16,185,129,0.9)", color: "#fff",
                  fontSize: 10, fontWeight: 700,
                }}>✓ RESULT</div>
                <button onClick={downloadImage} style={{
                  position: "absolute", bottom: 10, right: 10,
                  padding: "6px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#34d399", display: "flex", alignItems: "center",
                }} title="Download result">
                  <Download size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE: Utilities Bar */}

        <div style={{
          borderRadius: "14px",
          background: "linear-gradient(135deg, #0d0d1f 0%, #0a0a18 100%)",
          border: "1px solid rgba(139,92,246,0.2)",
          boxShadow: "0 4px 30px rgba(139,92,246,0.08)",
          padding: "14px 16px",
          display: "flex",
          alignItems: "flex-end",
          gap: "12px",
          flexShrink: 0,
        }}>

          {/* Reference Image Upload */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            <label style={{ fontSize: 10, color: "#6b6b8a", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Ref Image
            </label>
            {!refImage ? (
              <div
                onClick={() => refInputRef.current?.click()}
                style={{
                  width: 70, height: 58, borderRadius: 10, cursor: "pointer",
                  border: "1.5px dashed rgba(139,92,246,0.35)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: "rgba(139,92,246,0.05)",
                  transition: "background 0.2s, border-color 0.2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.12)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.6)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)"; }}
              >
                <Upload size={14} color="#7c3aed" />
                <span style={{ fontSize: 9, color: "#4c4c70", textAlign: "center" }}>Upload</span>
                <input type="file" ref={refInputRef} onChange={(e) => handleImageUpload(e, false)} accept={ACCEPTED_IMAGE_TYPES} style={{ display: "none" }} />
              </div>
            ) : (
              <div style={{ width: 70, height: 58, borderRadius: 10, overflow: "hidden", position: "relative", border: "1px solid rgba(139,92,246,0.5)" }}>
                <img src={`data:${refImage.mimeType};base64,${refImage.data}`} alt="Ref" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
                <button onClick={clearRefImage} style={{
                  position: "absolute", top: 2, right: 2,
                  background: "rgba(0,0,0,0.8)", border: "none", borderRadius: 4,
                  padding: 2, cursor: "pointer", color: "#f87171", display: "flex",
                }}>
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 58, background: "rgba(139,92,246,0.15)", flexShrink: 0, alignSelf: "flex-end" }} />

          {/* Style Presets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            <label style={{ fontSize: 10, color: "#6b6b8a", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Preset Style
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {styles.map((style) => {
                const isSelected = selectedStyle === style;
                return (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(isSelected ? null : style)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: "0.08em",
                      transition: "all 0.18s",
                      border: isSelected ? "1.5px solid #8b5cf6" : "1.5px solid rgba(139,92,246,0.25)",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(139,92,246,0.35), rgba(109,40,217,0.25))"
                        : "rgba(139,92,246,0.06)",
                      color: isSelected ? "#c4b5fd" : "#5a5a7a",
                      boxShadow: isSelected ? "0 0 14px rgba(139,92,246,0.3)" : "none",
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.25)"; }}
                  >
                    {style}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 58, background: "rgba(139,92,246,0.15)", flexShrink: 0, alignSelf: "flex-end" }} />

          {/* Prompt Input */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <label style={{ fontSize: 10, color: "#6b6b8a", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Style Prompt <span style={{ color: "#3d3d55", fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the style or transformation you want…"
              rows={3}
              style={{
                width: "100%", resize: "none",
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(139,92,246,0.2)",
                borderRadius: 10, padding: "8px 12px",
                fontSize: 12, color: "#d4d4f0",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "rgba(139,92,246,0.6)")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(139,92,246,0.2)")}
            />
          </div>

          {/* Generate Button */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            {!mainImage && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#d97706", justifyContent: "center" }}>
                <AlertCircle size={10} /> <span>Image required</span>
              </div>
            )}
            <button
              onClick={executePipeline}
              disabled={isProcessing || !mainImage}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "12px 28px", borderRadius: 10,
                fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                cursor: isProcessing || !mainImage ? "not-allowed" : "pointer",
                border: "none",
                transition: "all 0.2s",
                background: isProcessing || !mainImage
                  ? "rgba(60,60,80,0.5)"
                  : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: isProcessing || !mainImage ? "#3a3a5a" : "#fff",
                boxShadow: isProcessing || !mainImage ? "none" : "0 0 20px rgba(124,58,237,0.5)",
                minWidth: 120,
                height: 42,
              }}
              onMouseEnter={e => { if (!isProcessing && mainImage) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(124,58,237,0.7)"; }}
              onMouseLeave={e => { if (!isProcessing && mainImage) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(124,58,237,0.5)"; }}
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* BOTTOM: System Metrics */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SystemUsageChart metrics={metrics} />
        </div>
      </div>

      {/* ── RIGHT COLUMN: System Log ─────────────────────────────── */}
      <div style={{
        width: 300, flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: "linear-gradient(180deg, #06060f 0%, #08080f 100%)",
        border: "1px solid rgba(139,92,246,0.15)",
        borderRadius: 14,
        overflow: "hidden",
      }}>
        {/* Log header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(139,92,246,0.1)",
          background: "rgba(139,92,246,0.05)",
        }}>
          <Terminal size={13} color="#6d28d9" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#6b6b8a", textTransform: "uppercase" }}>System Log</span>
          <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 2s ease-in-out infinite" }} />
        </div>

        {/* Log entries */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: 4,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}>
          {logs.length === 0 ? (
            <span style={{ color: "#2a2a40", fontSize: 11, fontStyle: "italic" }}>
              System ready. Waiting for configuration…
            </span>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{
                fontSize: 10.5, color: i === 0 ? "#a78bfa" : "#4a4a6a",
                lineHeight: 1.5, wordBreak: "break-word",
                borderLeft: i === 0 ? "2px solid #7c3aed" : "2px solid transparent",
                paddingLeft: 6,
                transition: "color 1.5s",
              }}>
                <span style={{ opacity: 0.45, marginRight: 6 }}>›</span>{log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;600;700&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
};

export default AdvancedGenerator;
