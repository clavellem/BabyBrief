"use client";

import {
  Baby,
  BarChart3,
  Bed,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Clock3,
  Copy,
  Droplets,
  MessageSquareText,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Utensils,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type FeedingType = "bottle" | "nursing" | "solids" | "other";
type DiaperType = "wet" | "dirty" | "mixed";

type BabyEvent =
  | {
      id: string;
      type: "feeding";
      timestamp: string;
      feedingType: FeedingType;
      amountOz?: number;
      note?: string;
    }
  | {
      id: string;
      type: "nap";
      startTime: string;
      endTime: string;
      durationMinutes: number;
      note?: string;
    }
  | {
      id: string;
      type: "diaper";
      timestamp: string;
      diaperType: DiaperType;
      note?: string;
    };

type BabySettings = {
  babyName: string;
  babyAgeMonths: number;
};

type ActiveNap = {
  startTime: string;
  note?: string;
};

type FormMode = "feeding" | "diaper" | "nap-start" | "nap-end" | null;

type HandoffSummary = {
  generatedAt: string;
  overview: string;
  lastFeed: string;
  lastNap: string;
  lastDiaper: string;
  nextNap: string;
  missing: string[];
  copyable: string;
};

const eventStorageKey = "babybrief.events";
const settingsStorageKey = "babybrief.settings";
const activeNapStorageKey = "babybrief.activeNap";

const defaultSettings: BabySettings = {
  babyName: "Baby",
  babyAgeMonths: 5
};

const feedingLabels: Record<FeedingType, string> = {
  bottle: "Bottle feed",
  nursing: "Nursing",
  solids: "Solids",
  other: "Other feed"
};

const diaperLabels: Record<DiaperType, string> = {
  wet: "Wet diaper",
  dirty: "Dirty diaper",
  mixed: "Mixed diaper"
};

function toInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  return new Date(value).toISOString();
}

function todayAt(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function formatSince(iso: string) {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes >= 0) return `${formatDuration(Math.max(1, diffMinutes))} ago`;
  return `at ${formatTime(iso)}`;
}

