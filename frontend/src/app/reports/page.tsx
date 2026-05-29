"use client";
import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { AlertTriangle, Send, CheckCircle, Clock, XCircle } from "lucide-react";

const reportTypes = [
  { value: "BUG", label: "Bug/Error", labelSw: "Hitilafu/Doa" },
  { value: "FEATURE_REQUEST", label: "Feature Request", labelSw: "Ombi la Kipengele" },
  { value: "ACCOUNT_ISSUE", label: "Account Issue", labelSw: "Tatizo la Akaunti" },
  { value: "OTHER", label: "Other", labelSw: "Nyingine" },
];

const priorities = [
  { value: "LOW", label: "Low", labelSw: "Chini", color: "bg-gray-100 text-gray-700" },
  { value: "MEDIUM", label: "Medium", labelSw: "Kati", color: "bg-yellow-100 text-yellow-700" },
  { value: "HIGH", label: "High", labelSw: "Juu", color: "bg-orange-100 text-orange-700" },
  { value: "URGENT", label: "Urgent", labelSw: "Haraka", color: "bg-red-100 text-red-700" },
];

const statusConfig = {
  OPEN: { icon: Clock, color: "bg-blue-100 text-blue-700", label: "Open", labelSw: "Imefunguliwa" },
  IN_PROGRESS: { icon: AlertTriangle, color: "bg-yellow-100 text-yellow-700", label: "In Progress", labelSw: "Inaendelea" },
  RESOLVED: { icon: CheckCircle, color: "bg-green-100 text-green-700", label: "Resolved", labelSw: "Imeshughulikiwa" },
  REJECTED: { icon: XCircle, color: "bg-red-100 text-red-700", label: "Rejected", labelSw: "Imekataliwa" },
};

export default function ReportsPage() {
  const [tab, setTab] = useState<"new" | "my">("new");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [myReports, setMyReports] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [type, setType] = useState("OTHER");
  const [priority, setPriority] = useState("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setMessage("Please fill in both title and description");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await api.post("/reports", { type, priority, title: title.trim(), description: description.trim() });
      setMessage("Report submitted successfully. We'll review it soon.");
      setTitle("");
      setDescription("");
      setType("OTHER");
      setPriority("MEDIUM");
      // Refresh my reports
      if (tab === "my") loadMyReports();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadMyReports() {
    setLoading(true);
    try {
      const data = await api.get("/reports/my");
      setMyReports(data.reports);
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setLoading(false);
    }
  }

  if (tab === "my" && myReports.length === 0 && !loading) {
    loadMyReports();
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto pb-24 lg:pb-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Report an Issue</h1>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          <button
            onClick={() => setTab("new")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "new" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            New Report
          </button>
          <button
            onClick={() => setTab("my")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "my" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            My Reports ({myReports.length})
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            message.includes("success") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>
            {message}
          </div>
        )}

        {/* NEW REPORT FORM */}
        {tab === "new" && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {reportTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} / {t.labelSw}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {priorities.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      priority === p.value ? p.color : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description of the issue"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide detailed information about the issue, including steps to reproduce if it's a bug"
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                maxLength={2000}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </form>
        )}

        {/* MY REPORTS */}
        {tab === "my" && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
              </div>
            ) : myReports.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No reports submitted yet</p>
              </div>
            ) : (
              myReports.map((report: any) => {
                const StatusIcon = statusConfig[report.status].icon;
                return (
                  <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{report.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig[report.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[report.status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded">{report.type}</span>
                      <span className={`px-2 py-0.5 rounded ${priorities.find(p => p.value === report.priority)?.color}`}>
                        {report.priority}
                      </span>
                      <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                    </div>
                    {report.adminNotes && (
                      <div className="mt-3 p-2 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-800">
                          <strong>Admin note:</strong> {report.adminNotes}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}