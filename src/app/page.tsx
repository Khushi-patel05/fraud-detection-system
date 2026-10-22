"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Users,
  X,
  Eye,
  RefreshCw,
  ScrollText,
} from "lucide-react";

type AuditTransaction = {
  transaction_id: number;
  transaction_reference: string;
  customer_id: number;
  customer_name: string;
  amount: string | number;
  transaction_location: string | null;
  transaction_status: string;
  transaction_time: string;
  usual_location: string | null;
  riskAnalysis: {
    riskScore: number;
    riskLevel: string;
    reasons: string[];
    analyzedAt: string;
  } | null;
};

type DashboardTransaction = {
  id: string;
  customerId: number;
  name: string;
  amount: number;
  location: string;
  risk: "High" | "Medium" | "Low";
  score: number;
  status: string;
  reasons: string[];
  transactionTime: string;
  usualLocation: string;
};

type FraudAlert = {
  alert_id: number;
  transaction_id: number;
  risk_score: number;
  risk_level: string;
  alert_reason: unknown;
  alert_status: string;
  created_at: string;
  resolved_at: string | null;
  transaction_reference: string;
  amount: number;
  transaction_location: string | null;
  customer_name: string;
  customer_id: number;
  assigned_analyst: string | null;
};

type InvestigationCase = {
  case_id: number;
  alert_id: number;
  assigned_to: number | null;
  case_status: "OPEN" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  conclusion: string | null;
  opened_at: string;
  closed_at: string | null;
  transaction_reference: string;
  amount: number | string;
  transaction_location: string | null;
  risk_score: number | string;
  risk_level: string;
  customer_name: string;
  assigned_analyst: string | null;
};

type InvestigationNote = {
  note_id: number;
  case_id: number;
  author_id: number | null;
  note_text: string;
  created_at: string;
  author_name: string | null;
};

type AuditLog = {
  log_id: number;
  user_id: number | null;
  action_type: string;
  entity_type: string;
  entity_id: string | number | null;
  details: Record<string, unknown> | string | null;
  created_at: string;
  user_name: string | null;
};

type Analyst = {
  user_id: number;
  full_name: string;
  email: string;
  role: "ADMIN" | "FRAUD_ANALYST";
  is_active: number | boolean;
};

type CustomerSummary = {
  id: number;
  name: string;
  transactions: DashboardTransaction[];
  totalAmount: number;
  highRiskCount: number;
};

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Transactions", icon: CreditCard },
  { label: "Risk Analysis", icon: BrainCircuit },
  { label: "Fraud Alerts", icon: ShieldAlert },
  { label: "Customers", icon: Users },
  { label: "Investigations", icon: Eye },
  { label: "Audit Logs", icon: ScrollText },
  { label: "Settings", icon: SettingsIcon },
];