function minutesBetween(startIso: string, endIso: string) {
  return Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

function isToday(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function eventDate(event: BabyEvent) {
  return event.type === "nap" ? event.endTime : event.timestamp;
}

function eventStartDate(event: BabyEvent) {
  return event.type === "nap" ? event.startTime : event.timestamp;
}

function wakeWindowForAge(ageMonths: number) {
  if (ageMonths <= 2) return { lower: 45, upper: 90, label: "45-90 minute" };
  if (ageMonths <= 4) return { lower: 75, upper: 120, label: "75-120 minute" };
  if (ageMonths <= 6) return { lower: 120, upper: 180, label: "2-3 hour" };
  if (ageMonths <= 9) return { lower: 150, upper: 210, label: "2.5-3.5 hour" };
  return { lower: 180, upper: 240, label: "3-4 hour" };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function latestEvent<T extends BabyEvent["type"]>(events: BabyEvent[], type: T) {
  return events
    .filter((event): event is Extract<BabyEvent, { type: T }> => event.type === type)
    .sort((a, b) => new Date(eventDate(b)).getTime() - new Date(eventDate(a)).getTime())[0];
}

function sampleDay(): BabyEvent[] {
  const napStart = todayAt("08:50");
  const napEnd = todayAt("09:35");
  return [
    {
      id: "sample-feed-1",
      type: "feeding",
      timestamp: todayAt("07:30"),
      feedingType: "bottle",
      amountOz: 5
    },
    {
      id: "sample-nap-1",
      type: "nap",
      startTime: napStart,
      endTime: napEnd,
      durationMinutes: minutesBetween(napStart, napEnd),
      note: "Woke for the day at 7:10 AM."
    },
    {
      id: "sample-diaper-1",
      type: "diaper",
      timestamp: todayAt("09:45"),
      diaperType: "wet"
    },
    {
      id: "sample-feed-2",
      type: "feeding",
      timestamp: todayAt("10:20"),
      feedingType: "bottle",
      amountOz: 4
    },
    {
      id: "sample-diaper-2",
      type: "diaper",
      timestamp: todayAt("11:50"),
      diaperType: "mixed"
    }
  ];
}

function friendlyEventLabel(event: BabyEvent) {
  if (event.type === "feeding") {
    const amount = event.amountOz ? ` - ${event.amountOz} oz` : "";
    return `${feedingLabels[event.feedingType]}${amount}`;
  }

  if (event.type === "nap") {
    return `Nap - ${formatDuration(event.durationMinutes)}`;
  }

  return diaperLabels[event.diaperType];
}

function timelineDetail(event: BabyEvent) {
  if (event.type === "nap") {
    return `${formatTime(event.startTime)} to ${formatTime(event.endTime)}`;
  }

  return formatTime(event.timestamp);
}

function bottleTotal(events: BabyEvent[]) {
  return events
    .filter((event): event is Extract<BabyEvent, { type: "feeding" }> => event.type === "feeding")
    .reduce((total, event) => total + (event.feedingType === "bottle" ? event.amountOz ?? 0 : 0), 0);
}

function buildPrediction(events: BabyEvent[], ageMonths: number) {
  const lastNap = latestEvent(events, "nap");
  const wakeWindow = wakeWindowForAge(ageMonths);

  if (!lastNap) {
    return {
      wakeWindow,
      lowerIso: null,
      upperIso: null,
      message: `Log a completed nap to estimate the next window. For a ${ageMonths}-month-old, a rough wake window is ${wakeWindow.label}.`
    };
  }

  const lowerIso = addMinutes(lastNap.endTime, wakeWindow.lower);
  const upperIso = addMinutes(lastNap.endTime, wakeWindow.upper);

  return {
    wakeWindow,
    lowerIso,
    upperIso,
    message: `Last nap ended at ${formatTime(lastNap.endTime)}. Based on a ${wakeWindow.label} wake window for a ${ageMonths}-month-old, the next nap may fall around ${formatTime(lowerIso)}-${formatTime(upperIso)}.`
  };
}

function buildInsights(events: BabyEvent[], ageMonths: number) {
  const insights: string[] = [];
  const todayEvents = events.filter((event) => isToday(eventDate(event)));
  const lastDiaper = latestEvent(todayEvents, "diaper");
  const lastNap = latestEvent(todayEvents, "nap");
  const ounces = bottleTotal(todayEvents);
  const prediction = buildPrediction(todayEvents, ageMonths);

  if (!lastDiaper) {
    insights.push("No diaper logged yet today.");
  } else {
    const minutes = minutesBetween(lastDiaper.timestamp, new Date().toISOString());
    if (minutes >= 180) insights.push("No diaper logged in the last 3 hours.");
  }

  if (lastNap && lastNap.durationMinutes < 45) {
    insights.push("Last nap was shorter than 45 minutes.");
  }

  if (prediction.lowerIso && prediction.upperIso) {
    const now = Date.now();
    const lower = new Date(prediction.lowerIso).getTime();
    const upper = new Date(prediction.upperIso).getTime();
    if (now >= lower - 30 * 60000 && now <= upper) {
      insights.push("Next nap window is approaching.");
    }
  }

  if (ounces > 0) insights.push(`Bottle total today: ${ounces} oz.`);

  return insights.length ? insights : ["Today is lightly logged so far."];
}

function buildHandoff(events: BabyEvent[], settings: BabySettings): HandoffSummary {
  const todayEvents = events.filter((event) => isToday(eventDate(event)));
  const feedCount = todayEvents.filter((event) => event.type === "feeding").length;
  const diapers = todayEvents.filter((event): event is Extract<BabyEvent, { type: "diaper" }> => event.type === "diaper");
  const naps = todayEvents.filter((event): event is Extract<BabyEvent, { type: "nap" }> => event.type === "nap");
  const napTotal = naps.reduce((total, event) => total + event.durationMinutes, 0);
  const lastFeed = latestEvent(todayEvents, "feeding");
  const lastNap = latestEvent(todayEvents, "nap");
  const lastDiaper = latestEvent(todayEvents, "diaper");
  const prediction = buildPrediction(todayEvents, settings.babyAgeMonths);
  const missing: string[] = [];

  if (!lastFeed) missing.push("No feed has been logged yet today.");
  if (!lastNap) missing.push("No completed nap has been logged yet today.");
  if (!lastDiaper) missing.push("No diaper has been logged yet today.");
  if (!diapers.some((diaper) => diaper.diaperType === "dirty" || diaper.diaperType === "mixed")) {
    missing.push("No dirty diaper has been logged yet today.");
  }

  const lastFeedLine = lastFeed
    ? `Last feed was at ${formatTime(lastFeed.timestamp)}${lastFeed.amountOz ? ` (${lastFeed.amountOz} oz)` : ""}.`
    : "Last feed is not logged.";
  const lastNapLine = lastNap
    ? `Last nap ended at ${formatTime(lastNap.endTime)} after ${formatDuration(lastNap.durationMinutes)}.`
    : "Last nap is not logged.";
  const lastDiaperLine = lastDiaper
    ? `Last diaper was ${lastDiaper.diaperType} at ${formatTime(lastDiaper.timestamp)}.`
    : "Last diaper is not logged.";
  const predictionLine =
    prediction.lowerIso && prediction.upperIso
      ? `Based on the current age setting, the next nap may be around ${formatTime(prediction.lowerIso)}-${formatTime(prediction.upperIso)}.`
      : prediction.message;

  const copyableParts = [
    lastFeed ? `${settings.babyName} last ate at ${formatTime(lastFeed.timestamp)}` : null,
    lastNap ? `woke from nap at ${formatTime(lastNap.endTime)}` : null,
    lastDiaper ? `had a ${lastDiaper.diaperType} diaper at ${formatTime(lastDiaper.timestamp)}` : null,
    prediction.lowerIso && prediction.upperIso
      ? `may be ready for another nap around ${formatTime(prediction.lowerIso)}-${formatTime(prediction.upperIso)} depending on cues`
      : null
  ].filter(Boolean);

  const copyable = copyableParts.length
    ? `${copyableParts.join(", ")}.`
    : "The day has not been logged yet.";

  return {
    generatedAt: new Date().toISOString(),
    overview: `Today so far: ${feedCount} feed${feedCount === 1 ? "" : "s"}, ${diapers.length} diaper${diapers.length === 1 ? "" : "s"}, and ${naps.length} nap${naps.length === 1 ? "" : "s"} totaling ${formatDuration(napTotal)}.`,
    lastFeed: lastFeedLine,
    lastNap: lastNapLine,
    lastDiaper: lastDiaperLine,
    nextNap: predictionLine,
    missing: missing.length ? missing : ["No obvious gaps from today's logs."],
    copyable
  };
}

function formatHandoffForClipboard(handoff: HandoffSummary) {
  return `${handoff.overview}

${handoff.lastFeed}
${handoff.lastNap}
${handoff.lastDiaper}
${handoff.nextNap}

Missing context:
${handoff.missing.map((item) => `- ${item}`).join("\n")}

Copyable handoff:
"${handoff.copyable}"`;
}

export default function Home() {
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [settings, setSettings] = useState<BabySettings>(defaultSettings);
  const [activeNap, setActiveNap] = useState<ActiveNap | null>(null);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState(toInputValue(new Date()));
  const [napStartValue, setNapStartValue] = useState(toInputValue(new Date(Date.now() - 35 * 60000)));
  const [napEndValue, setNapEndValue] = useState(toInputValue(new Date()));
  const [feedingType, setFeedingType] = useState<FeedingType>("bottle");
  const [amountOz, setAmountOz] = useState("");
  const [diaperType, setDiaperType] = useState<DiaperType>("wet");
  const [note, setNote] = useState("");
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedEvents = window.localStorage.getItem(eventStorageKey);
    const storedSettings = window.localStorage.getItem(settingsStorageKey);
    const storedActiveNap = window.localStorage.getItem(activeNapStorageKey);

    if (storedEvents) setEvents(JSON.parse(storedEvents));
    if (storedSettings) setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });
    if (storedActiveNap) setActiveNap(JSON.parse(storedActiveNap));
  }, []);

  useEffect(() => {
    setCurrentDate(new Date());
    const timer = window.setInterval(() => setCurrentDate(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(eventStorageKey, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (activeNap) {
      window.localStorage.setItem(activeNapStorageKey, JSON.stringify(activeNap));
    } else {
      window.localStorage.removeItem(activeNapStorageKey);
    }
  }, [activeNap]);

  const todayEvents = useMemo(
    () =>
      events
        .filter((event) => isToday(eventDate(event)))
        .sort((a, b) => new Date(eventStartDate(a)).getTime() - new Date(eventStartDate(b)).getTime()),
    [events]
  );

  const lastFeed = latestEvent(todayEvents, "feeding");
  const lastNap = latestEvent(todayEvents, "nap");
  const lastDiaper = latestEvent(todayEvents, "diaper");
  const napTotal = todayEvents
    .filter((event): event is Extract<BabyEvent, { type: "nap" }> => event.type === "nap")
    .reduce((total, event) => total + event.durationMinutes, 0);
  const feedCount = todayEvents.filter((event) => event.type === "feeding").length;
  const diaperCount = todayEvents.filter((event) => event.type === "diaper").length;
  const napCount = todayEvents.filter((event) => event.type === "nap").length;
  const ouncesToday = bottleTotal(todayEvents);
  const prediction = buildPrediction(todayEvents, settings.babyAgeMonths);
  const insights = buildInsights(todayEvents, settings.babyAgeMonths);
  const maxCount = Math.max(feedCount, diaperCount, napCount, 1);
  const maxNapDuration = Math.max(
    ...todayEvents.filter((event): event is Extract<BabyEvent, { type: "nap" }> => event.type === "nap").map((event) => event.durationMinutes),
    60
  );

  function openForm(mode: Exclude<FormMode, null>) {
    const now = new Date();
    setEditingEventId(null);
    setFormMode(mode);
    setTimeValue(toInputValue(now));
    setNapEndValue(toInputValue(now));
    setNapStartValue(activeNap ? toInputValue(new Date(activeNap.startTime)) : toInputValue(new Date(Date.now() - 35 * 60000)));
    setFeedingType("bottle");
    setAmountOz("");
    setDiaperType("wet");
    setNote(activeNap && mode === "nap-end" ? activeNap.note ?? "" : "");
    setCopied(false);
  }

  function resetForm() {
    setFormMode(null);
    setEditingEventId(null);
    setNote("");
  }

  function addEvent(event: BabyEvent) {
    setEvents((current) => [...current.filter((item) => item.id !== event.id), event]);
    setHandoff(null);
    resetForm();
  }

  function editEvent(event: BabyEvent) {
    setEditingEventId(event.id);
    setCopied(false);

    if (event.type === "feeding") {
      setFormMode("feeding");
      setTimeValue(toInputValue(new Date(event.timestamp)));
      setFeedingType(event.feedingType);
      setAmountOz(event.amountOz ? String(event.amountOz) : "");
      setNote(event.note ?? "");
    }

    if (event.type === "diaper") {
      setFormMode("diaper");
      setTimeValue(toInputValue(new Date(event.timestamp)));
      setDiaperType(event.diaperType);
      setNote(event.note ?? "");
    }

    if (event.type === "nap") {
      setFormMode("nap-end");
      setNapStartValue(toInputValue(new Date(event.startTime)));
      setNapEndValue(toInputValue(new Date(event.endTime)));
      setNote(event.note ?? "");
    }
  }

  function submitForm() {
    if (formMode === "feeding") {
      const amount = Number.parseFloat(amountOz);
      addEvent({
        id: editingEventId ?? makeId(),
        type: "feeding",
        timestamp: fromInputValue(timeValue),
        feedingType,
        amountOz: Number.isFinite(amount) && amount > 0 ? amount : undefined,
        note: note.trim() || undefined
      });
    }

    if (formMode === "diaper") {
      addEvent({
        id: editingEventId ?? makeId(),
        type: "diaper",
        timestamp: fromInputValue(timeValue),
        diaperType,
        note: note.trim() || undefined
      });
    }

    if (formMode === "nap-start") {
      setActiveNap({
        startTime: fromInputValue(timeValue),
        note: note.trim() || undefined
      });
      setHandoff(null);
      resetForm();
    }

    if (formMode === "nap-end") {
      const startTime = fromInputValue(napStartValue);
      const endTime = fromInputValue(napEndValue);
      addEvent({
        id: editingEventId ?? makeId(),
        type: "nap",
        startTime,
        endTime,
        durationMinutes: minutesBetween(startTime, endTime),
        note: note.trim() || undefined
      });
      if (!editingEventId) setActiveNap(null);
    }
  }

  function loadSampleDay() {
    setEvents(sampleDay());
    setSettings({ babyName: "Baby", babyAgeMonths: 5 });
    setActiveNap(null);
    setHandoff(null);
    resetForm();
  }

  function clearData() {
    setEvents([]);
    setActiveNap(null);
    setHandoff(null);
    resetForm();
  }

  function deleteEvent(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id));
    setHandoff(null);
  }

  async function copyHandoff() {
    if (!handoff) return;
    await navigator.clipboard.writeText(handoff.copyable);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copyFullHandoff() {
    if (!handoff) return;
    await navigator.clipboard.writeText(formatHandoffForClipboard(handoff));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const metrics = [
    {
      label: "Last feeding",
      value: lastFeed ? formatSince(lastFeed.timestamp) : "None today"
    },
    {
      label: "Last nap ended",
      value: lastNap ? formatSince(lastNap.endTime) : "None today"
    },
    {
      label: "Last diaper",
      value: lastDiaper ? formatSince(lastDiaper.timestamp) : "None today"
    },
    { label: "Nap total", value: formatDuration(napTotal) },
    { label: "Feeds today", value: String(feedCount) },
    { label: "Diapers today", value: String(diaperCount) }
  ];
  const formTitle = editingEventId
    ? "Edit logged event"
    : formMode === "nap-start"
      ? "Start a nap"
      : formMode === "nap-end"
        ? "End a nap"
        : formMode === "feeding"
          ? "Add feeding"
          : "Add diaper";

  return (
    <main className="shell">
      <header className="app-header">
        <div className="brand-lockup">
          <h1>BabyBrief</h1>
          <p>Simple care tracking and handoff summaries for new parents</p>
        </div>
        <div className="today-pill" aria-label="Current date">
          <CalendarDays size={18} />
          {currentDate ? formatDate(currentDate) : "Today"}
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="left-stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <Baby size={19} />
                  Baby Settings
                </h2>
                <p className="section-kicker">Wake windows are rough planning estimates.</p>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                Baby name
                <input
                  value={settings.babyName}
                  onChange={(event) => setSettings((current) => ({ ...current, babyName: event.target.value || "Baby" }))}
                />
              </label>
              <label>
                Age in months
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={settings.babyAgeMonths}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      babyAgeMonths: Math.max(0, Number.parseInt(event.target.value || "0", 10))
                    }))
                  }
                />
              </label>
            </div>
            <div className="wake-guidance">
              <Clock3 size={18} />
              <span>
                For {settings.babyAgeMonths} months, BabyBrief uses a rough {wakeWindowForAge(settings.babyAgeMonths).label} wake
                window. This is not medical advice.
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <Plus size={19} />
                  Quick Log
                </h2>
                {activeNap ? <p className="section-kicker">Nap started at {formatTime(activeNap.startTime)}</p> : null}
              </div>
            </div>
            <div className="quick-grid">
              <button className="action-button action-nap" onClick={() => openForm("nap-start")} type="button">
                <Moon size={18} />
                Start nap
              </button>
              <button className="action-button action-nap" onClick={() => openForm("nap-end")} type="button">
                <Bed size={18} />
                End nap
              </button>
              <button className="action-button action-feed" onClick={() => openForm("feeding")} type="button">
                <Utensils size={18} />
                Add feeding
              </button>
              <button className="action-button action-diaper" onClick={() => openForm("diaper")} type="button">
                <Droplets size={18} />
                Add diaper
              </button>
            </div>

            {formMode ? (
              <div className="form-panel">
                <div className="form-panel-header">
                  <strong>{formTitle}</strong>
                  {editingEventId ? <span>Changes update the timeline immediately.</span> : null}
                </div>
                <div className="form-grid">
                  {formMode === "feeding" ? (
                    <>
                      <label>
                        Time
                        <input type="datetime-local" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
                      </label>
                      <label>
                        Type
                        <select value={feedingType} onChange={(event) => setFeedingType(event.target.value as FeedingType)}>
                          <option value="bottle">Bottle</option>
                          <option value="nursing">Nursing</option>
                          <option value="solids">Solids</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        Amount oz
                        <input value={amountOz} onChange={(event) => setAmountOz(event.target.value)} inputMode="decimal" />
                      </label>
                    </>
                  ) : null}

                  {formMode === "diaper" ? (
                    <>
                      <label>
                        Time
                        <input type="datetime-local" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
                      </label>
                      <label>
                        Type
                        <select value={diaperType} onChange={(event) => setDiaperType(event.target.value as DiaperType)}>
                          <option value="wet">Wet</option>
                          <option value="dirty">Dirty</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </label>
                    </>
                  ) : null}

                  {formMode === "nap-start" ? (
                    <label className="full-span">
                      Start time
                      <input type="datetime-local" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
                    </label>
                  ) : null}

                  {formMode === "nap-end" ? (
                    <>
                      <label>
                        Start time
                        <input type="datetime-local" value={napStartValue} onChange={(event) => setNapStartValue(event.target.value)} />
                      </label>
                      <label>
                        End time
                        <input type="datetime-local" value={napEndValue} onChange={(event) => setNapEndValue(event.target.value)} />
                      </label>
                    </>
                  ) : null}

                  <label className="full-span">
                    Notes
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="ghost-button" onClick={resetForm} type="button">
                    <X size={17} />
                    Cancel
                  </button>
                  <button className="secondary-button" onClick={submitForm} type="button">
                    {editingEventId ? <CheckCircle2 size={17} /> : <Plus size={17} />}
                    {editingEventId ? "Save changes" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <RotateCcw size={19} />
                  Demo Controls
                </h2>
              </div>
            </div>
            <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
              <button className="secondary-button" type="button" onClick={loadSampleDay}>
                Load sample day
              </button>
              <button className="ghost-button" type="button" onClick={clearData}>
                Clear all demo data
              </button>
            </div>
          </div>
        </section>

        <section className="right-stack">
          <div className="metrics-grid" aria-label="Current status">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>

          <div className="panel prediction">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <Sparkles size={19} />
                  Next Nap Window
                </h2>
              </div>
            </div>
            <div className="prediction-window">
              <span className="muted">Suggested window</span>
              <strong>
                {prediction.lowerIso && prediction.upperIso
                  ? `${formatTime(prediction.lowerIso)}-${formatTime(prediction.upperIso)}`
                  : "Waiting for nap log"}
              </strong>
              <p>{prediction.message}</p>
            </div>
            <div className="insights">
              {insights.map((insight) => (
                <div className="insight-row" key={insight}>
                  <Clock3 size={16} />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
            <p className="section-kicker">
              This is a planning estimate based on age and logged events. Always use baby's cues and your pediatrician's guidance.
            </p>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <Clock3 size={19} />
                  Today Timeline
                </h2>
                <p className="section-kicker">{todayEvents.length} logged event{todayEvents.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="timeline">
              {todayEvents.length ? (
                todayEvents.map((event) => (
                  <article className="timeline-row" key={event.id}>
                    <div className="timeline-icon">
                      {event.type === "feeding" ? <Utensils size={18} /> : null}
                      {event.type === "nap" ? <Moon size={18} /> : null}
                      {event.type === "diaper" ? <Droplets size={18} /> : null}
                    </div>
                    <div>
                      <h3>{friendlyEventLabel(event)}</h3>
                      <p>
                        {timelineDetail(event)}
                        {event.note ? ` - ${event.note}` : ""}
                      </p>
                    </div>
                    <div className="timeline-actions">
                      <button className="icon-button edit-icon" type="button" aria-label="Edit event" onClick={() => editEvent(event)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-button" type="button" aria-label="Delete event" onClick={() => deleteEvent(event.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No events logged today.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <BarChart3 size={19} />
                  Today At A Glance
                </h2>
              </div>
            </div>
            <div className="charts-grid">
              <div className="count-bars">
                {[
                  { label: "Feeds", value: feedCount, color: "#527c58" },
                  { label: "Naps", value: napCount, color: "#4e7391" },
                  { label: "Diapers", value: diaperCount, color: "#c67653" }
                ].map((item) => (
                  <div className="bar-row" key={item.label}>
                    <span>{item.label}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(item.value / maxCount) * 100}%`, background: item.color }} />
                    </div>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div>
                <p className="section-kicker">Nap duration chart</p>
                <div className="nap-bars">
                  {todayEvents.filter((event) => event.type === "nap").length ? (
                    todayEvents
                      .filter((event): event is Extract<BabyEvent, { type: "nap" }> => event.type === "nap")
                      .map((nap) => (
                        <div className="nap-bar" key={nap.id}>
                          <span>{formatTime(nap.startTime)}</span>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${Math.max(8, (nap.durationMinutes / maxNapDuration) * 100)}%`,
                                background: "#4e7391"
                              }}
                            />
                          </div>
                          <strong>{nap.durationMinutes} min</strong>
                        </div>
                      ))
                  ) : (
                    <div className="empty-state">No naps to chart yet.</div>
                  )}
                </div>
              </div>

              <div className="wake-guidance" style={{ marginTop: 0 }}>
                <Utensils size={18} />
                <span>Bottle total today: {ouncesToday ? `${ouncesToday} oz` : "none entered"}.</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <Clipboard size={19} />
                  Caregiver Handoff
                </h2>
                <p className="section-kicker">Review the essentials, then copy or share the short message.</p>
              </div>
            </div>
            <div className="handoff-steps">
              <div>
                <CheckCircle2 size={16} />
                <span>Check recent care</span>
              </div>
              <div>
                <Clock3 size={16} />
                <span>Confirm next nap</span>
              </div>
              <div>
                <MessageSquareText size={16} />
                <span>Send handoff</span>
              </div>
            </div>
            <div className="form-actions handoff-actions">
              <button className="copy-button" type="button" onClick={() => setHandoff(buildHandoff(events, settings))}>
                <Sparkles size={17} />
                {handoff ? "Refresh handoff" : "Generate handoff"}
              </button>
              <button className="secondary-button" type="button" onClick={copyHandoff} disabled={!handoff}>
                <Copy size={17} />
                {copied ? "Copied" : "Copy message"}
              </button>
            </div>
            {handoff ? (
              <div className="handoff-panel">
                <div className="handoff-review">
                  <div>
                    <span>Today</span>
                    <strong>{handoff.overview}</strong>
                  </div>
                  <div>
                    <span>Last feed</span>
                    <p>{handoff.lastFeed}</p>
                  </div>
                  <div>
                    <span>Last nap</span>
                    <p>{handoff.lastNap}</p>
                  </div>
                  <div>
                    <span>Last diaper</span>
                    <p>{handoff.lastDiaper}</p>
                  </div>
                  <div>
                    <span>Next nap</span>
                    <p>{handoff.nextNap}</p>
                  </div>
                </div>
                <div className="missing-list">
                  <span>Missing context</span>
                  {handoff.missing.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <button className="ghost-button full-width-button" type="button" onClick={copyFullHandoff}>
                  <Clipboard size={17} />
                  Copy full summary
                </button>
              </div>
            ) : (
              <div className="empty-state handoff-empty">
                <strong>Ready when the next caregiver is.</strong>
                <span>Generate a handoff to gather the latest feed, nap, diaper, and next-nap estimate in one place.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="footer-note">
        Prototype only. Wake window guidance is an estimate based on age and logged events, not medical advice.
      </footer>
    </main>
  );
}
