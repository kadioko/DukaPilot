"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, CloudSun, Droplets, LoaderCircle, PackagePlus, Sprout, Target, Tractor, Wheat } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { api, formatTZS, getCurrentSession } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { newCropOperationId, readPendingCropOperations, setActiveOfflineCropScope, type PendingCropOperation, writePendingCropOperations } from "@/lib/offlineCropStorage";
import { sendCropOperation, shouldQueueCropOperation, syncPendingCropOperations } from "@/lib/offlineCropSync";
import { offlineSalesScope } from "@/lib/offlineSalesStorage";

type Cycle = { id: string; cropName: string; status: string; yieldUnit?: string | null; plot: { name: string }; seasonBudget?: { plannedCost: number; plannedRevenue?: number | null; note?: string | null } | null; harvestBatches: Harvest[] };
type Harvest = { id: string; actualYield: number; remainingQuantity: number; harvestAt: string; outputProduct: { name: string; unit: string }; grades: Array<{ id: string; grade: string; quantity: number; unit?: string | null; updatedAt?: string }> };
type Task = { id: string; title: string; status: string; priority: string; dueAt?: string | null; updatedAt?: string; cropCycle?: { cropName: string; plot: { name: string } } | null; assignedStaffName?: string | null; };
type OpsData = {
  financialsVisible: boolean;
  financialPlanningVisible: boolean;
  cycles: Cycle[];
  irrigationLogs: Array<{ id: string; amount?: number | null; unit?: string | null; durationMinutes?: number | null; irrigatedAt: string; cropCycle: { cropName: string; plot: { name: string } } }>;
  tasks: Task[];
  contracts: Array<{ id: string; buyerName: string; buyerPhone?: string | null; produceName: string; quantity: number; unit: string; unitPrice?: number | null; deliveryAt?: string | null; status: string; updatedAt?: string; cropCycle?: { cropName: string; plot: { name: string } } | null }>;
  weatherAlerts: Array<{ id: string; severity: string; message: string; isResolved: boolean; startsAt: string; updatedAt?: string; cropPlot?: { name: string } | null; cropCycle?: { cropName: string } | null }>;
  farmStaff: Array<{ id: string; name: string }>;
};

const taskStatuses = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"];
const contractStatuses = ["DRAFT", "AGREED", "DELIVERED", "CANCELLED"];
function today() { return new Date().toISOString().slice(0, 10); }
function displayDate(value?: string | null) { return value ? new Date(value).toLocaleDateString("en-TZ", { day: "numeric", month: "short" }) : "-"; }

type PendingFieldOperation = PendingCropOperation & { onQueued?: () => void };

class CropFieldOperationError extends Error {
  operation: PendingFieldOperation;
  constructor(operation: PendingFieldOperation, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Could not save field record");
    this.operation = operation;
  }
}