const ALERT_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "CLOSED",
];

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getRisk(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

type DashboardSessionUser = {
  name?: string | null;
  email?: string | null;
  role?: "ADMIN" | "FRAUD_ANALYST";
};

export default function Home() {
  const [sessionUser, setSessionUser] = useState<DashboardSessionUser | null>(null);
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [riskFilter, setRiskFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [alertError, setAlertError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [savingAlertId, setSavingAlertId] = useState<number | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [investigations, setInvestigations] = useState<InvestigationCase[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [analystsError, setAnalystsError] = useState("");
  const [investigationsLoading, setInvestigationsLoading] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
  const [investigationMessage, setInvestigationMessage] = useState("");
  const [creatingAlertId, setCreatingAlertId] = useState<number | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [caseNotes, setCaseNotes] = useState<InvestigationNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [caseConclusion, setCaseConclusion] = useState("");
  const [casePriority, setCasePriority] = useState("MEDIUM");
  const [caseStatus, setCaseStatus] = useState("OPEN");
  const [caseAssignedTo, setCaseAssignedTo] = useState("");
  const [savingCase, setSavingCase] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsError, setAuditLogsError] = useState("");
  const [riskAnalysisLoading, setRiskAnalysisLoading] = useState(false);
  const [riskAnalysisMessage, setRiskAnalysisMessage] = useState("");
  const [riskAnalysisError, setRiskAnalysisError] = useState("");

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setApiError("");

      const response = await fetch("/api/transaction-audit", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load transaction data.");

      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error("The transaction API returned an invalid response.");
      }

      const mapped: DashboardTransaction[] = (
        result.data as AuditTransaction[]
      ).map((transaction) => {
        const score = Number(transaction.riskAnalysis?.riskScore ?? 0);

        return {
          id: transaction.transaction_reference,
          customerId: Number(transaction.customer_id),
          name: transaction.customer_name,
          amount: Number(transaction.amount),
          location: transaction.transaction_location ?? "Unknown",
          risk: getRisk(score),
          score,
          status: transaction.transaction_status,
          reasons: transaction.riskAnalysis?.reasons ?? [],
          transactionTime: transaction.transaction_time,
          usualLocation: transaction.usual_location ?? "Unknown",
        };
      });

      setTransactions(mapped);
      setLastUpdated(new Date().toLocaleTimeString("en-IN"));
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Unable to load transactions."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalysts = useCallback(async () => {
    try {
      setAnalystsError("");
      const response = await fetch("/api/users", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.users)) {
        throw new Error(result.error ?? "Failed to load active users.");
      }
      setAnalysts(result.users as Analyst[]);
    } catch (error) {
      setAnalystsError(error instanceof Error ? error.message : "Unable to load active users.");
    }
  }, []);

  const loadInvestigations = useCallback(async () => {
    try {
      setInvestigationsLoading(true);
      setInvestigationError("");
      const response = await fetch("/api/investigations", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.cases)) {
        throw new Error(result.error ?? "Failed to load investigation cases.");
      }
      setInvestigations(result.cases as InvestigationCase[]);
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to load investigations.");
    } finally {
      setInvestigationsLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      setAuditLogsLoading(true);
      setAuditLogsError("");
      const response = await fetch("/api/audit-logs", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.logs)) {
        throw new Error(result.error ?? "Failed to load audit logs.");
      }
      setAuditLogs(result.logs as AuditLog[]);
    } catch (error) {
      setAuditLogsError(error instanceof Error ? error.message : "Unable to load audit logs.");
    } finally {
      setAuditLogsLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true);
      setAlertError("");

      const response = await fetch("/api/fraud-alerts", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load fraud alerts.");

      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error("The fraud alerts API returned an invalid response.");
      }

      setAlerts(result.data as FraudAlert[]);
    } catch (error) {
      setAlertError(
        error instanceof Error ? error.message : "Unable to load fraud alerts."
      );
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionUser() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const session = await response.json();
        if (!cancelled && session?.user) {
          setSessionUser(session.user as DashboardSessionUser);
        }
      } catch (error) {
        console.error("Unable to load signed-in user:", error);
      }
    }

    void loadSessionUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = sessionUser?.name || sessionUser?.email || "Signed-in User";
  const displayRole = sessionUser?.role === "ADMIN" ? "Administrator" : "Fraud Analyst";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    void loadTransactions();
    void loadAlerts();
    void loadInvestigations();
    void loadAnalysts();
    void loadAuditLogs();
  }, [loadTransactions, loadAlerts, loadInvestigations, loadAnalysts, loadAuditLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      void loadTransactions();
      void loadAlerts();
      void loadInvestigations();
      void loadAnalysts();
      void loadAuditLogs();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, loadTransactions, loadAlerts, loadInvestigations, loadAnalysts, loadAuditLogs]);

  const totalTransactions = transactions.length;
  const highRiskCount = transactions.filter((t) => t.risk === "High").length;
  const mediumRiskCount = transactions.filter((t) => t.risk === "Medium").length;
  const lowRiskCount = transactions.filter((t) => t.risk === "Low").length;

  const customers: CustomerSummary[] = Array.from(
    transactions.reduce((map, transaction) => {
      const existing = map.get(transaction.customerId);

      if (existing) {
        existing.transactions.push(transaction);
        existing.totalAmount += transaction.amount;
        if (transaction.risk === "High") existing.highRiskCount += 1;
      } else {
        map.set(transaction.customerId, {
          id: transaction.customerId,
          name: transaction.name,
          transactions: [transaction],
          totalAmount: transaction.amount,
          highRiskCount: transaction.risk === "High" ? 1 : 0,
        });
      }
      return map;
    }, new Map<number, CustomerSummary>()).values()
  );

  const openAlerts = alerts.filter(
    (alert) => !["CLOSED", "FALSE_POSITIVE", "CONFIRMED_FRAUD"].includes(alert.alert_status)
  );

  const priorityAlerts = transactions.filter((t) => t.score >= 40);

  const filteredTransactions = transactions.filter((transaction) => {
    const text = [
      transaction.id,
      transaction.name,
      transaction.location,
      transaction.status,
    ].join(" ").toLowerCase();

    return (
      text.includes(search.toLowerCase()) &&
      (riskFilter === "All" || transaction.risk === riskFilter) &&
      (statusFilter === "All" || transaction.status === statusFilter)
    );
  });

  const filteredAlerts = alerts.filter((alert) => {
    const text = [
      alert.alert_id,
      alert.transaction_reference,
      alert.customer_name,
      alert.transaction_location ?? "",
      alert.alert_status,
      alert.risk_level,
    ].join(" ").toLowerCase();

    return (
      text.includes(search.toLowerCase()) &&
      (riskFilter === "All" ||
        alert.risk_level.toLowerCase() === riskFilter.toLowerCase()) &&
      (statusFilter === "All" || alert.alert_status === statusFilter)
    );
  });

  async function updateAlertStatus(alertId: number, status: string) {
    try {
      setSavingAlertId(alertId);
      setAlertError("");
      setAlertMessage("");

      const response = await fetch("/api/fraud-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, status }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to update alert status.");
      }

      setAlertMessage(`Alert #${alertId} updated to ${status.replaceAll("_", " ")}.`);
      await loadAlerts();
    } catch (error) {
      setAlertError(
        error instanceof Error ? error.message : "Unable to update alert."
      );
    } finally {
      setSavingAlertId(null);
    }
  }


  async function createInvestigation(alertId: number, priority = "MEDIUM") {
    try {
      setCreatingAlertId(alertId);
      setInvestigationError("");
      setInvestigationMessage("");
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, priority }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "Could not create case.");
      setInvestigationMessage(`Investigation case #${result.caseId} created for alert #${alertId}.`);
      await loadInvestigations();
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to create investigation.");
    } finally {
      setCreatingAlertId(null);
    }
  }

  async function openCaseNotes(item: InvestigationCase) {
    setSelectedCaseId(item.case_id);
    setCaseConclusion(item.conclusion ?? "");
    setCasePriority(item.priority);
    setCaseStatus(item.case_status);
    setCaseAssignedTo(item.assigned_to === null ? "" : String(item.assigned_to));
    setNoteDraft("");
    try {
      const response = await fetch(`/api/investigations/notes?caseId=${item.case_id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to load case notes.");
      setCaseNotes(result.notes as InvestigationNote[]);
      setInvestigationError("");
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to load notes.");
      setCaseNotes([]);
    }
  }

  async function saveInvestigationCase() {
    if (selectedCaseId === null) return;
    try {
      setSavingCase(true);
      setInvestigationError("");
      setInvestigationMessage("");
      const response = await fetch("/api/investigations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: selectedCaseId,
          status: caseStatus,
          priority: casePriority,
          assignedTo: caseAssignedTo || null,
          conclusion: caseConclusion,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to update case.");
      setInvestigationMessage(`Case #${selectedCaseId} updated successfully.`);
      await loadInvestigations();
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to update case.");
    } finally {
      setSavingCase(false);
    }
  }

  async function addInvestigationNote() {
    if (selectedCaseId === null || !noteDraft.trim()) return;
    try {
      setSavingCase(true);
      setInvestigationError("");
      const response = await fetch("/api/investigations/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: selectedCaseId, noteText: noteDraft.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to add note.");
      setNoteDraft("");
      const notesResponse = await fetch(`/api/investigations/notes?caseId=${selectedCaseId}`, { cache: "no-store" });
      const notesResult = await notesResponse.json();
      if (notesResponse.ok && notesResult.success) setCaseNotes(notesResult.notes as InvestigationNote[]);
      setInvestigationMessage("Investigation note saved.");
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to add note.");
    } finally {
      setSavingCase(false);
    }
  }

  async function runRiskAnalysis() {
    try {
      setRiskAnalysisLoading(true);
      setRiskAnalysisError("");
      setRiskAnalysisMessage("");

      const response = await fetch("/api/risk-analysis", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to run risk analysis.");
      }

      await loadTransactions();
      setRiskAnalysisMessage(
        `Analysis completed for ${result.count} transactions: ${result.highRiskCount} high, ${result.mediumRiskCount} medium, and ${result.lowRiskCount} low risk.`
      );
    } catch (error) {
      setRiskAnalysisError(
        error instanceof Error ? error.message : "Unable to run risk analysis."
      );
    } finally {
      setRiskAnalysisLoading(false);
    }
  }

  function exportReport() {
    const rows = [
      ["Transaction ID", "Customer", "Amount", "Location", "Risk", "Score", "Status"],
      ...filteredTransactions.map((t) => [
        t.id, t.name, String(t.amount), t.location, t.risk, String(t.score), t.status,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sentinelai-transaction-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setSearch("");
    setRiskFilter("All");
    setStatusFilter("All");
  }

  function renderTransactionsTable() {
    return (
      <article className="panel transactions-panel">
        <div className="panel-heading transactions-heading">
          <div>
            <h3>Transaction records</h3>
            <p>Live records loaded from MySQL and MongoDB</p>
          </div>
          <div className="table-actions">
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Filter by risk">
              <option value="All">All risk levels</option>
              <option value="High">High risk</option>
              <option value="Medium">Medium risk</option>
              <option value="Low">Low risk</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by transaction status">
              <option value="All">All statuses</option>
              {[...new Set(transactions.map((t) => t.status))].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button className="subtle-button" onClick={resetFilters}>Reset filters</button>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>TRANSACTION</th><th>CUSTOMER</th><th>AMOUNT</th>
                <th>LOCATION</th><th>RISK SCORE</th><th>STATUS</th><th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-state">Loading transactions…</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No transactions match your filters.</td></tr>
              ) : filteredTransactions.map((t) => (
                <tr key={t.id}>
                  <td><span className="transaction-id">{t.id}</span></td>
                  <td><div className="customer-cell"><div className="customer-avatar">{t.name.split(" ").map((n) => n[0]).join("")}</div><span>{t.name}</span></div></td>
                  <td className="amount-cell">{formatAmount(t.amount)}</td>
                  <td><span className="location-cell">{t.location}</span></td>
                  <td><div className="score-cell"><div className="score-track"><span style={{ width: `${t.score}%`, background: t.score >= 70 ? "#f87171" : t.score >= 40 ? "#fbbf24" : "#34d399" }} /></div><strong>{t.score}</strong></div></td>
                  <td><span className={`status-pill ${t.status.toLowerCase().replace(/\s+/g, "-")}`}>{t.status}</span></td>
                  <td><button className="row-action" aria-label={`View ${t.id}`} onClick={() => setSelectedTransaction(selectedTransaction === t.id ? null : t.id)}><Eye size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedTransaction && transactions.filter((t) => t.id === selectedTransaction).map((t) => (
          <div className="selected-alert" style={{ margin: "16px" }} key={t.id}>
            <Eye size={16} />
            <div><strong>{t.id} — {t.name}</strong><p>Score: {t.score}/100 · {t.risk} risk</p><p>{t.reasons.join("; ") || "No risk reasons recorded."}</p><p>Usual location: {t.usualLocation} · Current location: {t.location}</p><p>Transaction time: {formatDate(t.transactionTime)}</p></div>
          </div>
        ))}

        <div className="table-footer">
          <span>Showing {loading ? "…" : filteredTransactions.length} of {totalTransactions} transactions</span>
          <span className="footer-live"><span className="status-dot" />{loading ? "Loading…" : "Database connected"}</span>
        </div>
      </article>
    );
  }

  function renderFraudAlerts() {
    return (
      <article className="panel transactions-panel">
        <div className="panel-heading transactions-heading">
          <div>
            <h3>Fraud alert queue</h3>
            <p>Live alerts from the MySQL fraud_alerts table</p>
          </div>
          <div className="table-actions">
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Filter alert risk">
              <option value="All">All risk levels</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High risk</option>
              <option value="MEDIUM">Medium risk</option>
              <option value="LOW">Low risk</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter alert status">
              <option value="All">All alert statuses</option>
              {ALERT_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
            <button className="subtle-button" onClick={() => void loadAlerts()} disabled={alertsLoading}><RefreshCw size={15} /> Refresh</button>
          </div>
        </div>

        {alertError && <p role="alert" style={{ color: "#fca5a5", padding: "12px 18px" }}>{alertError}</p>}
        {alertMessage && <p role="status" style={{ color: "#6ee7b7", padding: "12px 18px" }}>{alertMessage}</p>}

        <div className="table-scroll">
          <table>
            <thead><tr><th>ALERT</th><th>CUSTOMER</th><th>AMOUNT</th><th>RISK SCORE</th><th>STATUS</th><th>ASSIGNED ANALYST</th><th>UPDATE STATUS</th></tr></thead>
            <tbody>
              {alertsLoading && alerts.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">Loading fraud alerts…</td></tr>
              ) : filteredAlerts.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No alerts match your filters.</td></tr>
              ) : filteredAlerts.map((alert) => (
                <tr key={alert.alert_id}>
                  <td><div className="transaction-id">ALT-{String(alert.alert_id).padStart(3, "0")}</div><small>{alert.transaction_reference}</small><p style={{ color: "#94a3b8", marginTop: "5px" }}>{formatDate(alert.created_at)}</p></td>
                  <td><div className="customer-cell"><div className="customer-avatar">{alert.customer_name.split(" ").map((n) => n[0]).join("")}</div><span>{alert.customer_name}</span></div><small>ID: {alert.customer_id}</small></td>
                  <td className="amount-cell">{formatAmount(Number(alert.amount))}<p style={{ color: "#94a3b8" }}>{alert.transaction_location ?? "Unknown"}</p></td>
                  <td><span className={`status-pill ${alert.risk_level.toLowerCase()}`}>{alert.risk_level} · {alert.risk_score}</span></td>
                  <td><span className={`status-pill ${alert.alert_status.toLowerCase().replace(/_/g, "-")}`}>{alert.alert_status.replaceAll("_", " ")}</span></td>
                  <td>{alert.assigned_analyst ?? "Unassigned"}</td>
                  <td>
                    <select
                      aria-label={`New status for alert ${alert.alert_id}`}
                      value={alert.alert_status}
                      disabled={savingAlertId === alert.alert_id}
                      onChange={(e) => void updateAlertStatus(alert.alert_id, e.target.value)}
                    >
                      {ALERT_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                    </select>
                    {savingAlertId === alert.alert_id && <small>Saving…</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{alerts.length} actual alerts · {openAlerts.length} open alerts</span>
          <span className="footer-live"><span className="status-dot" />MySQL alert records</span>
        </div>
      </article>
    );
  }

  return (
    <main className="dashboard">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Shield size={24} /></div>
          <div><h2>Sentinel<span>AI</span></h2><p>FRAUD INTELLIGENCE</p></div>
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-list">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${active === label ? "nav-active" : ""}`} onClick={() => { setActive(label); setMenuOpen(false); setSelectedTransaction(null); setAlertMessage(""); setAlertError(""); resetFilters(); }}>
              <Icon size={19} /><span>{label}</span>
              {label === "Fraud Alerts" && <span className="nav-count">{openAlerts.length}</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="system-status"><span className="status-dot" /><div><strong>{apiError || alertError ? "Connection issue" : "System operational"}</strong><p>{apiError || alertError ? "Check database services" : "Services running normally"}</p></div></div>
          <div className="profile">
            <div className="avatar">{initials || "U"}</div>
            <div className="profile-info">
              <strong>{displayName}</strong>
              <p>{displayRole}</p>
            </div>
            <button
              type="button"
              className="logout-icon"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void signOut({ callbackUrl: "/login" })}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {menuOpen && <button className="mobile-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div></div>
          <div className="topbar-actions">
            <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={active === "Fraud Alerts" ? "Search alerts..." : "Search transactions..."} aria-label="Search" /><kbd>⌘ K</kbd></div>
            <button className="icon-button notification-button" aria-label="Open fraud alerts" onClick={() => setActive("Fraud Alerts")}><Bell size={19} /><span /></button>
            <button
              type="button"
              className="top-avatar"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void signOut({ callbackUrl: "/login" })}
            >
              {initials || "U"}
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> LIVE MONITORING</div>
              <h1>{active === "Overview" ? "Fraud Intelligence Dashboard" : active}</h1>
              <p>{active === "Overview" ? "Monitor transactions, detect suspicious activity, and manage fraud investigations." : active === "Transactions" ? "Search, filter, and inspect transactions from your database." : active === "Risk Analysis" ? "Review rule-based risk scores, detection reasons, and transaction anomalies." : active === "Fraud Alerts" ? "Review and update real alert records stored in MySQL." : active === "Customers" ? "Explore customer activity and transaction risk summaries." : active === "Investigations" ? "Review flagged transactions and their available evidence." : active === "Audit Logs" ? "Review a chronological record of actions across fraud alerts and investigations." : "Configure dashboard refresh preferences."}</p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="subtle-button" onClick={() => { void loadTransactions(); void loadAlerts(); void loadInvestigations(); void loadAnalysts(); void loadAuditLogs(); }} disabled={loading || alertsLoading || investigationsLoading}><RefreshCw size={16} /> Refresh</button>
              <button className="export-button" onClick={exportReport}><Download size={17} /> Export report</button>
            </div>
          </div>

          {(apiError || alertError) && <div role="alert" style={{ padding: "14px 16px", marginBottom: "18px", borderRadius: "10px", border: "1px solid #f87171", color: "#fca5a5", background: "rgba(127, 29, 29, 0.18)" }}>{apiError || alertError}</div>}

          {active === "Overview" && (
            <>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span>Total transactions</span><div className="stat-icon blue"><Activity size={20} /></div></div><div className="stat-number">{loading ? "—" : totalTransactions}<span className="trend neutral">Live database</span></div><p className="stat-foot">Transactions in the current dataset</p><div className="stat-bar"><span className="bar-blue" style={{ width: `${Math.min(totalTransactions * 10, 100)}%` }} /></div></article>
                <article className="stat-card"><div className="stat-top"><span>High-risk transactions</span><div className="stat-icon red"><AlertTriangle size={20} /></div></div><div className="stat-number">{loading ? "—" : highRiskCount}<span className="trend negative"><ArrowUpRight size={15} /> Requires review</span></div><p className="stat-foot">Flagged by risk scoring rules</p><div className="stat-bar"><span className="bar-red" style={{ width: `${totalTransactions ? highRiskCount / totalTransactions * 100 : 0}%` }} /></div></article>
                <article className="stat-card"><div className="stat-top"><span>Open fraud alerts</span><div className="stat-icon amber"><ShieldAlert size={20} /></div></div><div className="stat-number">{alertsLoading ? "—" : openAlerts.length}<span className="trend neutral">MySQL records</span></div><p className="stat-foot">Alerts not yet closed or resolved</p><div className="stat-bar"><span className="bar-amber" style={{ width: `${alerts.length ? openAlerts.length / alerts.length * 100 : 0}%` }} /></div></article>
                <article className="stat-card"><div className="stat-top"><span>Customers monitored</span><div className="stat-icon green"><Shield size={20} /></div></div><div className="stat-number">{loading ? "—" : customers.length}<span className="trend positive"><ArrowUpRight size={15} /> Customers</span></div><p className="stat-foot">Unique customers in transaction data</p><div className="stat-bar"><span className="bar-green" style={{ width: `${Math.min(customers.length * 20, 100)}%` }} /></div></article>
              </div>

              <div className="middle-grid">
                <article className="panel risk-panel">
                  <div className="panel-heading"><div><h3>Risk distribution</h3><p>Based on saved rule-based analyses</p></div><button className="subtle-button" onClick={() => setRiskFilter("All")}>All data <ChevronDown size={15} /></button></div>
                  <div className="risk-content">
                    <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(#f87171 0% ${totalTransactions ? highRiskCount / totalTransactions * 100 : 0}%, #fbbf24 ${totalTransactions ? highRiskCount / totalTransactions * 100 : 0}% ${totalTransactions ? (highRiskCount + mediumRiskCount) / totalTransactions * 100 : 0}%, #34d399 ${totalTransactions ? (highRiskCount + mediumRiskCount) / totalTransactions * 100 : 0}% 100%)` }}><div className="donut-center"><strong>{loading ? "—" : totalTransactions}</strong><span>Transactions</span></div></div></div>
                    <div className="risk-legend">
                      <div className="legend-row"><span className="legend-dot high" /><div><strong>High risk</strong><p>Score 70–100</p></div><b>{highRiskCount}</b></div>
                      <div className="legend-row"><span className="legend-dot medium" /><div><strong>Medium risk</strong><p>Score 40–69</p></div><b>{mediumRiskCount}</b></div>
                      <div className="legend-row"><span className="legend-dot low" /><div><strong>Low risk</strong><p>Score 0–39</p></div><b>{lowRiskCount}</b></div>
                    </div>
                  </div>
                </article>
                <article className="panel alerts-panel">
                  <div className="panel-heading"><div><h3>Priority alerts</h3><p>Transactions needing attention</p></div><button className="text-link" onClick={() => setActive("Fraud Alerts")}>View all <ArrowUpRight size={15} /></button></div>
                  {priorityAlerts.map((t) => <button key={t.id} className="alert-row" onClick={() => { setSelectedTransaction(t.id); setActive("Transactions"); }}><div className="alert-symbol"><AlertTriangle size={17} /></div><div className="alert-info"><strong>{t.name}</strong><p>{t.id} · {t.location}</p></div><div className="alert-amount"><strong>{formatAmount(t.amount)}</strong><span>{t.risk.toUpperCase()} RISK</span></div></button>)}
                  {priorityAlerts.length === 0 && <p style={{ padding: "18px" }}>No priority transactions.</p>}
                </article>
              </div>
              {renderTransactionsTable()}
            </>
          )}

          {active === "Transactions" && (
            <>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span>Total transactions</span><div className="stat-icon blue"><CreditCard size={20} /></div></div><div className="stat-number">{totalTransactions}</div><p className="stat-foot">Records loaded</p></article>
                <article className="stat-card"><div className="stat-top"><span>Completed</span><div className="stat-icon green"><CheckCircle2 size={20} /></div></div><div className="stat-number">{transactions.filter((t) => t.status === "COMPLETED").length}</div><p className="stat-foot">Completed transactions</p></article>
                <article className="stat-card"><div className="stat-top"><span>Pending</span><div className="stat-icon amber"><Clock3 size={20} /></div></div><div className="stat-number">{transactions.filter((t) => t.status === "PENDING").length}</div><p className="stat-foot">Awaiting completion</p></article>
                <article className="stat-card"><div className="stat-top"><span>High risk</span><div className="stat-icon red"><AlertTriangle size={20} /></div></div><div className="stat-number">{highRiskCount}</div><p className="stat-foot">Score 70 or above</p></article>
              </div>
              {renderTransactionsTable()}
            </>
          )}

          {active === "Risk Analysis" && (
            <>
              <div className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top"><span>Transactions analyzed</span><div className="stat-icon blue"><BrainCircuit size={20} /></div></div>
                  <div className="stat-number">{loading ? "—" : totalTransactions}</div>
                  <p className="stat-foot">Latest saved rule-based analyses</p>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>High risk</span><div className="stat-icon red"><AlertTriangle size={20} /></div></div>
                  <div className="stat-number">{loading ? "—" : highRiskCount}</div>
                  <p className="stat-foot">Scores from 70 to 100</p>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>Medium risk</span><div className="stat-icon amber"><ShieldAlert size={20} /></div></div>
                  <div className="stat-number">{loading ? "—" : mediumRiskCount}</div>
                  <p className="stat-foot">Scores from 40 to 69</p>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>Low risk</span><div className="stat-icon green"><CheckCircle2 size={20} /></div></div>
                  <div className="stat-number">{loading ? "—" : lowRiskCount}</div>
                  <p className="stat-foot">Scores below 40</p>
                </article>
              </div>

              <article className="panel transactions-panel">
                <div className="panel-heading transactions-heading">
                  <div>
                    <h3>Transaction risk analysis</h3>
                    <p>Scores and reasons generated by the configured risk rules. These indicators do not prove fraud.</p>
                  </div>
                  <button className="export-button" onClick={() => void runRiskAnalysis()} disabled={riskAnalysisLoading}>
                    <RefreshCw size={16} />
                    {riskAnalysisLoading ? "Analyzing…" : "Run risk analysis"}
                  </button>
                </div>

                {riskAnalysisMessage && <p role="status" style={{ color: "#6ee7b7", padding: "12px 18px" }}>{riskAnalysisMessage}</p>}
                {riskAnalysisError && <p role="alert" style={{ color: "#fca5a5", padding: "12px 18px" }}>{riskAnalysisError}</p>}
                {apiError && <p role="alert" style={{ color: "#fca5a5", padding: "12px 18px" }}>{apiError}</p>}

                <div className="table-actions" style={{ padding: "0 18px 14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Filter risk analysis by risk level">
                    <option value="All">All risk levels</option>
                    <option value="High">High risk</option>
                    <option value="Medium">Medium risk</option>
                    <option value="Low">Low risk</option>
                  </select>
                  <button className="subtle-button" onClick={resetFilters}>Reset filters</button>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>TRANSACTION</th><th>CUSTOMER</th><th>AMOUNT</th><th>LOCATION</th><th>RISK SCORE</th><th>RISK LEVEL</th><th>REASONS</th></tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={7} className="empty-state">Loading risk analysis…</td></tr>
                      ) : filteredTransactions.length === 0 ? (
                        <tr><td colSpan={7} className="empty-state">No transactions match the selected risk filter.</td></tr>
                      ) : filteredTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td><span className="transaction-id">{transaction.id}</span><p style={{ color: "#94a3b8", marginTop: "5px" }}>{formatDate(transaction.transactionTime)}</p></td>
                          <td>{transaction.name}</td>
                          <td className="amount-cell">{formatAmount(transaction.amount)}</td>
                          <td>{transaction.location}</td>
                          <td>
                            <div className="score-cell">
                              <div className="score-track"><span style={{ width: `${Math.max(0, Math.min(transaction.score, 100))}%`, background: transaction.score >= 70 ? "#f87171" : transaction.score >= 40 ? "#fbbf24" : "#34d399" }} /></div>
                              <strong>{transaction.score}/100</strong>
                            </div>
                          </td>
                          <td><span className={`status-pill ${transaction.risk.toLowerCase()}`}>{transaction.risk.toUpperCase()}</span></td>
                          <td style={{ minWidth: "260px", maxWidth: "420px" }}>
                            <details>
                              <summary style={{ cursor: "pointer" }}>{transaction.reasons.length} reason{transaction.reasons.length === 1 ? "" : "s"} · View details</summary>
                              <ul style={{ paddingLeft: "18px", marginTop: "8px", color: "#cbd5e1" }}>
                                {transaction.reasons.length > 0
                                  ? transaction.reasons.map((reason, index) => <li key={`${transaction.id}-${index}`} style={{ marginBottom: "5px" }}>{reason}</li>)
                                  : <li>No risk reasons were recorded.</li>}
                              </ul>
                              <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "12px" }}>Usual location: {transaction.usualLocation} · Current location: {transaction.location}</p>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  <span>Showing {loading ? "…" : filteredTransactions.length} of {totalTransactions} transactions</span>
                  <span className="footer-live"><span className="status-dot" />Rule-based analysis</span>
                </div>
              </article>
            </>
          )}

          {active === "Fraud Alerts" && (
            <>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span>Total alerts</span><div className="stat-icon blue"><ShieldAlert size={20} /></div></div><div className="stat-number">{alertsLoading ? "—" : alerts.length}</div><p className="stat-foot">Actual MySQL alert records</p></article>
                <article className="stat-card"><div className="stat-top"><span>Open alerts</span><div className="stat-icon amber"><Clock3 size={20} /></div></div><div className="stat-number">{alertsLoading ? "—" : openAlerts.length}</div><p className="stat-foot">Not yet closed or resolved</p></article>
                <article className="stat-card"><div className="stat-top"><span>High risk</span><div className="stat-icon red"><AlertTriangle size={20} /></div></div><div className="stat-number">{alerts.filter((a) => ["HIGH", "CRITICAL"].includes(a.risk_level.toUpperCase())).length}</div><p className="stat-foot">High and critical alerts</p></article>
                <article className="stat-card"><div className="stat-top"><span>Confirmed fraud</span><div className="stat-icon green"><CheckCircle2 size={20} /></div></div><div className="stat-number">{alerts.filter((a) => a.alert_status === "CONFIRMED_FRAUD").length}</div><p className="stat-foot">Alerts marked as fraud</p></article>
              </div>
              {renderFraudAlerts()}
              <p style={{ color: "#94a3b8", marginTop: "14px", fontSize: "13px" }}>Status changes are saved to MySQL. Confirmed fraud, false positive, and closed statuses set the resolved timestamp.</p>
            </>
          )}

          {active === "Customers" && (
            <article className="panel transactions-panel">
              <div className="panel-heading transactions-heading"><div><h3>Customer activity</h3><p>Summarized from current transaction records</p></div></div>
              <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>TRANSACTIONS</th><th>TOTAL VALUE</th><th>HIGH-RISK COUNT</th><th>ACTION</th></tr></thead><tbody>
                {customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => <tr key={c.id}><td><div className="customer-cell"><div className="customer-avatar">{c.name.split(" ").map((n) => n[0]).join("")}</div><span>{c.name}</span></div></td><td>{c.transactions.length}</td><td className="amount-cell">{formatAmount(c.totalAmount)}</td><td>{c.highRiskCount}</td><td><button className="subtle-button" onClick={() => { setSearch(c.name); setActive("Transactions"); }}>View transactions <ArrowUpRight size={14} /></button></td></tr>)}
              </tbody></table></div>
              <div className="table-footer"><span>{customers.length} customers in current transaction data</span><span className="footer-live"><span className="status-dot" />Database connected</span></div>
            </article>
          )}

          {active === "Investigations" && (
            <>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span>Total cases</span><div className="stat-icon blue"><Eye size={20} /></div></div><div className="stat-number">{investigations.length}</div><p className="stat-foot">Saved MySQL investigation cases</p></article>
                <article className="stat-card"><div className="stat-top"><span>Open cases</span><div className="stat-icon amber"><Clock3 size={20} /></div></div><div className="stat-number">{investigations.filter((c) => c.case_status === "OPEN").length}</div><p className="stat-foot">Awaiting investigation</p></article>
                <article className="stat-card"><div className="stat-top"><span>In progress</span><div className="stat-icon red"><Activity size={20} /></div></div><div className="stat-number">{investigations.filter((c) => c.case_status === "IN_PROGRESS" || c.case_status === "ESCALATED").length}</div><p className="stat-foot">Being actively reviewed or escalated</p></article>
                <article className="stat-card"><div className="stat-top"><span>Resolved</span><div className="stat-icon green"><CheckCircle2 size={20} /></div></div><div className="stat-number">{investigations.filter((c) => c.case_status === "RESOLVED").length}</div><p className="stat-foot">Cases with resolved status</p></article>
              </div>
              {investigationError && <p role="alert" style={{ color: "#fca5a5", padding: "12px 16px" }}>{investigationError}</p>}
              {investigationMessage && <p role="status" style={{ color: "#6ee7b7", padding: "12px 16px" }}>{investigationMessage}</p>}
              <article className="panel transactions-panel" style={{ marginBottom: "18px" }}>
                <div className="panel-heading transactions-heading"><div><h3>Create investigation from an alert</h3><p>Open a persistent case linked to an existing MySQL fraud alert.</p></div><button className="subtle-button" onClick={() => void loadInvestigations()} disabled={investigationsLoading}><RefreshCw size={15} /> Refresh cases</button></div>
                <div className="table-scroll"><table><thead><tr><th>ALERT</th><th>CUSTOMER</th><th>TRANSACTION</th><th>AMOUNT</th><th>RISK</th><th>CREATE CASE</th></tr></thead><tbody>
                  {alerts.filter((a) => !investigations.some((c) => c.alert_id === a.alert_id && c.case_status !== "RESOLVED")).map((alert) => <tr key={alert.alert_id}><td>ALT-{String(alert.alert_id).padStart(3, "0")}</td><td>{alert.customer_name}</td><td><span className="transaction-id">{alert.transaction_reference}</span></td><td className="amount-cell">{formatAmount(Number(alert.amount))}</td><td><span className={`status-pill ${alert.risk_level.toLowerCase()}`}>{alert.risk_level} · {alert.risk_score}</span></td><td><button className="subtle-button" disabled={creatingAlertId === alert.alert_id} onClick={() => void createInvestigation(alert.alert_id, alert.risk_level === "CRITICAL" ? "CRITICAL" : alert.risk_level === "HIGH" ? "HIGH" : "MEDIUM")}>{creatingAlertId === alert.alert_id ? "Creating…" : "Create case"}</button></td></tr>)}
                  {alerts.filter((a) => !investigations.some((c) => c.alert_id === a.alert_id && c.case_status !== "RESOLVED")).length === 0 && <tr><td colSpan={6} className="empty-state">Every alert already has an unresolved case, or no alerts are available.</td></tr>}
                </tbody></table></div>
              </article>
              <article className="panel transactions-panel">
                <div className="panel-heading transactions-heading"><div><h3>Investigation case register</h3><p>Cases and notes are persisted in MySQL.</p></div></div>
                <div className="table-scroll"><table><thead><tr><th>CASE</th><th>ALERT / TRANSACTION</th><th>CUSTOMER</th><th>AMOUNT</th><th>PRIORITY</th><th>STATUS</th><th>ANALYST</th><th>ACTION</th></tr></thead><tbody>
                  {investigationsLoading && investigations.length === 0 ? <tr><td colSpan={8} className="empty-state">Loading investigation cases…</td></tr> : investigations.filter((c) => [c.case_id, c.alert_id, c.transaction_reference, c.customer_name, c.case_status, c.priority].join(" ").toLowerCase().includes(search.toLowerCase())).map((item) => <tr key={item.case_id}><td className="transaction-id">CASE-{String(item.case_id).padStart(3, "0")}<p style={{ color: "#94a3b8", marginTop: "5px" }}>{formatDate(item.opened_at)}</p></td><td>ALT-{String(item.alert_id).padStart(3, "0")}<p className="transaction-id">{item.transaction_reference}</p></td><td>{item.customer_name}</td><td className="amount-cell">{formatAmount(Number(item.amount))}</td><td><span className={`status-pill ${item.priority.toLowerCase()}`}>{item.priority}</span></td><td><span className={`status-pill ${item.case_status.toLowerCase().replace(/_/g, "-")}`}>{item.case_status.replaceAll("_", " ")}</span></td><td>{item.assigned_analyst ?? "Unassigned"}</td><td><button className="subtle-button" onClick={() => void openCaseNotes(item)}><Eye size={14} /> Manage</button></td></tr>)}
                  {!investigationsLoading && investigations.filter((c) => [c.case_id, c.alert_id, c.transaction_reference, c.customer_name, c.case_status, c.priority].join(" ").toLowerCase().includes(search.toLowerCase())).length === 0 && <tr><td colSpan={8} className="empty-state">No investigation cases yet. Create one from an alert above.</td></tr>}
                </tbody></table></div>
                {selectedCaseId !== null && <div style={{ margin: "18px", padding: "18px", border: "1px solid #2a374a", borderRadius: "10px", background: "#0d131e" }}>
                  <div className="panel-heading"><div><h3>Manage case #{selectedCaseId}</h3><p>Update case details and add notes.</p></div><button className="subtle-button" onClick={() => setSelectedCaseId(null)}>Close</button></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
                    <label>Status<select value={caseStatus} onChange={(e) => setCaseStatus(e.target.value)} style={{ display: "block", width: "100%", marginTop: "6px", padding: "9px", color: "#dce7f6", background: "#151e2b", border: "1px solid #2a374a", borderRadius: "6px" }}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="ESCALATED">Escalated</option><option value="RESOLVED">Resolved</option></select></label>
                    <label>Priority<select value={casePriority} onChange={(e) => setCasePriority(e.target.value)} style={{ display: "block", width: "100%", marginTop: "6px", padding: "9px", color: "#dce7f6", background: "#151e2b", border: "1px solid #2a374a", borderRadius: "6px" }}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
                    <label>Assigned analyst
                      <select value={caseAssignedTo} onChange={(e) => setCaseAssignedTo(e.target.value)} style={{ display: "block", width: "100%", marginTop: "6px", padding: "9px", color: "#dce7f6", background: "#151e2b", border: "1px solid #2a374a", borderRadius: "6px" }}>
                        <option value="">Unassigned</option>
                        {analysts.filter((analyst) => Boolean(analyst.is_active)).map((analyst) => (
                          <option key={analyst.user_id} value={String(analyst.user_id)}>
                            {analyst.full_name} ({analyst.role === "ADMIN" ? "Admin" : "Fraud Analyst"})
                          </option>
                        ))}
                      </select>
                      {analystsError && <small role="alert" style={{ display: "block", color: "#fca5a5", marginTop: "5px" }}>{analystsError}</small>}
                    </label>
                  </div>
                  <label style={{ display: "block", marginTop: "14px" }}>Conclusion<textarea value={caseConclusion} onChange={(e) => setCaseConclusion(e.target.value)} maxLength={500} rows={3} placeholder="Summarize the investigation outcome…" style={{ display: "block", width: "100%", marginTop: "6px", padding: "10px", color: "#dce7f6", background: "#151e2b", border: "1px solid #2a374a", borderRadius: "6px", resize: "vertical" }} /></label>
                  <button className="export-button" style={{ marginTop: "12px" }} disabled={savingCase} onClick={() => void saveInvestigationCase()}>{savingCase ? "Saving…" : "Save case changes"}</button>
                  <div style={{ marginTop: "20px", borderTop: "1px solid #202b3a", paddingTop: "16px" }}><h3>Investigation notes</h3>
                    <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>{caseNotes.map((note) => <div key={note.note_id} style={{ padding: "10px", borderRadius: "7px", background: "#151e2b" }}><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{note.note_text}</p><small style={{ color: "#8492a6" }}>{note.author_name ?? "Unspecified author"} · {formatDate(note.created_at)}</small></div>)}{caseNotes.length === 0 && <p style={{ color: "#8492a6" }}>No notes added to this case yet.</p>}</div>
                    <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={3} placeholder="Add an investigation note…" style={{ display: "block", width: "100%", marginTop: "12px", padding: "10px", color: "#dce7f6", background: "#151e2b", border: "1px solid #2a374a", borderRadius: "6px", resize: "vertical" }} />
                    <button className="subtle-button" style={{ marginTop: "10px" }} disabled={savingCase || !noteDraft.trim()} onClick={() => void addInvestigationNote()}>{savingCase ? "Saving…" : "Add note"}</button>
                  </div>
                </div>}
              </article>
            </>
          )}

          {active === "Audit Logs" && (
            <article className="panel transactions-panel">
              <div className="panel-heading transactions-heading">
                <div>
                  <h3>System audit trail</h3>
                  <p>Track investigation updates, alert status changes, assignments, and notes recorded in MySQL.</p>
                </div>
                <button className="subtle-button" onClick={() => void loadAuditLogs()} disabled={auditLogsLoading}>
                  <RefreshCw size={15} /> {auditLogsLoading ? "Refreshing..." : "Refresh logs"}
                </button>
              </div>

              {auditLogsError && <p role="alert" style={{ color: "#fca5a5", padding: "12px 18px" }}>{auditLogsError}</p>}

              <div className="table-scroll">
                <table>
                  <thead><tr><th>LOG ID</th><th>ACTION</th><th>ENTITY</th><th>ENTITY ID</th><th>USER</th><th>DETAILS</th><th>DATE &amp; TIME</th></tr></thead>
                  <tbody>
                    {auditLogsLoading && auditLogs.length === 0 ? (
                      <tr><td colSpan={7} className="empty-state">Loading audit logs...</td></tr>
                    ) : auditLogs.filter((log) => {
                      const detailText = typeof log.details === "string" ? log.details : JSON.stringify(log.details ?? {});
                      return [log.log_id, log.action_type, log.entity_type, log.entity_id ?? "", log.user_name ?? "", detailText].join(" ").toLowerCase().includes(search.toLowerCase());
                    }).length === 0 ? (
                      <tr><td colSpan={7} className="empty-state">No audit logs match your search.</td></tr>
                    ) : auditLogs.filter((log) => {
                      const detailText = typeof log.details === "string" ? log.details : JSON.stringify(log.details ?? {});
                      return [log.log_id, log.action_type, log.entity_type, log.entity_id ?? "", log.user_name ?? "", detailText].join(" ").toLowerCase().includes(search.toLowerCase());
                    }).map((log) => {
                      let parsedDetails: unknown = log.details ?? {};
                      if (typeof parsedDetails === "string") {
                        try { parsedDetails = JSON.parse(parsedDetails); } catch { /* Keep the original text. */ }
                      }
                      return (
                        <tr key={log.log_id}>
                          <td><span className="transaction-id">#{log.log_id}</span></td>
                          <td><span className="status-pill under-review">{log.action_type.replaceAll("_", " ")}</span></td>
                          <td>{log.entity_type.replaceAll("_", " ")}</td>
                          <td>{log.entity_id ?? "—"}</td>
                          <td>{log.user_name ?? "System / Unspecified"}</td>
                          <td style={{ minWidth: "220px", maxWidth: "360px" }}>
                            <details>
                              <summary style={{ cursor: "pointer" }}>View details</summary>
                              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>{JSON.stringify(parsedDetails, null, 2)}</pre>
                            </details>
                          </td>
                          <td>{formatDate(log.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>{auditLogs.length} audit records loaded</span>
                <span className="footer-live"><span className="status-dot" />MySQL audit_logs</span>
              </div>
            </article>
          )}

          {active === "Settings" && (
            <div className="panel" style={{ padding: "24px" }}>
              <div className="panel-heading"><div><h3>Dashboard settings</h3><p>Manage local dashboard refresh preferences.</p></div><SettingsIcon size={22} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", padding: "22px 0", borderBottom: "1px solid rgba(148,163,184,0.15)" }}><div><strong>Automatic refresh</strong><p style={{ color: "#94a3b8", marginTop: "6px" }}>Refresh transactions and alerts every 30 seconds.</p></div><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} aria-label="Enable automatic refresh" style={{ width: "20px", height: "20px", cursor: "pointer" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", padding: "22px 0" }}><div><strong>Last successful transaction refresh</strong><p style={{ color: "#94a3b8", marginTop: "6px" }}>{lastUpdated || "Not refreshed yet"}</p></div><button className="export-button" onClick={() => { void loadTransactions(); void loadAlerts(); void loadInvestigations(); void loadAnalysts(); void loadAuditLogs(); }}><RefreshCw size={16} /> Refresh now</button></div>
              <p style={{ color: "#94a3b8", fontSize: "13px" }}>Authentication is enabled. Dashboard refresh preferences apply to this browser session and reset when the page is reloaded.</p>
            </div>
          )}

          <footer className="footer">
            <span><Shield size={14} /> SentinelAI Fraud Intelligence</span>
            <span>Rule-based risk analysis · Demo environment</span>
            <span><CheckCircle2 size={14} />{apiError || alertError ? "Connection issue" : loading || alertsLoading ? "Loading data" : "API connected"}</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
