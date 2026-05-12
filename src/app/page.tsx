"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Info,
  LayoutDashboard,
  ExternalLink,
  Code2,
  X,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PROJECTS from "@/lib/flows";

const ApiBadge = ({ name }: { name: string }) => {
  const mapping: Record<string, { label: string; color: string }> = {
    Turitop: { label: "Turitop", color: "bg-[#2B4CFF]" },
    "Google Calendar": { label: "G-Calendar", color: "bg-[#4285F4]" },
    n8n: { label: "n8n", color: "bg-[#EA4B71]" },
    Email: { label: "Email", color: "bg-[#8B5CF6]" },
    "Google Docs": { label: "G-Docs", color: "bg-[#4285F4]" },
    IA: { label: "IA", color: "bg-[#8B5CF6]" },
  };

  const info = mapping[name] || { label: name, color: "bg-slate-700" };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white cursor-help",
              info.color
            )}
          >
            {info.label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-white/10 text-white text-[10px]">
          Herramienta: {name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const ApiReferenceModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (!isOpen) return null;

  const apis = [
    {
      name: "Turitop API",
      endpoints: [
        { method: "GET", url: "/api/v1/bookings", desc: "Listar reservas" },
        {
          method: "POST",
          url: "/api/v1/webhooks/booking",
          desc: "Webhook reserva",
        },
        { method: "PUT", url: "/api/v1/bookings/:id", desc: "Actualizar" },
      ],
    },
    {
      name: "Google Calendar API",
      endpoints: [
        { method: "PUT", url: "PUT /calendar/v3/events/:id", desc: "Update event" },
        {
          method: "GET",
          url: "GET /calendar/v3/events",
          desc: "List events",
        },
      ],
    },
    {
      name: "n8n Webhook",
      endpoints: [
        {
          method: "POST",
          url: "POST /webhook/turitop",
          desc: "Recibir eventos",
        },
        { method: "WAIT", url: "Wait node", desc: "Espera Webhook/IP" },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#0A1F5C] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Code2 className="text-[#2B4CFF]" />
            <h3 className="text-xl font-bold text-white">
              Referencia técnica para el equipo de desarrollo
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-xs text-blue-200 leading-relaxed">
            <Info size={14} className="inline mr-2 mb-0.5" />
            Esta sección contiene los endpoints y modelos de datos necesarios
            para la implementación. No es necesaria para la validación del
            cliente.
          </div>
          {apis.map((api) => (
            <div key={api.name} className="space-y-4">
              <h4 className="text-sm font-bold text-[#2B4CFF] uppercase tracking-widest">
                {api.name}
              </h4>
              <div className="space-y-2">
                {api.endpoints.map((ep, i) => (
                  <div
                    key={i}
                    className="bg-black/20 p-3 rounded-xl border border-white/5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded font-bold",
                          ep.method === "POST"
                            ? "bg-blue-500/20 text-blue-400"
                            : ep.method === "GET"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                        )}
                      >
                        {ep.method}
                      </span>
                      <span className="text-slate-500">{ep.desc}</span>
                    </div>
                    <div className="text-slate-300 break-all">{ep.url}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Connector = ({ label }: { label?: string } = {}) => (
  <div className="flex flex-col items-center h-20">
    <div className="w-px h-full border-l-2 border-dotted border-[#2B4CFF44]"></div>
    <div className="text-[#2B4CFF] -mt-1 flex items-center gap-1">
      {label && (
        <span className="text-[10px] font-bold text-[#2B4CFF] opacity-70">
          {label}
        </span>
      )}
      <ChevronDown size={16} />
    </div>
  </div>
);
const FlowStep = ({ step, isBranch = false }: { step: any; isBranch?: boolean }) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const config: Record<
    string,
    { emoji: string; label: string; color: string; bg: string }
  > = {
    trigger: {
      emoji: "⚡",
      label: "INICIO",
      color: "border-[#2B4CFF]",
      bg: "bg-[#0A1F5C]",
    },
    action: {
      emoji: "✅",
      label: "ACCIÓN",
      color: "border-[#16A34A]",
      bg: "bg-[#0f2744]",
    },
    wait: {
      emoji: "⏳",
      label: "ESPERA",
      color: "border-[#D97706]",
      bg: "bg-[#78350F22]",
    },
    decision: {
      emoji: "🔀",
      label: "CONDICIÓN",
      color: "border-[#D97706]",
      bg: "bg-[#78350F22]",
    },
    branch_yes: {
      emoji: "👍",
      label: "",
      color: "border-[#16A34A]",
      bg: "bg-[#064E3B22]",
    },
    branch_no: {
      emoji: "👎",
      label: "",
      color: "border-[#DC2626]",
      bg: "bg-[#7F1D1D22]",
    },
    api_call: {
      emoji: "📤",
      label: "COMUNICACIÓN",
      color: "border-[#94A3B8]",
      bg: "bg-[#0f2744]",
    },
    notification: {
      emoji: "📧",
      label: "NOTIFICACIÓN",
      color: "border-[#8B5CF6]",
      bg: "bg-[#1e1433]",
    },
    ai: {
      emoji: "🤖",
      label: "ASISTENTE IA",
      color: "border-[#8B5CF6]",
      bg: "bg-[#4C1D9522]",
    },
    end: {
      emoji: "🏁",
      label: "FIN",
      color: "border-[#10B981]",
      bg: "bg-[#064E3B]",
    },
  };

  const current = config[step.type] || config.action;

  return (
    <div
      className={cn(
        "relative w-full max-w-2xl mx-auto group",
        isBranch && "max-w-full"
      )}
    >
      <div
        className={cn(
          "relative z-10 p-4 rounded-xl border-l-4 transition-all duration-300",
          current.bg,
          current.color,
          "border-y border-r border-white/5 shadow-xl"
        )}
      >
        {step.branchLabel && (
          <div
            className={cn(
              "absolute -top-3 right-4 text-[10px] font-bold px-2 py-0.5 rounded",
              step.type === "branch_yes"
                ? "bg-[#16A34A] text-white"
                : "bg-[#DC2626] text-white"
            )}
          >
            {step.branchLabel}
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                  step.type === "trigger" ? "bg-white/20" : "bg-[#2B4CFF22]"
                )}
              >
                {current.emoji}
              </div>
              {current.label && (
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                  {current.label}
                </span>
              )}
            </div>
            <div>
              <h4 className="font-bold text-slate-100 leading-tight text-base">
                {step.title}
              </h4>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                {step.subtitle}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex gap-1">
              {step.api?.map((a: string) => (
                <ApiBadge key={a} name={a} />
              ))}
            </div>
            {step.details && step.details.length > 0 && (
              <button
                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors group/btn"
              >
                {isDetailsOpen ? "Ocultar" : "Ver detalles técnicos"}
                {isDetailsOpen ? (
                  <ChevronUp
                    size={12}
                    className="group-hover/btn:-translate-y-0.5 transition-transform"
                  />
                ) : (
                  <ChevronDown
                    size={12}
                    className="group-hover/btn:translate-y-0.5 transition-transform"
                  />
                )}
              </button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden transition-all duration-500 ease-in-out",
            isDetailsOpen
              ? "max-h-96 mt-4 opacity-100"
              : "max-h-0 opacity-0"
          )}
        >
          <div className="pt-4 border-t border-white/10 bg-black/20 -mx-4 px-4 pb-2">
            <p className="text-[10px] font-bold text-[#2B4CFF] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="text-base">🔧</span> Detalles técnicos
            </p>
            <ul className="space-y-2">
              {step.details?.map((detail: string, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[11px] text-slate-400 font-mono"
                >
                  <span className="text-[#2B4CFF]">›</span>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const FlowDiagramView = ({ steps }: { steps: any[] }) => {
  const renderedSteps = useMemo(() => {
    const result: any[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.type === "decision") {
        result.push({
          type: "decision_group",
          decision: step,
          yes: steps[i + 1],
          no: steps[i + 2],
        });
        i += 2;
      } else {
        result.push(step);
      }
    }
    return result;
  }, [steps]);

  return (
    <div className="py-8 px-4 space-y-12">
      {renderedSteps.map((item, idx) => (
        <div key={idx}>
          {item.type === "decision_group" ? (
            <>
              <FlowStep step={item.decision} />
              <div className="flex flex-col items-center h-20">
                <div className="w-px h-full border-l-2 border-dotted border-[#2B4CFF44]"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16 max-w-5xl mx-auto relative">
                <div className="hidden md:block absolute top-0 left-1/4 right-1/4 h-px border-t-2 border-dotted border-[#2B4CFF44]"></div>
                <div className="flex flex-col items-center">
                  <div className="md:hidden w-px h-6 border-l-2 border-dotted border-[#2B4CFF44]"></div>
                  <FlowStep step={item.yes} isBranch />
                </div>
                <div className="flex flex-col items-center">
                  <div className="md:hidden w-px h-6 border-l-2 border-dotted border-[#2B4CFF44]"></div>
                  <FlowStep step={item.no} isBranch />
                </div>
              </div>
              <Connector />
            </>
          ) : (
            <>
              <FlowStep step={item} />
              <Connector />
            </>
          )}
        </div>
      ))}

      <div className="flex flex-col items-center mt-8">
        <Connector />
        <div className="bg-[#064E3B] text-white p-3 rounded-full shadow-lg shadow-emerald-900/20">
          <CheckCircle2 size={24} />
        </div>
        <span className="text-[10px] font-bold text-emerald-500 mt-2 tracking-widest uppercase">
          Fin del Proceso
        </span>
      </div>
    </div>
  );
};

const PanelSpecsView = ({ data }: { data: any }) => {
  return (
    <div className="py-8 px-4 max-w-5xl mx-auto space-y-8">
      <div className="bg-[#0f2d1c] border border-[#16A34A33] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{data.icon}</span>
          <div>
            <h3 className="text-lg font-bold text-slate-100">
              Arquitectura del Panel
            </h3>
            <p className="text-sm text-slate-400">{data.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.apis.map((a: string) => (
            <span
              key={a}
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-[#2B4CFF]"
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.tabs.map((tab: any) => (
          <div
            key={tab.id}
            className="bg-[#1e2a5c] border border-[#2B4CFF33] rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{tab.icon}</span>
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                {tab.name}
              </h4>
            </div>
            <div className="space-y-2">
              {tab.items.map((item: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <span className="text-sm text-slate-300">{item.label}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      item.type === "Required"
                        ? "bg-[#2B4CFF22] text-[#2B4CFF]"
                        : item.type === "Calc"
                          ? "bg-[#D9770622] text-[#D97706]"
                          : item.type === "Sum"
                            ? "bg-[#16A34A22] text-[#16A34A]"
                            : item.type === "Count"
                              ? "bg-[#8B5CF622] text-[#8B5CF6]"
                              : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {item.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="text-xl">💾</span> Modelos de datos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.models.map((model: any) => (
            <div
              key={model.name}
              className="bg-[#0d1b2a] border border-white/5 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{model.icon}</span>
                <h5 className="text-sm font-bold text-slate-200">
                  {model.name}
                </h5>
              </div>
              <div className="space-y-1.5">
                {model.fields.map((field: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[11px] font-mono"
                  >
                    <span className="text-slate-300">{field.name}</span>
                    <span className="text-slate-500">{field.type}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center mt-8">
        <div className="bg-[#064E3B] text-white p-3 rounded-full shadow-lg shadow-emerald-900/20">
          <CheckCircle2 size={24} />
        </div>
        <span className="text-[10px] font-bold text-emerald-500 mt-2 tracking-widest uppercase">
          Fin del Diseño
        </span>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function Home() {
  const [activeId, setActiveId] = useState("01");
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const activeProject =
    PROJECTS.find((p) => p.id === activeId) || PROJECTS[0];
  const totalSteps = PROJECTS.reduce((acc, p) => acc + (p.steps?.length || 0), 0);

  const handleProjectChange = (id: string) => {
    if (id === activeId) return;
    setIsChanging(true);
    setTimeout(() => {
      setActiveId(id);
      setIsChanging(false);
    }, 300);
  };

  const isPanel = activeId === "04";

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#0d1b2a] text-slate-200 font-['Space_Grotesk'] selection:bg-[#2B4CFF] selection:text-white">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        
        body {
          font-family: 'Space Grotesk', sans-serif;
        }
        
        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>

      {/* SIDEBAR (Desktop) */}
      <aside className="hidden md:flex w-[280px] bg-[#0A1F5C] border-r border-white/5 flex-col shrink-0 z-50">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-[#2B4CFF] rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
              <LayoutDashboard size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-white">
              Gourmet Madrid
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Automatizaciones n8n
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          <div className="px-2 mb-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Proyectos Activos
            </span>
          </div>
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleProjectChange(p.id)}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 group",
                activeId === p.id
                  ? "bg-[#2B4CFF] text-white shadow-lg shadow-blue-900/20"
                  : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center",
                    activeId === p.id ? "bg-white/20" : "bg-white/5"
                  )}
                >
                  {p.id}
                </span>
                <span className="text-sm font-semibold text-left">
                  {p.title}
                </span>
              </div>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold",
                  activeId === p.id ? "bg-white/20" : "bg-white/5"
                )}
              >
                {p.steps ? p.steps.length : "—"}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-6 bg-black/20 border-t border-white/5 space-y-4">
          <button
            onClick={() => setIsApiModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-all border border-white/5"
          >
            <Code2 size={14} className="text-[#2B4CFF]" />
            VER TODAS LAS APIs
          </button>
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>{PROJECTS.length} AUTOMATIZACIONES</span>
            <span>{totalSteps} PASOS TOTALES</span>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER & NAV */}
      <div className="md:hidden bg-[#0A1F5C] border-b border-white/5 p-4 sticky top-0 z-[60]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-[#2B4CFF]" />
            <h1 className="font-bold text-sm text-white">Gourmet Madrid</h1>
          </div>
          <button
            onClick={() => setIsApiModalOpen(true)}
            className="p-2 bg-white/5 rounded-lg"
          >
            <Code2 size={16} className="text-[#2B4CFF]" />
          </button>
        </div>
        <div className="relative">
          <select
            value={activeId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full bg-[#0d1b2a] border border-white/10 rounded-xl p-3 text-sm font-bold text-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#2B4CFF]"
          >
            {PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} - {p.title}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
          />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div
          className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            isChanging ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          )}
        >
          {/* HEADER */}
          <header className="p-8 md:p-12 bg-gradient-to-b from-[#0f2744] to-transparent">
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#2B4CFF22] text-[#2B4CFF] text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                      Proyecto {activeProject.id}
                    </span>
                    <div className="h-px w-8 bg-white/10"></div>
                    <div className="flex gap-1">
                      {activeProject.apis.map((a: string) => (
                        <ApiBadge key={a} name={a} />
                      ))}
                    </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                    {activeProject.title}
                  </h2>
                  <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
                    {activeProject.description}
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Complejidad
                    </p>
                    <p className="text-sm font-bold text-white">
                      {activeProject.steps
                        ? activeProject.steps.length
                        : "—"}{" "}
                      Pasos Lógicos
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full border-4 border-[#2B4CFF22] border-t-[#2B4CFF] flex items-center justify-center text-xs font-bold">
                    {activeProject.steps
                      ? Math.round((activeProject.steps.length / 12) * 100)
                      : 0}
                    %
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR */}
              {activeProject.steps && (
                <div className="mt-12 flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {activeProject.steps.map((_: any, i: number) => (
                    <div key={i} className="flex items-center">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-500",
                          "bg-[#2B4CFF] text-white shadow-lg shadow-blue-900/20"
                        )}
                      >
                        {i + 1}
                      </div>
                      {i < activeProject.steps.length - 1 && (
                        <div className="w-8 md:flex-1 h-0.5 bg-gradient-to-r from-[#2B4CFF] to-[#2B4CFF22] shrink-0"></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </header>

          {/* DIAGRAM AREA */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
            <div className="max-w-5xl mx-auto">
              {isPanel ? (
                <PanelSpecsView data={activeProject} />
              ) : (
                <FlowDiagramView steps={activeProject.steps || []} />
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="bg-[#0A1F5C] border-t border-white/5 p-4 flex items-center justify-between text-xs text-slate-400 font-medium z-50">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-[#2B4CFF]" />
            <span className="hidden sm:inline">
              Documento de validación · Sujeto a confirmación del cliente
            </span>
            <span className="sm:hidden">Doc. Validación</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              AgenciaIA Solutions <ExternalLink size={12} />
            </a>
          </div>
        </footer>
      </main>

      {/* API MODAL */}
      <ApiReferenceModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
      />
    </div>
  );
}