export default function CropFieldPlanPage() {
  const lang = useLang();
  const { toast } = useToast();
  const sw = lang === "sw";
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offlineScope, setOfflineScope] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState<PendingCropOperation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [irrigation, setIrrigation] = useState({ cropCycleId: "", amount: "", unit: "litres", durationMinutes: "", irrigatedAt: today(), note: "" });
  const [task, setTask] = useState({ cropCycleId: "", title: "", priority: "NORMAL", dueAt: "", assignedStaffId: "" });
  const [budget, setBudget] = useState({ cropCycleId: "", plannedCost: "", plannedRevenue: "", note: "" });
  const [contract, setContract] = useState({ cropCycleId: "", buyerName: "", buyerPhone: "", produceName: "", quantity: "", unit: "kg", unitPrice: "", deliveryAt: "" });
  const [grade, setGrade] = useState({ harvestBatchId: "", grade: "A", quantity: "", unit: "kg" });
  const [weather, setWeather] = useState({ cropCycleId: "", severity: "WATCH", message: "", startsAt: today() });

  const activeCycles = useMemo(() => data?.cycles.filter((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status)) || [], [data]);
  const harvests = useMemo(() => (data?.cycles || []).flatMap((cycle) => cycle.harvestBatches.map((batch) => ({ ...batch, cycle }))), [data]);

  useEffect(() => {
    getCurrentSession<{ user: { id: string; businessShopId?: string; shop?: { id?: string; parentShopId?: string | null }; staff?: { id?: string } } }>()
      .then((session) => {
        const scope = offlineSalesScope(session.user);
        setOfflineScope(scope);
        setActiveOfflineCropScope(scope);
        setPendingOperations(readPendingCropOperations(scope));
      })
      .catch(() => { setOfflineScope(null); setPendingOperations([]); });
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get<OpsData>("/crops/operations", lang);
      setData(response);
      const firstCycle = response.cycles.find((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status));
      const firstHarvest = response.cycles.flatMap((cycle) => cycle.harvestBatches)[0];
      setIrrigation((current) => ({ ...current, cropCycleId: current.cropCycleId || firstCycle?.id || "" }));
      setTask((current) => ({ ...current, cropCycleId: current.cropCycleId || firstCycle?.id || "" }));
      setBudget((current) => ({ ...current, cropCycleId: current.cropCycleId || firstCycle?.id || "" }));
      setContract((current) => ({ ...current, cropCycleId: current.cropCycleId || firstCycle?.id || "" }));
      setWeather((current) => ({ ...current, cropCycleId: current.cropCycleId || firstCycle?.id || "" }));
      setGrade((current) => ({ ...current, harvestBatchId: current.harvestBatchId || firstHarvest?.id || "", unit: current.unit || firstHarvest?.outputProduct.unit || "kg" }));
    } catch (error) {
      toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kufungua mpango wa shamba." : "Could not load the field plan."), "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [lang]);

  async function syncPending() {
    if (!offlineScope || syncing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    if (!readPendingCropOperations(offlineScope).length) return;
    setSyncing(true);
    try {
      const result = await syncPendingCropOperations(offlineScope, lang);
      setPendingOperations(result.remaining);
      if (result.synced) {
        toast(sw ? "Rekodi za shamba zimesawazishwa." : "Field records synced.", "success");
        await load();
      }
      if (result.needsAttention) toast(sw ? "Baadhi ya rekodi zinahitaji kufunguliwa na kusasishwa kabla ya kutumwa tena." : "Some records need review before they can sync.", "error");
    } finally { setSyncing(false); }
  }

  useEffect(() => {
    if (!offlineScope) return;
    syncPending().catch(() => {});
    const handleOnline = () => { syncPending().catch(() => {}); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [offlineScope, lang]);

  function fieldOperation(path: string, payload: Record<string, unknown>, label: string, method: "POST" | "PATCH" = "POST", onQueued?: () => void): PendingFieldOperation {
    const id = newCropOperationId();
    return { id, path, method, label, payload: { ...payload, clientRequestId: id }, createdAt: new Date().toISOString(), attempts: 0, onQueued };
  }

  async function submitFieldOperation(operation: PendingFieldOperation) {
    try {
      return await sendCropOperation(operation, lang);
    } catch (error) {
      throw new CropFieldOperationError(operation, error);
    }
  }

  function queueFieldFailure(error: unknown) {
    if (!(error instanceof CropFieldOperationError) || !shouldQueueCropOperation(offlineScope, error) || !offlineScope) return false;
    const { onQueued, ...queued } = error.operation;
    const next = [...readPendingCropOperations(offlineScope), { ...queued, lastError: error.message }];
    writePendingCropOperations(offlineScope, next);
    setPendingOperations(next);
    onQueued?.();
    toast(sw ? "Rekodi imesubiri kusawazishwa ukipata mtandao." : "Record is queued and will sync when you are back online.", "success");
    return true;
  }

  async function saveInline(operation: PendingFieldOperation, message: string) {
    setSaving(true);
    try {
      await submitFieldOperation(operation);
      toast(message, "success");
      await load();
    } catch (error) {
      if (!queueFieldFailure(error)) toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuhifadhi." : "Could not save."), "error");
    } finally { setSaving(false); }
  }

  async function submit(event: FormEvent, work: () => Promise<void>, message: string) {
    event.preventDefault();
    setSaving(true);
    try { await work(); toast(message, "success"); await load(); }
    catch (error) {
      if (!queueFieldFailure(error)) {
        toast(error instanceof Error ? error.message : (sw ? "Imeshindikana kuhifadhi." : "Could not save."), "error");
      }
    }
    finally { setSaving(false); }
  }

  if (loading && !data) return <AppShell><div className="flex h-64 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-brand-700" /></div></AppShell>;

  return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{sw ? "Mazao" : "Crops"}</p><h1 className="mt-1 text-xl font-bold text-gray-950">{sw ? "Mpango wa shamba" : "Field plan"}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{sw ? "Ratibu kazi za shamba, umwagiliaji, ubora wa mavuno na tahadhari. Bajeti na wanunuzi huonekana kwa mmiliki pekee." : "Organize field work, irrigation, harvest grades, and observations. Budgets and buyers remain owner-only."}</p></div><div className="flex flex-wrap gap-2"><Link href="/crops" className="inline-flex min-h-10 items-center gap-2 border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800"><Sprout className="h-4 w-4" />{sw ? "Mazao" : "Crops"}</Link>{data?.financialPlanningVisible && <button type="button" disabled={saving} onClick={() => { setSaving(true); api.post("/crops/starter-products", { cropCycleId: activeCycles[0]?.id }, lang).then(() => { toast(sw ? "Bidhaa za kuanzia zimehakikiwa." : "Starter products checked.", "success"); return load(); }).catch((error: Error) => toast(error.message, "error")).finally(() => setSaving(false)); }} className="inline-flex min-h-10 items-center gap-2 bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><PackagePlus className="h-4 w-4" />{sw ? "Bidhaa za kuanzia" : "Starter products"}</button>}</div></header>

    <section className="flex flex-wrap items-center justify-between gap-3 border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><p><Tractor className="mr-2 inline h-4 w-4" /><strong>{sw ? "Hali ya mtandao:" : "Connection:"}</strong> {pendingOperations.length ? (sw ? `${pendingOperations.length} rekodi ya shamba inasubiri kusawazishwa.${pendingOperations.filter((item) => item.needsAttention).length ? " Baadhi zinahitaji kufunguliwa na kusasishwa kabla ya kutumwa tena." : ""}` : `${pendingOperations.length} field record${pendingOperations.length === 1 ? "" : "s"} waiting to sync.${pendingOperations.filter((item) => item.needsAttention).length ? " Some need review before they can be sent again." : ""}`) : (sw ? "Umwagiliaji, kazi, grade za mavuno, tahadhari, pembejeo na mavuno huwekwa salama na kusawazishwa ukirudi mtandaoni. Bajeti hubaki online ili fedha zibaki sahihi." : "Irrigation, tasks, harvest grades, observations, inputs, and harvests queue safely and sync when you are back online. Budgets stay online so financial records remain accurate.")}</p>{pendingOperations.length > 0 && <button type="button" disabled={syncing || (typeof navigator !== "undefined" && !navigator.onLine)} onClick={() => syncPending().catch(() => {})} className="min-h-10 border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-900 disabled:opacity-50">{syncing ? (sw ? "Inasawazisha..." : "Syncing...") : (sw ? "Jaribu kusawazisha" : "Retry sync")}</button>}</section>

    <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={(event) => submit(event, async () => { const reset = () => setIrrigation((current) => ({ ...current, amount: "", durationMinutes: "", note: "", irrigatedAt: today() })); await submitFieldOperation(fieldOperation("/crops/irrigation", { ...irrigation, amount: irrigation.amount ? Number(irrigation.amount) : undefined, durationMinutes: irrigation.durationMinutes ? Number(irrigation.durationMinutes) : undefined, note: irrigation.note.trim() || undefined }, sw ? "Umwagiliaji" : "Irrigation", "POST", reset)); reset(); }, sw ? "Umwagiliaji umehifadhiwa." : "Irrigation saved.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={Droplets} title={sw ? "Rekodi umwagiliaji" : "Record irrigation"} text={sw ? "Weka kiasi cha maji au muda uliotumika." : "Record water amount or time used."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CycleSelect sw={sw} cycles={activeCycles} value={irrigation.cropCycleId} onChange={(value) => setIrrigation({ ...irrigation, cropCycleId: value })} /><Field label={sw ? "Kiasi cha maji" : "Water amount"} value={irrigation.amount} onChange={(value) => setIrrigation({ ...irrigation, amount: value })} type="number" /><Field label={sw ? "Kipimo" : "Unit"} value={irrigation.unit} onChange={(value) => setIrrigation({ ...irrigation, unit: value })} /><Field label={sw ? "Dakika" : "Minutes"} value={irrigation.durationMinutes} onChange={(value) => setIrrigation({ ...irrigation, durationMinutes: value })} type="number" /><Field label={sw ? "Tarehe" : "Date"} value={irrigation.irrigatedAt} onChange={(value) => setIrrigation({ ...irrigation, irrigatedAt: value })} type="date" required /></div><button disabled={saving} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Hifadhi umwagiliaji" : "Save irrigation"}</button></form>

      <form onSubmit={(event) => submit(event, async () => { const reset = () => setTask((current) => ({ ...current, title: "", dueAt: "", assignedStaffId: "" })); await submitFieldOperation(fieldOperation("/crops/tasks", { ...task, cropCycleId: task.cropCycleId || undefined, dueAt: task.dueAt || undefined, assignedStaffId: task.assignedStaffId || undefined }, sw ? "Kazi ya shamba" : "Field task", "POST", reset)); reset(); }, sw ? "Kazi imeongezwa." : "Task added.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={CalendarCheck2} title={sw ? "Kazi za shamba" : "Field tasks"} text={sw ? "Weka kazi ndogo na tarehe ya kufuatilia." : "Add practical work with an optional due date."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CycleSelect sw={sw} cycles={activeCycles} value={task.cropCycleId} onChange={(value) => setTask({ ...task, cropCycleId: value })} /><Field label={sw ? "Kazi" : "Task"} value={task.title} onChange={(value) => setTask({ ...task, title: value })} required /><Select label={sw ? "Kipaumbele" : "Priority"} value={task.priority} onChange={(value) => setTask({ ...task, priority: value })}><option value="LOW">{sw ? "Chini" : "Low"}</option><option value="NORMAL">{sw ? "Kawaida" : "Normal"}</option><option value="HIGH">{sw ? "Juu" : "High"}</option></Select><Field label={sw ? "Mwisho" : "Due date"} value={task.dueAt} onChange={(value) => setTask({ ...task, dueAt: value })} type="date" />{data?.financialsVisible && <Select label={sw ? "Mhusika" : "Assignee"} value={task.assignedStaffId} onChange={(value) => setTask({ ...task, assignedStaffId: value })}><option value="">{sw ? "Haijapangwa" : "Unassigned"}</option>{data.farmStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select>}</div><button disabled={saving} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Ongeza kazi" : "Add task"}</button></form>
    </section>

    <section className="border border-gray-200 bg-white p-5"><SectionTitle Icon={CalendarCheck2} title={sw ? "Kazi zilizo wazi" : "Open tasks"} text={sw ? "Sasisha hatua ya kazi ukimaliza." : "Update the task as field work is completed."} /><div className="mt-4 grid gap-3">{data?.tasks.length ? data.tasks.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-0"><div><p className="font-semibold text-gray-950">{item.title}</p><p className="mt-1 text-xs text-gray-500">{item.cropCycle ? `${item.cropCycle.cropName} - ${item.cropCycle.plot.name}` : "-"}{item.assignedStaffName ? ` - ${item.assignedStaffName}` : ""}{item.dueAt ? ` - ${displayDate(item.dueAt)}` : ""}</p></div><select value={item.status} disabled={saving} onChange={(event) => { saveInline(fieldOperation(`/crops/tasks/${item.id}`, { status: event.target.value, expectedUpdatedAt: item.updatedAt }, sw ? "Sasisha kazi" : "Task update", "PATCH"), sw ? "Kazi imesasishwa." : "Task updated.").catch(() => {}); }} className="min-h-10 border border-gray-300 bg-white px-3 text-sm">{taskStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></div>) : <p className="text-sm text-gray-500">{sw ? "Bado hakuna kazi." : "No field tasks yet."}</p>}</div></section>

    {data?.financialPlanningVisible && <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={(event) => submit(event, async () => { await api.put(`/crops/budgets/${budget.cropCycleId}`, { plannedCost: Number(budget.plannedCost || 0), plannedRevenue: budget.plannedRevenue ? Number(budget.plannedRevenue) : undefined, note: budget.note.trim() || undefined }, lang); }, sw ? "Bajeti imehifadhiwa." : "Budget saved.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={Target} title={sw ? "Bajeti ya msimu" : "Season budget"} text={sw ? "Linganisha gharama zilizopangwa na matokeo ya msimu." : "Set a plan to compare with the crop cycle outcome."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CycleSelect sw={sw} cycles={activeCycles} value={budget.cropCycleId} onChange={(value) => setBudget({ ...budget, cropCycleId: value })} /><Field label={sw ? "Gharama iliyopangwa (TZS)" : "Planned cost (TZS)"} value={budget.plannedCost} onChange={(value) => setBudget({ ...budget, plannedCost: value })} type="number" /><Field label={sw ? "Mapato yaliyopangwa (TZS)" : "Planned revenue (TZS)"} value={budget.plannedRevenue} onChange={(value) => setBudget({ ...budget, plannedRevenue: value })} type="number" /></div><button disabled={saving || !budget.cropCycleId} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Hifadhi bajeti" : "Save budget"}</button></form>
      <form onSubmit={(event) => submit(event, async () => { const reset = () => setContract((current) => ({ ...current, buyerName: "", buyerPhone: "", produceName: "", quantity: "", unitPrice: "", deliveryAt: "" })); await submitFieldOperation(fieldOperation("/crops/contracts", { ...contract, cropCycleId: contract.cropCycleId || undefined, quantity: Number(contract.quantity), unitPrice: contract.unitPrice ? Number(contract.unitPrice) : undefined, deliveryAt: contract.deliveryAt || undefined }, sw ? "Ahadi ya mnunuzi" : "Buyer commitment", "POST", reset)); reset(); }, sw ? "Ahadi ya mnunuzi imehifadhiwa." : "Buyer commitment saved.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={Wheat} title={sw ? "Mnunuzi / ahadi ya mauzo" : "Buyer commitment"} text={sw ? "Hii ni kumbukumbu ya ahadi; mauzo halisi huingia kupitia Mauzo." : "This records a commitment; actual revenue still goes through Sales."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CycleSelect sw={sw} cycles={activeCycles} value={contract.cropCycleId} onChange={(value) => setContract({ ...contract, cropCycleId: value })} /><Field label={sw ? "Jina la mnunuzi" : "Buyer name"} value={contract.buyerName} onChange={(value) => setContract({ ...contract, buyerName: value })} required /><Field label={sw ? "Bidhaa" : "Produce"} value={contract.produceName} onChange={(value) => setContract({ ...contract, produceName: value })} required /><Field label={sw ? "Kiasi" : "Quantity"} value={contract.quantity} onChange={(value) => setContract({ ...contract, quantity: value })} type="number" required /><Field label={sw ? "Bei kwa kipimo (TZS)" : "Unit price (TZS)"} value={contract.unitPrice} onChange={(value) => setContract({ ...contract, unitPrice: value })} type="number" /><Field label={sw ? "Tarehe ya kupeleka" : "Delivery date"} value={contract.deliveryAt} onChange={(value) => setContract({ ...contract, deliveryAt: value })} type="date" /></div><button disabled={saving} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Hifadhi ahadi" : "Save commitment"}</button></form>
    </section>}

    <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={(event) => submit(event, async () => { const reset = () => setGrade((current) => ({ ...current, quantity: "" })); const currentGrade = harvests.find((batch) => batch.id === grade.harvestBatchId)?.grades.find((item) => item.grade === grade.grade); await submitFieldOperation(fieldOperation(`/crops/harvests/${grade.harvestBatchId}/grades`, { grade: grade.grade, quantity: Number(grade.quantity), unit: grade.unit, expectedUpdatedAt: currentGrade?.updatedAt }, sw ? "Ubora wa mavuno" : "Harvest grade", "POST", reset)); reset(); }, sw ? "Ubora wa mavuno umehifadhiwa." : "Harvest grade saved.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={Wheat} title={sw ? "Panga ubora wa mavuno" : "Grade harvest"} text={sw ? "Gawanya mavuno kwa Grade A, B au jina lako." : "Split a harvest into Grade A, B, or your own label."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><Select label={sw ? "Batch ya mavuno" : "Harvest batch"} value={grade.harvestBatchId} onChange={(value) => setGrade({ ...grade, harvestBatchId: value })}><option value="">{sw ? "Chagua mavuno" : "Choose harvest"}</option>{harvests.map((batch) => <option key={batch.id} value={batch.id}>{batch.cycle.cropName} - {batch.outputProduct.name} ({batch.actualYield} {batch.outputProduct.unit})</option>)}</Select><Field label={sw ? "Grade" : "Grade"} value={grade.grade} onChange={(value) => setGrade({ ...grade, grade: value })} required /><Field label={sw ? "Kiasi" : "Quantity"} value={grade.quantity} onChange={(value) => setGrade({ ...grade, quantity: value })} type="number" required /><Field label={sw ? "Kipimo" : "Unit"} value={grade.unit} onChange={(value) => setGrade({ ...grade, unit: value })} /></div><button disabled={saving || !grade.harvestBatchId} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Hifadhi grade" : "Save grade"}</button></form>
      <form onSubmit={(event) => submit(event, async () => { const reset = () => setWeather((current) => ({ ...current, message: "", startsAt: today() })); await submitFieldOperation(fieldOperation("/crops/weather-alerts", { ...weather, cropCycleId: weather.cropCycleId || undefined }, sw ? "Tahadhari ya shamba" : "Field observation", "POST", reset)); reset(); }, sw ? "Tahadhari imehifadhiwa." : "Observation saved.")} className="border border-gray-200 bg-white p-5"><SectionTitle Icon={CloudSun} title={sw ? "Tahadhari ya hali ya shamba" : "Field weather observation"} text={sw ? "Rekodi ulichokiona shambani. Hii si utabiri wa hali ya hewa." : "Record what was observed in the field. This is not a weather forecast."} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CycleSelect sw={sw} cycles={activeCycles} value={weather.cropCycleId} onChange={(value) => setWeather({ ...weather, cropCycleId: value })} /><Select label={sw ? "Ukubwa" : "Severity"} value={weather.severity} onChange={(value) => setWeather({ ...weather, severity: value })}><option value="INFO">Info</option><option value="WATCH">{sw ? "Fuatilia" : "Watch"}</option><option value="WARNING">{sw ? "Tahadhari" : "Warning"}</option></Select><Field label={sw ? "Ulichokiona" : "Observation"} value={weather.message} onChange={(value) => setWeather({ ...weather, message: value })} required /><Field label={sw ? "Tarehe" : "Date"} value={weather.startsAt} onChange={(value) => setWeather({ ...weather, startsAt: value })} type="date" required /></div><button disabled={saving} className="mt-4 min-h-11 bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{sw ? "Hifadhi tahadhari" : "Save observation"}</button></form>
    </section>

    <section className="grid gap-5 lg:grid-cols-2"><ListCard title={sw ? "Umwagiliaji wa karibuni" : "Recent irrigation"}>{data?.irrigationLogs.length ? data.irrigationLogs.slice(0, 8).map((item) => <p key={item.id} className="border-b border-gray-100 py-3 text-sm text-gray-700 last:border-0"><strong>{item.cropCycle.cropName}</strong> - {item.amount ? `${item.amount} ${item.unit || ""}` : ""}{item.durationMinutes ? `${item.amount ? " / " : ""}${item.durationMinutes} min` : ""} - {displayDate(item.irrigatedAt)}</p>) : <p className="text-sm text-gray-500">{sw ? "Bado hakuna umwagiliaji." : "No irrigation logs yet."}</p>}</ListCard><ListCard title={sw ? "Tahadhari za shamba" : "Field observations"}>{data?.weatherAlerts.length ? data.weatherAlerts.slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-0"><p className="text-sm text-gray-700"><strong>{item.severity}</strong> - {item.message}</p><button type="button" disabled={saving} onClick={() => { saveInline(fieldOperation(`/crops/weather-alerts/${item.id}`, { isResolved: !item.isResolved, expectedUpdatedAt: item.updatedAt }, sw ? "Sasisha tahadhari" : "Observation update", "PATCH"), item.isResolved ? (sw ? "Tahadhari imefunguliwa." : "Observation reopened.") : (sw ? "Tahadhari imetatuliwa." : "Observation resolved.")).catch(() => {}); }} className="min-h-9 border border-gray-300 px-3 text-xs font-semibold text-gray-700">{item.isResolved ? (sw ? "Fungua" : "Reopen") : (sw ? "Tatua" : "Resolve")}</button></div>) : <p className="text-sm text-gray-500">{sw ? "Bado hakuna tahadhari." : "No observations yet."}</p>}</ListCard></section>

    {data?.financialPlanningVisible && <section className="grid gap-5 lg:grid-cols-2"><ListCard title={sw ? "Bajeti za misimu" : "Season budgets"}>{data.cycles.filter((cycle) => cycle.seasonBudget).map((cycle) => <p key={cycle.id} className="border-b border-gray-100 py-3 text-sm text-gray-700 last:border-0"><strong>{cycle.cropName}</strong> - {formatTZS(cycle.seasonBudget?.plannedCost || 0)}{cycle.seasonBudget?.plannedRevenue ? ` / ${formatTZS(cycle.seasonBudget.plannedRevenue)}` : ""}</p>) || <p className="text-sm text-gray-500">-</p>}</ListCard><ListCard title={sw ? "Ahadi za wanunuzi" : "Buyer commitments"}>{data.contracts.length ? data.contracts.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-0"><p className="text-sm text-gray-700"><strong>{item.produceName}</strong> - {item.buyerName}, {item.quantity} {item.unit}{item.unitPrice ? ` - ${formatTZS(item.unitPrice)}/${item.unit}` : ""}</p><select value={item.status} disabled={saving} onChange={(event) => { saveInline(fieldOperation(`/crops/contracts/${item.id}`, { status: event.target.value, expectedUpdatedAt: item.updatedAt }, sw ? "Sasisha ahadi" : "Commitment update", "PATCH"), sw ? "Ahadi imesasishwa." : "Commitment updated.").catch(() => {}); }} className="min-h-9 border border-gray-300 bg-white px-2 text-xs">{contractStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>) : <p className="text-sm text-gray-500">{sw ? "Bado hakuna ahadi." : "No buyer commitments yet."}</p>}</ListCard></section>}
  </main></AppShell>;
}

function SectionTitle({ Icon, title, text }: { Icon: typeof Sprout; title: string; text: string }) { return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 text-brand-700" /><div><h2 className="font-bold text-gray-950">{title}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{text}</p></div></div>; }
function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></label>; }
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="grid gap-1 text-sm font-medium text-gray-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">{children}</select></label>; }
function CycleSelect({ sw, cycles, value, onChange }: { sw: boolean; cycles: Cycle[]; value: string; onChange: (value: string) => void }) { return <Select label={sw ? "Msimu wa zao" : "Crop cycle"} value={value} onChange={onChange}><option value="">{sw ? "Chagua msimu" : "Choose cycle"}</option>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.cropName} - {cycle.plot.name}</option>)}</Select>; }
function ListCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border border-gray-200 bg-white p-5"><h2 className="font-bold text-gray-950">{title}</h2><div className="mt-3">{children}</div></section>; }
