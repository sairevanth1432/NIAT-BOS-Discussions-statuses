import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { fetchSheetData, loadConfig, validateSheet, saveConfig } from "@/lib/sheets-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle, RefreshCw, Building2, FileSpreadsheet,
  Search, FileDown, ChevronDown, ChevronRight, ExternalLink,
  MapPin, GraduationCap, Calendar, Landmark, FileText, Table,
  AlertTriangle, CheckCircle2, Clock, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { motion, AnimatePresence } from "framer-motion";

// ─── Tab filtering ───────────────────────────────────────────────────────────

const EXCLUDED_TABS = ["bos status dropdowns", "transcripts"];

function isStatusTab(name: string): boolean {
  const lc = name.trim().toLowerCase();
  if (EXCLUDED_TABS.some((ex) => lc === ex)) return false;
  if (lc.startsWith("statuses")) return true;
  return !lc.includes("dropdown") && !lc.includes("transcript");
}

// ─── Status definitions ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  "0": "Awaiting Partnership team Update",
  "1": "Blocked - Leadership / Regulatory Discussion",
  "2": "Under Review - Structure & Syllabi - Nxtwave Associate Dean Approval Pending",
  "3": "Waiting for University POC Time - Structure & Syllabi",
  "4": "CSS File Approved Internally",
  "5": "Waiting for University BOS Approval",
  "6": "BOS Approved – Ready for Implementation",
  "7": "No Intervention Required",
};

function countColor(key: string | null): string {
  if (key === null) return "text-muted-foreground";
  if (key === "0" || key === "1") return "text-red-600 dark:text-red-400 font-semibold";
  if (key === "2" || key === "3") return "text-orange-600 dark:text-orange-400 font-semibold";
  if (key === "4" || key === "5") return "text-yellow-600 dark:text-yellow-400 font-semibold";
  if (key === "6" || key === "7") return "text-emerald-600 dark:text-emerald-400 font-semibold";
  return "text-foreground";
}

// ─── Column detection ─────────────────────────────────────────────────────────

function detectSemesterColumns(headers: string[]): { sem: number; col: string }[] {
  const result: { sem: number; col: string }[] = [];
  for (let sem = 1; sem <= 8; sem++) {
    const col = headers.find((h) => {
      const t = h.trim().toLowerCase().replace(/\s+/g, " ");
      return (
        (t.includes(`sem ${sem}`) || t.includes(`semester ${sem}`)) &&
        t.includes("bos")
      );
    });
    if (col) {
      console.log(`Matched BOS column for Semester ${sem}:`, col);
      result.push({ sem, col });
    }
  }
  return result;
}

function detectField(headers: string[], ...candidates: string[]): string {
  return (
    headers.find((h) => candidates.some((c) => h.trim().toLowerCase() === c.toLowerCase())) ||
    headers.find((h) => candidates.some((c) => h.trim().toLowerCase().includes(c.toLowerCase()))) ||
    ""
  );
}

function getStatusKey(val: string): string | null {
  if (!val?.trim()) return null;
  const m = val.trim().match(/^(\d+)[.\s]/);
  return m ? m[1] : null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function doExportCSV(rows: Record<string, string>[], headers: string[], filename: string) {
  const lines = [headers.join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => `"${(r[h] || "").replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Count-up animation hook ─────────────────────────────────────────────────

function useCountUp(target: number, duration = 500): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setValue(current);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prev.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─── University row (expandable) ──────────────────────────────────────────────

const HEADER_FIELDS_LC = new Set(["university", "logo url", "code", "city", "delivery"]);
function isLogoCol(h: string) { return /logo/i.test(h); }
function isLinkCol(h: string) { return /sheet\s*link/i.test(h); }
function isDocUrlCol(h: string) { return /sheet\s*url.*curriculum/i.test(h) || isSemSyllabusCol(h) !== 0; }
function isSemSyllabusCol(h: string): number {
  const m = h.match(/sem(?:ester)?\s*([1-8])\b/i);
  if (!m) return 0;
  return /syllab|detailed|url|doc/i.test(h) ? parseInt(m[1], 10) : 0;
}

function getDocLinks(row: Record<string, string>, headers: string[]): { label: string; url: string; iconType: "table" | "file"; borderColor: string }[] {
  const results: { label: string; url: string; iconType: "table" | "file"; borderColor: string }[] = [];
  const currCol = headers.find((h) => /sheet\s*url.*curriculum/i.test(h));
  if (currCol) {
    const val = (row[currCol] || "").trim();
    if (val && /^https?:\/\//.test(val)) {
      results.push({ label: "Curriculum Sheet", url: val, iconType: "table", borderColor: "border-l-green-500" });
    }
  }
  const semEntries: { sem: number; col: string }[] = [];
  for (const h of headers) {
    const sem = isSemSyllabusCol(h);
    if (sem > 0 && !semEntries.some((e) => e.sem === sem)) {
      semEntries.push({ sem, col: h });
    }
  }
  semEntries.sort((a, b) => a.sem - b.sem);
  for (const { sem, col } of semEntries) {
    const val = (row[col] || "").trim();
    if (val && /^https?:\/\//.test(val)) {
      results.push({ label: `Sem ${sem} Syllabus`, url: val, iconType: "file", borderColor: "border-l-blue-500" });
    }
  }
  return results;
}

// Grouping for detail sections — order: BOS Status, Documents, Meeting Details, Curriculum, Other
const SECTION_MATCHERS: { title: string; test: (h: string) => boolean }[] = [
  { title: "BOS Status", test: (h) => /sem(ester)?\s*\d.*bos/i.test(h) },
  { title: "Meeting Details", test: (h) => /meeting|action\s*item|timeline.*close|number.*meeting/i.test(h) },
  { title: "Curriculum", test: (h) => /course|curriculum|framework|evaluation|syllab/i.test(h) },
];

function classifyField(h: string): string {
  for (const s of SECTION_MATCHERS) {
    if (s.test(h)) return s.title;
  }
  return "Other";
}


function QuickInfoPill({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 text-xs font-medium backdrop-blur-sm">
      <Icon className="w-3 h-3 text-slate-400 dark:text-slate-400" />
      {children}
    </span>
  );
}

function statusGlowColor(statusKey: string | null): string {
  if (statusKey === "0" || statusKey === "1") return "hover:shadow-red-500/10 dark:hover:shadow-red-500/20";
  if (statusKey === "2" || statusKey === "3") return "hover:shadow-orange-500/10 dark:hover:shadow-orange-500/20";
  if (statusKey === "4" || statusKey === "5") return "hover:shadow-yellow-500/10 dark:hover:shadow-yellow-500/20";
  if (statusKey === "6" || statusKey === "7") return "hover:shadow-emerald-500/10 dark:hover:shadow-emerald-500/20";
  return "";
}

function statusRingColor(statusKey: string | null): string {
  if (statusKey === "0" || statusKey === "1") return "ring-red-500/30";
  if (statusKey === "2" || statusKey === "3") return "ring-orange-500/30";
  if (statusKey === "4" || statusKey === "5") return "ring-yellow-500/30";
  if (statusKey === "6" || statusKey === "7") return "ring-emerald-500/30";
  return "ring-slate-300/30 dark:ring-slate-600/30";
}

function UniversityRow({
  row, index, headers,
  uniField, codeField, cityField, deliveryField, logoField,
  activeCol, studentField, startDateField,
}: {
  row: Record<string, string>; index: number; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string;
  activeCol: string; studentField: string; startDateField: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const name = row[uniField] || "—";
  const code = row[codeField] || "";
  const city = row[cityField] || "";
  const delivery = row[deliveryField] || "";
  const logo = row[logoField] || "";
  const students = row[studentField] || "";
  const startDate = row[startDateField] || "";
  const statusVal = row[activeCol] || "";
  const statusKey = getStatusKey(statusVal);
  const initial = name.charAt(0).toUpperCase();
  const docLinks = getDocLinks(row, headers);

  // Detail fields grouped by section
  const groupedDetails = useMemo(() => {
    const fields = headers.filter((h) => {
      if (!row[h]?.trim()) return false;
      if (isLogoCol(h)) return false;
      if (isLinkCol(h)) return false;
      if (isDocUrlCol(h)) return false;
      const lc = h.trim().toLowerCase();
      if (HEADER_FIELDS_LC.has(lc)) return false;
      if (lc === (studentField || "").trim().toLowerCase() && studentField) return false;
      if (lc === (startDateField || "").trim().toLowerCase() && startDateField) return false;
      if (activeCol && lc === activeCol.trim().toLowerCase()) return false;
      return true;
    });

    const groups: Record<string, string[]> = {};
    fields.forEach((h) => {
      const section = classifyField(h);
      if (!groups[section]) groups[section] = [];
      groups[section].push(h);
    });

    // Ordered: BOS Status → Meeting Details → Curriculum → Other
    const ordered: { title: string; fields: string[] }[] = [];
    for (const s of SECTION_MATCHERS) {
      if (groups[s.title]) ordered.push({ title: s.title, fields: groups[s.title] });
    }
    if (groups["Other"]) ordered.push({ title: "Other", fields: groups["Other"] });
    return ordered;
  }, [headers, row, activeCol, studentField, startDateField]);

  const statusBadgeClass =
    statusKey === "0" || statusKey === "1" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" :
    statusKey === "2" || statusKey === "3" ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" :
    statusKey === "4" || statusKey === "5" ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30" :
    statusKey === "6" || statusKey === "7" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
    "bg-slate-200/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-300/50 dark:border-slate-600/50";

  // Insert Documents & Sheets section after BOS Status
  const orderedSections = useMemo(() => {
    const result: { title: string; fields: string[]; type: "fields" | "docs" }[] = [];
    let bosInserted = false;
    for (const section of groupedDetails) {
      result.push({ title: section.title, fields: section.fields, type: "fields" });
      if (section.title === "BOS Status" && docLinks.length > 0) {
        result.push({ title: "Documents & Sheets", fields: [], type: "docs" });
        bosInserted = true;
      }
    }
    // If no BOS Status section exists, put docs first
    if (!bosInserted && docLinks.length > 0) {
      result.unshift({ title: "Documents & Sheets", fields: [], type: "docs" });
    }
    return result;
  }, [groupedDetails, docLinks]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={`glass-card hover:-translate-y-px hover:shadow-xl ${statusGlowColor(statusKey)} transition-all duration-200 rounded-xl border border-slate-200/80 dark:border-slate-700/80 mb-2`}
      data-testid={`modal-row-${index}`}
    >
      {/* CARD HEADER */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Logo */}
        {logo ? (
          <img
            src={logo} alt={name}
            className={`h-12 w-12 rounded-lg object-contain bg-slate-100 dark:bg-white/10 ring-2 ${statusRingColor(statusKey)} shrink-0`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={`h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-700 ring-2 ${statusRingColor(statusKey)} flex items-center justify-center shrink-0`}>
            <span className="text-base font-bold text-slate-500 dark:text-slate-300">{initial}</span>
          </div>
        )}

        {/* Name + code + quick info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900 dark:text-white text-base truncate">{name}</p>
            {code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 text-xs font-medium shrink-0">
                {code}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {city && <QuickInfoPill icon={MapPin}>{city}</QuickInfoPill>}
            {delivery && <QuickInfoPill icon={Landmark}>{delivery}</QuickInfoPill>}
            {students && <QuickInfoPill icon={GraduationCap}>{students}</QuickInfoPill>}
            {startDate && <QuickInfoPill icon={Calendar}>{startDate}</QuickInfoPill>}
          </div>
        </div>

        {/* Right side: status badge */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {statusVal && (
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-sm ${statusBadgeClass}`}>
              {statusKey !== null ? `${statusKey}.` : ""} {STATUS_LABELS[statusKey ?? ""] || statusVal}
            </span>
          )}
        </div>
      </div>

      {/* SEPARATOR + EXPAND BUTTON */}
      <div className="border-t border-slate-200/80 dark:border-slate-700/50 px-5 py-2 flex justify-between items-center">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-slate-100/80 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white backdrop-blur-sm"
        >
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="inline-flex"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </motion.span>
          {expanded ? "Less Details" : "More Details"}
        </motion.button>
      </div>

      {/* EXPANDABLE DETAIL SECTION */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-slate-200/80 dark:border-slate-700/50">
              {orderedSections.map((section) => (
                <div key={section.title} className="mt-4 first:mt-2">
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{section.title}</h4>

                  {/* Documents & Sheets section */}
                  {section.type === "docs" && (
                    <div className="flex flex-wrap gap-2">
                      {docLinks.map((doc) => (
                        <a
                          key={doc.label}
                          href={doc.url} target="_blank" rel="noopener noreferrer"
                          className={`group inline-flex items-center gap-2 h-10 px-4 rounded-lg border-l-4 ${doc.borderColor} bg-slate-100/80 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-sm font-medium transition-all duration-150 relative overflow-hidden`}
                        >
                          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          {doc.iconType === "table"
                            ? <Table className="w-[18px] h-[18px] text-green-500" />
                            : <FileText className="w-[18px] h-[18px] text-blue-500" />
                          }
                          {doc.label}
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Regular field sections */}
                  {section.type === "fields" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                      {section.fields.map((h) => {
                        const val = row[h] || "";
                        const isLong = val.length > 60;
                        return (
                          <div key={h} className={isLong ? "col-span-1 sm:col-span-2" : ""}>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</span>
                            <p className="text-slate-800 dark:text-slate-100 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{val}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {orderedSections.length === 0 && (
                <p className="text-slate-500 text-xs mt-3">No additional details available.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── University modal ─────────────────────────────────────────────────────────

function UniversityModal({
  open, onClose, title, rows, headers,
  uniField, codeField, cityField, deliveryField, logoField,
  activeCol, studentField, startDateField,
}: {
  open: boolean; onClose: () => void; title: string;
  rows: Record<string, string>[]; headers: string[];
  uniField: string; codeField: string; cityField: string;
  deliveryField: string; logoField: string;
  activeCol: string; studentField: string; startDateField: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col p-0 glass-card border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 data-[state=open]:animate-modal-in">
        {/* Modal header */}
        <div className="glass-card px-6 py-5 border-b border-slate-200/80 dark:border-slate-700/50 rounded-t-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white text-lg font-bold leading-snug">{title}</DialogTitle>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{rows.length} {rows.length === 1 ? "University" : "Universities"}</p>
          </DialogHeader>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search universities…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm border border-slate-200/80 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
              data-testid="input-detail-search"
            />
          </div>
        </div>

        {/* University cards list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No matching universities</p>
            </div>
          ) : (
            filtered.map((row, i) => (
              <UniversityRow
                key={i}
                row={row}
                index={i}
                headers={headers}
                uniField={uniField}
                codeField={codeField}
                cityField={cityField}
                deliveryField={deliveryField}
                logoField={logoField}
                activeCol={activeCol}
                studentField={studentField}
                startDateField={startDateField}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accentColor, borderColor, pulse, delay,
}: {
  label: string; value: number; icon: React.ElementType;
  accentColor: string; borderColor: string; pulse?: boolean; delay: number;
}) {
  const animated = useCountUp(value, 600);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2 }}
      className={`glass-card rounded-xl border border-slate-200/80 dark:border-slate-700/80 border-l-4 ${borderColor} p-4 flex items-center gap-3.5 cursor-default group hover:shadow-lg transition-shadow duration-200`}
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accentColor} shrink-0`}>
        <Icon className={`w-5 h-5 text-white ${pulse ? "animate-pulse" : ""}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">{animated}</p>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{label}</p>
      </div>
    </motion.div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBarStacked({
  approved, inProgress, needsAttention, total,
}: { approved: number; inProgress: number; needsAttention: number; total: number }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (total === 0) return null;

  const segments = [
    { key: "approved", count: approved, pct: (approved / total) * 100, color: "bg-emerald-500", label: "Approved" },
    { key: "inProgress", count: inProgress, pct: (inProgress / total) * 100, color: "bg-orange-500", label: "In Progress" },
    { key: "needsAttention", count: needsAttention, pct: (needsAttention / total) * 100, color: "bg-red-500", label: "Needs Attention" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.8 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative"
    >
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-200/80 dark:bg-slate-700/80 backdrop-blur-sm">
        {segments.map((seg) => (
          <motion.div
            key={seg.key}
            initial={{ width: 0 }}
            animate={{ width: `${seg.pct}%` }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className={`${seg.color} relative cursor-pointer transition-opacity duration-150 ${hovered && hovered !== seg.key ? "opacity-50" : "opacity-100"}`}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>
      <AnimatePresence>
        {hovered && (() => {
          const seg = segments.find((s) => s.key === hovered);
          if (!seg) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 glass-card rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-white border border-slate-200/80 dark:border-slate-700/80 shadow-lg z-10 whitespace-nowrap"
            >
              <span className={`inline-block w-2 h-2 rounded-full ${seg.color} mr-1.5`} />
              {seg.label}: {seg.count} ({seg.pct.toFixed(1)}%)
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

function SyncToast({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 right-6 z-50 glass-card rounded-xl px-4 py-3 border border-slate-200/80 dark:border-slate-700/80 shadow-lg flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-white"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Data updated
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pivot table ──────────────────────────────────────────────────────────────

function PivotTable({ tabName, config }: { tabName: string; config: any }) {
  const [activeSem, setActiveSem] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [showSyncToast, setShowSyncToast] = useState(false);
  const prevUpdatedAt = useRef(0);

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["sheetData", config.sheetId, tabName, config.useServerConfig],
    queryFn: () => fetchSheetData(config, tabName),
    refetchInterval: 60 * 1000,
    staleTime: 0,
    gcTime: 0,
  });

  // Show sync toast on auto-refresh
  useEffect(() => {
    if (dataUpdatedAt > 0 && prevUpdatedAt.current > 0 && dataUpdatedAt !== prevUpdatedAt.current) {
      setShowSyncToast(true);
      const t = setTimeout(() => setShowSyncToast(false), 2000);
      return () => clearTimeout(t);
    }
    prevUpdatedAt.current = dataUpdatedAt;
  }, [dataUpdatedAt]);

  const headers: string[] = useMemo(() => data?.headers ?? [], [data]);

  useEffect(() => {
    if (data) {
      console.log("Sheet headers:", data.headers);
      console.log("First row data:", (data.data as Record<string, string>[])?.[0]);
    }
  }, [data]);

  const semCols = useMemo(() => detectSemesterColumns(headers), [headers]);

  const uniField      = useMemo(() => detectField(headers, "University"), [headers]);
  const codeField     = useMemo(() => detectField(headers, "Code"), [headers]);
  const cityField     = useMemo(() => detectField(headers, "City"), [headers]);
  const deliveryField = useMemo(() => detectField(headers, "Delivery"), [headers]);
  const logoField     = useMemo(() => detectField(headers, "logo URL", "Logo URL", "logo"), [headers]);
  const studentField  = useMemo(() => detectField(headers, "Student Count", "Students", "No of Students", "Number of Students"), [headers]);
  const startDateField = useMemo(() => detectField(headers, "Start Date", "Starting Date", "Batch Start"), [headers]);

  useEffect(() => { setActiveSem(0); }, [tabName]);

  const semIndex = Math.min(activeSem, Math.max(0, semCols.length - 1));
  const activeEntry = semCols[semIndex];
  const activeCol = activeEntry?.col ?? "";

  const BLANK_LABEL = "Timeline for BOS is not yet decided";

  const pivotRows = useMemo(() => {
    if (!data || !activeCol) return [];
    const rows = (data.data as Record<string, string>[]).filter((r) => r[uniField]?.trim());
    const buckets: Record<string, Record<string, string>[]> = {};

    rows.forEach((row) => {
      const key = getStatusKey(row[activeCol] || "");
      const bucketKey = key === null ? "__blank__" : key;
      if (!buckets[bucketKey]) buckets[bucketKey] = [];
      buckets[bucketKey].push(row);
    });

    const keys = Object.keys(buckets).sort((a, b) => {
      if (a === "__blank__") return -1;
      if (b === "__blank__") return 1;
      return Number(a) - Number(b);
    });

    return keys.map((k) => ({
      key: k === "__blank__" ? null : k,
      label: k === "__blank__" ? BLANK_LABEL : `${k}. ${STATUS_LABELS[k] ?? k}`,
      rows: buckets[k],
    }));
  }, [data, activeCol, uniField]);

  const grandTotal = useMemo(() => pivotRows.reduce((s, r) => s + r.rows.length, 0), [pivotRows]);
  const animatedGrandTotal = useCountUp(grandTotal, 600);

  // Compute stat counts
  const { approved, inProgress, needsAttention } = useMemo(() => {
    let approved = 0, inProgress = 0, needsAttention = 0;
    for (const row of pivotRows) {
      const k = row.key;
      if (k === "6" || k === "7") approved += row.rows.length;
      else if (k === "2" || k === "3" || k === "4" || k === "5") inProgress += row.rows.length;
      else needsAttention += row.rows.length; // 0, 1, null
    }
    return { approved, inProgress, needsAttention };
  }, [pivotRows]);

  const semLabel = activeEntry ? `Semester ${activeEntry.sem} BOS Status` : "BOS Status";

  const modalRows = useMemo(() => {
    if (!modalOpen) return [];
    return pivotRows.find((r) => r.key === modalKey)?.rows ?? [];
  }, [modalOpen, modalKey, pivotRows]);
  const modalTitle = modalKey === null
    ? BLANK_LABEL
    : `${modalKey}. ${STATUS_LABELS[modalKey] ?? modalKey}`;

  const handleRefresh = useCallback(() => {
    setRefreshSpin(true);
    refetch();
    setTimeout(() => setRefreshSpin(false), 800);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Alert variant="destructive" className="rounded-xl glass-card border-red-500/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{(error as Error)?.message ?? "Failed to fetch sheet data."}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="rounded-lg ml-auto">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </motion.div>
    );
  }

  if (semCols.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-20 text-center">
        <div className="glass-card inline-flex flex-col items-center rounded-2xl p-10 border border-slate-200/80 dark:border-slate-700/80">
          <FileSpreadsheet className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-600 dark:text-slate-400">No BOS data for this semester yet</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Check back when BOS columns are added to the sheet.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Universities" value={grandTotal} icon={Building2} accentColor="bg-blue-500" borderColor="border-l-blue-500" delay={0.05} />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} accentColor="bg-emerald-500" borderColor="border-l-emerald-500" delay={0.1} />
        <StatCard label="In Progress" value={inProgress} icon={Clock} accentColor="bg-orange-500" borderColor="border-l-orange-500" delay={0.15} />
        <StatCard label="Needs Attention" value={needsAttention} icon={AlertTriangle} accentColor="bg-red-500" borderColor="border-l-red-500" pulse delay={0.2} />
      </div>

      {/* Progress bar */}
      <ProgressBarStacked approved={approved} inProgress={inProgress} needsAttention={needsAttention} total={grandTotal} />

      {/* Semester selector — segmented control */}
      {semCols.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex justify-start"
        >
          <div className="inline-flex items-center rounded-full p-1 glass-card border border-slate-200/80 dark:border-slate-700/80">
            {semCols.map((entry, i) => (
              <button
                key={entry.sem}
                onClick={() => setActiveSem(i)}
                className={`relative px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  semIndex === i
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                data-testid={`tab-semester-${entry.sem}`}
              >
                Semester {entry.sem}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">BOS Approval Status</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Click any row to view universities</p>
        </div>
        <div className="flex gap-2">
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline" size="sm"
              onClick={() => doExportCSV(
                data.data as Record<string, string>[],
                headers,
                `${tabName.replace(/[' ]/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.csv`
              )}
              className="gap-1.5 rounded-xl text-xs border-slate-200/80 dark:border-slate-600/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 glass-card"
              data-testid="button-export"
            >
              <FileDown className="w-3.5 h-3.5" /> Export
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              size="sm" onClick={handleRefresh} disabled={isRefetching}
              className="gap-1.5 rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-md"
              data-testid="button-refresh"
            >
              <motion.span
                animate={{ rotate: refreshSpin ? 360 : 0 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="inline-flex"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </motion.span>
              {isRefetching ? "Syncing…" : "Refresh"}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Pivot table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 shadow-sm glass-card"
      >
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px] bg-slate-800 dark:bg-slate-950 text-white text-sm font-semibold">
          <div className="px-5 py-3.5 border-r border-slate-700 dark:border-slate-800">{semLabel}</div>
          <div className="px-5 py-3.5 text-right">Count of Universities</div>
        </div>

        {/* Data rows */}
        {pivotRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
            No status data for this semester.
          </div>
        ) : (
          pivotRows.map((row, i) => {
            const isBlank = row.key === null;
            const cc = isBlank ? "text-slate-400 dark:text-slate-500" : countColor(row.key);

            return (
              <motion.button
                key={row.key ?? "__blank__"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.03 }}
                onClick={() => { setModalKey(row.key); setModalOpen(true); }}
                className={`w-full grid grid-cols-[1fr_140px] text-left text-sm transition-all duration-150 cursor-pointer group
                  ${i % 2 === 0 ? "bg-white/80 dark:bg-slate-900/80" : "bg-slate-50/80 dark:bg-slate-800/40"}
                  hover:bg-blue-50/80 dark:hover:bg-slate-700/80 border-t border-slate-200/80 dark:border-slate-700/50`}
                data-testid={`pivot-row-${row.key ?? "blank"}`}
              >
                <div className={`px-5 py-3.5 border-r border-slate-200/80 dark:border-slate-700/50 flex items-center gap-2 ${isBlank ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
                  <span className="flex-1">{row.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </div>
                <div className={`px-5 py-3.5 text-right tabular-nums ${cc}`}>
                  {row.rows.length}
                </div>
              </motion.button>
            );
          })
        )}

        {/* Grand total */}
        <div className="grid grid-cols-[1fr_140px] bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-sm backdrop-blur-sm">
          <div className="px-5 py-3.5 border-r border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-white text-base">Grand Total</div>
          <div className="px-5 py-3.5 text-right text-slate-900 dark:text-white tabular-nums text-base">{animatedGrandTotal}</div>
        </div>
      </motion.div>

      {/* Last sync */}
      {dataUpdatedAt > 0 && (
        <motion.p
          key={dataUpdatedAt}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          className="text-xs text-slate-400 dark:text-slate-500 text-right"
        >
          Last synced: {format(new Date(dataUpdatedAt), "MMM d, yyyy 'at' h:mm a")} · auto-refreshes every 60 s
        </motion.p>
      )}

      {/* Modal */}
      <UniversityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        rows={modalRows}
        headers={headers}
        uniField={uniField}
        codeField={codeField}
        cityField={cityField}
        deliveryField={deliveryField}
        logoField={logoField}
        activeCol={activeCol}
        studentField={studentField}
        startDateField={startDateField}
      />

      <SyncToast show={showSyncToast} />
    </div>
  );
}

// ─── Batch selector ───────────────────────────────────────────────────────────

function BatchSelector({
  activeBatch, onSelect, tabs,
}: { activeBatch: number; onSelect: (i: number) => void; tabs: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (tabs.length === 0) return null;

  const defaultTab = tabs[0];
  const otherTabs = tabs.slice(1);
  const isDefault = activeBatch === 0;

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onSelect(0)}
        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
          isDefault ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "glass-card text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200/80 dark:border-slate-700/80"
        }`}
        data-testid="tab-batch-latest"
      >
        {defaultTab}
      </motion.button>
      {otherTabs.length > 0 && (
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpen(!open)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              !isDefault ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "glass-card text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200/80 dark:border-slate-700/80"
            }`}
            data-testid="dropdown-older-batches"
          >
            {!isDefault ? tabs[activeBatch] : "Previous Batches"}
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
          </motion.button>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1.5 glass-card border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-lg py-1 min-w-[130px] z-50"
              >
                {otherTabs.map((tabName, i) => (
                  <button
                    key={tabName}
                    onClick={() => { onSelect(i + 1); setOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-150 ${
                      activeBatch === i + 1 ? "bg-blue-50/80 dark:bg-slate-700/80 text-blue-700 dark:text-blue-400 font-semibold" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-slate-700/50"
                    }`}
                    data-testid={`dropdown-item-${tabName}`}
                  >
                    {tabName}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const config = loadConfig();
  const [activeBatch, setActiveBatch] = useState(0);

  // Always fetch fresh sheet metadata (title + tab names) from the API
  const { data: sheetMeta } = useQuery({
    queryKey: ["sheetMeta", config?.sheetId, config?.useServerConfig],
    queryFn: async () => {
      if (!config) return null;
      const result = await validateSheet(config);
      if (result.valid) {
        // Update stored config with fresh metadata
        config.sheetNames = result.sheetNames;
        config.spreadsheetTitle = result.title;
        saveConfig(config);
        return { sheetNames: result.sheetNames ?? [], title: result.title ?? "" };
      }
      return null;
    },
    enabled: !!config,
    staleTime: 5 * 60 * 1000,
  });

  const statusTabs = useMemo(() => {
    const allTabs = sheetMeta?.sheetNames ?? config?.sheetNames ?? [];
    const filtered = allTabs.filter(isStatusTab);
    return [...filtered].reverse();
  }, [sheetMeta?.sheetNames, config?.sheetNames]);

  const dashboardTitle = sheetMeta?.title || config?.spreadsheetTitle || "BOS Approval Status";

  if (!config) { setLocation("/"); return null; }

  const activeTabName = statusTabs[activeBatch] ?? statusTabs[0] ?? "";

  return (
    <Layout>
      {/* Top brand bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 z-[100]" />

      <div className="space-y-8">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div className="flex-1">
            <div className="flex items-center justify-between pt-8 md:pt-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white pl-0 md:pl-[60px]" data-testid="text-report-title">
                {dashboardTitle}
              </h1>
              <div className="md:hidden"><LogoutButton /></div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 md:pl-[60px]">BOS status tracking across NIAT cohorts</p>
          </div>
          <div className="flex items-end gap-4">
            <BatchSelector activeBatch={activeBatch} onSelect={setActiveBatch} tabs={statusTabs} />
            <div className="hidden md:block"><LogoutButton /></div>
          </div>
        </motion.div>

        {/* Pivot table */}
        {activeTabName ? (
          <motion.div
            key={activeTabName}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PivotTable tabName={activeTabName} config={config} />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-20 text-center"
          >
            <div className="glass-card inline-flex flex-col items-center rounded-2xl p-10 border border-slate-200/80 dark:border-slate-700/80">
              <FileSpreadsheet className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-slate-600 dark:text-slate-400">No status tabs found in this spreadsheet.</p>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
