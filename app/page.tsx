"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type CardItem = {
  id: string;
  name: string;
  credits: number;
  grade: string;
  zoneId: string;
  isMajorRequirement: boolean;
  isDisabled: boolean;
};

type DropZoneModel = {
  id: string;
  name: string;
};

type ToastState = { type: "ok" | "danger"; msg: string } | null;

type ExportPayloadV1 = {
  schema: "gpa-counter";
  version: 1;
  exportedAt: string;
  zones: DropZoneModel[];
  cards: CardItem[];
};

type HonorBand = {
  label: string;
  minMcga: number;
  minCga: number;
  tone: string;
  ring: string;
  chip: string;
};

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "P", "T"] as const;

const GRADE_POINTS: Record<string, number | null> = {
  "A+": 4.3,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  D: 1.0,
  F: 0,
  P: null,
  T: null,
};

const HONOR_BANDS: HonorBand[] = [
  {
    label: "First Class Honors",
    minMcga: 3.6,
    minCga: 3.4,
    tone: "bg-amber-50 text-amber-900",
    ring: "ring-amber-200 border-amber-300",
    chip: "bg-amber-500 text-white",
  },
  {
    label: "Second Class Honors, Division I",
    minMcga: 2.85,
    minCga: 2.7,
    tone: "bg-sky-50 text-sky-900",
    ring: "ring-sky-200 border-sky-300",
    chip: "bg-sky-500 text-white",
  },
  {
    label: "Second Class Honors, Division II",
    minMcga: 2.15,
    minCga: 2.0,
    tone: "bg-emerald-50 text-emerald-900",
    ring: "ring-emerald-200 border-emerald-300",
    chip: "bg-emerald-500 text-white",
  },
  {
    label: "Third Class Honors",
    minMcga: 1.7,
    minCga: 1.7,
    tone: "bg-violet-50 text-violet-900",
    ring: "ring-violet-200 border-violet-300",
    chip: "bg-violet-500 text-white",
  },
  {
    label: "Pass",
    minMcga: 0.85,
    minCga: 0.85,
    tone: "bg-stone-100 text-stone-800",
    ring: "ring-stone-200 border-stone-300",
    chip: "bg-stone-500 text-white",
  },
];

const CARD_HOLDER_ZONE_ID = "cardHolder";
const MAX_CARDS_IN_HOLDER = 6;
const MAX_VISIBLE_ZONES = 12;
const STORAGE_KEY = "gpa-calculator:v1";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}

/** 支援兩種 import：純 JSON，或者 "GPA1:" prefix + JSON */
function parseImportText(raw: string): unknown {
  const s = (raw ?? "").trim();
  if (!s) throw new Error("空白內容");
  const stripped = s.startsWith("GPA1:") ? s.slice("GPA1:".length).trim() : s;
  return JSON.parse(stripped);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function Modal(props: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  const { open, title, children, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm font-medium hover:bg-neutral-100">
            關閉
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Pill(props: { children: React.ReactNode; tone?: "neutral" | "danger" | "ok" }) {
  const { children, tone = "neutral" } = props;
  const cls =
    tone === "danger"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "ok"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-neutral-50 text-neutral-700 ring-neutral-200";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${cls}`}>{children}</span>;
}

export default function Page() {
  type TermPoint = {
    term: number;
    label: string;
    tga: number | null;
    cga: number | null;
    termCredits: number;
    cumCredits: number;
  };

  // ---- state ----
  const [zones, setZones] = useState<DropZoneModel[]>([
    { id: "zone-1", name: "YEAR 1 FALL SEM" },
  ]);

  const [cards, setCards] = useState<CardItem[]>([
    { id: "comp2011", name: "COMP2011", credits: 4, grade: "C", zoneId: "zone-1", isMajorRequirement: true, isDisabled: false },
  ]);

  // drag + delete
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // modals
  const [showCardModal, setShowCardModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [editingZone, setEditingZone] = useState<DropZoneModel | null>(null);

  const [form, setForm] = useState({ name: "", credits: "3", grade: "A", isMajorRequirement: false });
  const [zoneForm, setZoneForm] = useState({ name: "" });
  const [editCardForm, setEditCardForm] = useState({ name: "", credits: "", grade: "A", isMajorRequirement: false, isDisabled: false });
  const [editZoneForm, setEditZoneForm] = useState({ name: "" });

  // toast
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Import/Export modal
  const [ieOpen, setIeOpen] = useState(false);
  const [ieTab, setIeTab] = useState<"export" | "import">("export");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  // ---- derived ----
  const holderCount = useMemo(() => cards.filter((c) => c.zoneId === CARD_HOLDER_ZONE_ID).length, [cards]);

  const workingCards = useMemo(() => cards.filter((c) => c.zoneId !== CARD_HOLDER_ZONE_ID), [cards]);

  const activeWorkingCards = useMemo(() => workingCards.filter((c) => !c.isDisabled), [workingCards]);

  const { totalCredits, totalGradePoints, gpa } = useMemo(() => {
    let credits = 0;
    let points = 0;
    for (const c of activeWorkingCards) {
      const gp = GRADE_POINTS[c.grade];
      if (typeof gp === "number") {
        credits += c.credits;
        points += gp * c.credits;
      }
    }
    return { totalCredits: credits, totalGradePoints: points, gpa: credits ? points / credits : 0 };
  }, [activeWorkingCards]);

  const majorCards = useMemo(() => activeWorkingCards.filter((c) => c.isMajorRequirement), [activeWorkingCards]);

  const { majorCredits, majorGpa } = useMemo(() => {
    let credits = 0;
    let points = 0;
    for (const c of majorCards) {
      const gp = GRADE_POINTS[c.grade];
      if (typeof gp === "number") {
        credits += c.credits;
        points += gp * c.credits;
      }
    }
    return { majorCredits: credits, majorGpa: credits ? points / credits : 0 };
  }, [majorCards]);

  const currentHonorBand = useMemo(() => {
    if (!totalCredits || !majorCredits) return null;
    return HONOR_BANDS.find((band) => majorGpa >= band.minMcga && gpa >= band.minCga) ?? null;
  }, [gpa, majorCredits, majorGpa, totalCredits]);

  const sortedWorkingCards = useMemo(() => {
    const gradeRank: Record<string, number> = {
      "A+": 0,
      A: 1,
      "A-": 2,
      "B+": 3,
      B: 4,
      "B-": 5,
      "C+": 6,
      C: 7,
      "C-": 8,
      D: 9,
      F: 10,
      P: 11,
      T: 12,
    };

    return [...workingCards].sort((a, b) => {
      const byGrade = (gradeRank[a.grade] ?? 999) - (gradeRank[b.grade] ?? 999);
      if (byGrade !== 0) return byGrade;
      return a.name.localeCompare(b.name);
    });
  }, [workingCards]);

  const termSeries = useMemo<TermPoint[]>(() => {
    // 只計 working zones（排除 holder）
    const zoneHasAny = new Set(cards.filter((c) => c.zoneId !== CARD_HOLDER_ZONE_ID && !c.isDisabled).map((c) => c.zoneId));

    // 只顯示有卡嘅 terms（避免空 term 拉長 x 軸）
    const terms = zones.filter((z) => zoneHasAny.has(z.id));

    let cumCredits = 0;
    let cumPoints = 0;

    return terms.map((z, i) => {
      const zoneCards = cards.filter((c) => c.zoneId === z.id && !c.isDisabled);

      let termCredits = 0;
      let termPoints = 0;

      for (const c of zoneCards) {
        const gp = GRADE_POINTS[c.grade];
        if (typeof gp === "number") {
          termCredits += c.credits;
          termPoints += gp * c.credits;
        }
      }

      const tga = termCredits ? termPoints / termCredits : null;

      // 累積（只累積有計入 GPA 嘅 credits）
      if (termCredits) {
        cumCredits += termCredits;
        cumPoints += termPoints;
      }
      const cga = cumCredits ? cumPoints / cumCredits : null;

      return {
        term: i + 1,
        label: z.name,
        tga,
        cga,
        termCredits,
        cumCredits,
      };
    });
  }, [zones, cards]);

  // ---- DnD ----
  const allowDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => setDraggingId(null), []);

  const moveCard = useCallback(
    (id: string, zoneId: string) => {
      setCards((prev) => {
        if (zoneId === CARD_HOLDER_ZONE_ID) {
          const moving = prev.find((c) => c.id === id);
          const alreadyInHolder = moving?.zoneId === CARD_HOLDER_ZONE_ID;
          const countExcludingMoving = prev.filter((c) => c.zoneId === CARD_HOLDER_ZONE_ID && c.id !== id).length;
          if (!alreadyInHolder && countExcludingMoving >= MAX_CARDS_IN_HOLDER) {
            setToast({ type: "danger", msg: `Card Holder 已滿（上限 ${MAX_CARDS_IN_HOLDER}）` });
            return prev;
          }
        }
        return prev.map((c) => (c.id === id ? { ...c, zoneId } : c));
      });
    },
    []
  );

  const makeDropHandler = useCallback(
    (zoneId: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) moveCard(id, zoneId);
      setDraggingId(null);
    },
    [moveCard]
  );

  const deleteCard = useCallback((id: string) => setCards((prev) => prev.filter((c) => c.id !== id)), []);

  const handleDeleteDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) deleteCard(id);
      setDraggingId(null);
      setToast({ type: "ok", msg: "已刪除 card" });
    },
    [deleteCard]
  );

  // ---- CRUD ----
  const submitNewCard = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (holderCount >= MAX_CARDS_IN_HOLDER) {
        setToast({ type: "danger", msg: `Card Holder 已滿（上限 ${MAX_CARDS_IN_HOLDER}）` });
        return;
      }
      const creditsNum = parseFloat(form.credits);
      if (!form.name.trim() || !Number.isFinite(creditsNum) || creditsNum <= 0) return;

      const newCard: CardItem = {
        id: `card-${Date.now()}`,
        name: form.name.trim(),
        credits: creditsNum,
        grade: form.grade,
        zoneId: CARD_HOLDER_ZONE_ID,
        isMajorRequirement: form.isMajorRequirement,
        isDisabled: false,
      };

      setCards((prev) => [...prev, newCard]);
      setForm({ name: "", credits: "3", grade: "A", isMajorRequirement: false });
      setShowCardModal(false);
      setToast({ type: "ok", msg: "已新增 card（落咗喺 Card Holder）" });
    },
    [form, holderCount]
  );

  const submitEditCard = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingCard) return;
      const creditsNum = parseFloat(editCardForm.credits);
      if (!editCardForm.name.trim() || !Number.isFinite(creditsNum) || creditsNum <= 0) return;

      setCards((prev) =>
        prev.map((c) =>
          c.id === editingCard.id
            ? {
                ...c,
                name: editCardForm.name.trim(),
                credits: creditsNum,
                grade: editCardForm.grade,
                isMajorRequirement: editCardForm.isMajorRequirement,
                isDisabled: editCardForm.isDisabled,
              }
            : c
        )
      );
      setEditingCard(null);
      setToast({ type: "ok", msg: "已更新 card" });
    },
    [editingCard, editCardForm]
  );

  const submitNewZone = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = zoneForm.name.trim();
      if (!name) return;

      // slug id
      let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (!slug) slug = `zone-${Date.now()}`;
      let unique = slug;
      let i = 1;
      while (zones.some((z) => z.id === unique)) unique = `${slug}-${i++}`;

      setZones((prev) => [...prev, { id: unique, name }]);
      setZoneForm({ name: "" });
      setShowZoneModal(false);
      setToast({ type: "ok", msg: "已新增 zone" });
    },
    [zoneForm, zones]
  );

  const submitEditZone = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingZone) return;
      const name = editZoneForm.name.trim();
      if (!name) return;

      if (zones.some((z) => z.id !== editingZone.id && z.name.toLowerCase() === name.toLowerCase())) {
        setToast({ type: "danger", msg: "Zone 名稱重複" });
        return;
      }

      setZones((prev) => prev.map((z) => (z.id === editingZone.id ? { ...z, name } : z)));
      setEditingZone(null);
      setToast({ type: "ok", msg: "已更新 zone" });
    },
    [editingZone, editZoneForm, zones]
  );

  // ---- Import / Export ----
  const exportPayload: ExportPayloadV1 = useMemo(() => {
    return {
      schema: "gpa-counter",
      version: 1,
      exportedAt: new Date().toISOString(),
      zones,
      cards,
    };
  }, [zones, cards]);

  const exportText = useMemo(() => JSON.stringify(exportPayload, null, 2), [exportPayload]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ type: "ok", msg: "已 copy" });
    } catch {
      setToast({ type: "danger", msg: "copy 失敗（瀏覽器權限/安全限制）" });
    }
  }, []);

  const validateAndNormalizePayload = useCallback(
    (input: unknown): { zones: DropZoneModel[]; cards: CardItem[]; warning?: string } => {
    if (!isObj(input)) throw new Error("唔係 object");
    if (input.schema !== "gpa-counter") throw new Error("schema 唔啱（唔係 gpa-counter）");
    if (input.version !== 1) throw new Error("version 唔支援（只支援 v1）");

    const rawZones = (input.zones ?? null) as unknown;
    const rawCards = (input.cards ?? null) as unknown;

    if (!Array.isArray(rawZones)) throw new Error("zones 唔係 array");
    if (!Array.isArray(rawCards)) throw new Error("cards 唔係 array");

    const nextZones: DropZoneModel[] = rawZones
      .filter((z) => isObj(z))
      .map((z) => ({ id: String(z.id ?? "").trim(), name: String(z.name ?? "").trim() }))
      .filter((z) => z.id && z.name);

    // ensure unique zone ids
    const seenZone = new Set<string>();
    const fixedZones: DropZoneModel[] = [];
    for (const z of nextZones) {
      let id = z.id;
      if (seenZone.has(id)) id = `${id}-${uid().slice(0, 6)}`;
      seenZone.add(id);
      fixedZones.push({ ...z, id });
    }

    const zoneIdSet = new Set(fixedZones.map((z) => z.id));
    const allowedGrades: Set<string> = new Set(GRADES);

    const seenCard = new Set<string>();
    let warning: string | undefined;

    const fixedCards: CardItem[] = rawCards
      .filter((c) => isObj(c))
      .map((c) => {
        let id = String(c.id ?? "").trim();
        if (!id) id = uid();
        if (seenCard.has(id)) id = uid();
        seenCard.add(id);

        const name = String(c.name ?? "").trim();
        const grade = String(c.grade ?? "").trim();
        const zoneIdRaw = String(c.zoneId ?? "").trim();
        const creditsRaw = c.credits;

        const creditsNum =
          typeof creditsRaw === "number" ? creditsRaw : typeof creditsRaw === "string" ? parseFloat(creditsRaw) : NaN;

        if (!name) throw new Error("有 card 冇 name");
        if (!Number.isFinite(creditsNum) || creditsNum <= 0) throw new Error(`credits 唔啱：${name}`);
        if (!allowedGrades.has(grade)) throw new Error(`grade 唔支援：${grade}（${name}）`);

        const zoneId =
          zoneIdRaw === CARD_HOLDER_ZONE_ID ? CARD_HOLDER_ZONE_ID : zoneIdSet.has(zoneIdRaw) ? zoneIdRaw : CARD_HOLDER_ZONE_ID;
        const isMajorRequirement = Boolean(c.isMajorRequirement);
        const isDisabled = Boolean(c.isDisabled);

        return { id, name, credits: creditsNum, grade, zoneId, isMajorRequirement, isDisabled };
      });

    // holder 超出上限：多出部分塞去第一個 zone（如果有）
    const holder = fixedCards.filter((c) => c.zoneId === CARD_HOLDER_ZONE_ID);
    if (holder.length > MAX_CARDS_IN_HOLDER) {
      const firstZone = fixedZones[0]?.id ?? null;
      if (firstZone) {
        const keep = holder.slice(0, MAX_CARDS_IN_HOLDER).map((c) => c.id);
        const keepSet = new Set(keep);
        for (const c of fixedCards) {
          if (c.zoneId !== CARD_HOLDER_ZONE_ID) continue;
          if (keepSet.has(c.id)) continue;
          c.zoneId = firstZone;
        }
        warning = `Import 時 Card Holder 超過上限（${MAX_CARDS_IN_HOLDER}），多出部分已自動放入第一個 zone`;
      } else {
        warning = `Import 時 Card Holder 超過上限（${MAX_CARDS_IN_HOLDER}），建議你自行整理`;
      }
    }

    return { zones: fixedZones, cards: fixedCards, warning };
    },
    []
  );

  const doImport = useCallback(() => {
    setImportError(null);
    try {
      const parsed = parseImportText(importText);
      const { zones: z, cards: c, warning } = validateAndNormalizePayload(parsed);

      setZones(z);
      setCards(c);

      setIeOpen(false);
      setImportText("");
      setToast({ type: "ok", msg: warning ? "已 import（有自動調整）" : "已 import" });
      if (warning) window.setTimeout(() => setToast({ type: "danger", msg: warning }), 260);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import 失敗";
      setImportError(msg);
      setToast({ type: "danger", msg: "Import 失敗" });
    }
  }, [importText, validateAndNormalizePayload]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const { zones: z, cards: c } = validateAndNormalizePayload(parsed);
      setZones(z);
      setCards(c);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setToast({ type: "danger", msg: "Browser saved data is invalid, reset to default" });
    } finally {
      setHasLoadedStorage(true);
    }
  }, [validateAndNormalizePayload]);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exportPayload));
    } catch {
      setToast({ type: "danger", msg: "Browser save failed" });
    }
  }, [exportPayload, hasLoadedStorage]);

  const clearAll = useCallback(() => {
    setCards([]);
    setZones([]);
    setDraggingId(null);
    setToast({ type: "ok", msg: "已清空" });
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-2xl ring-1 ring-neutral-200 bg-white">
              <Image
                src="/one_punch_king.svg"
                alt="GPA icon"
                width={40}
                height={40}
                priority
                className="h-full w-full object-cover scale-250 transform"
              />
            </div>
            <div>
              <div className="text-base font-semibold leading-tight">GPA Calculator</div>
              <div className="text-xs text-neutral-500">Zones；Cards </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCardModal(true)}
              disabled={holderCount >= MAX_CARDS_IN_HOLDER}
              className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Card
            </button>

            <button
              onClick={() => setShowZoneModal(true)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              + Add Zone
            </button>

            <button
              onClick={() => {
                setIeTab("export");
                setImportError(null);
                setIeOpen(true);
              }}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Import / Export
            </button>

            <button
              onClick={clearAll}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] h-[calc(100dvh-64px)] overflow-hidden">
        {/* Left */}
        <section className="rounded-3xl border bg-white p-4 shadow-sm h-full overflow-hidden flex flex-col min-h-0 min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">Workspace</div>
              <Pill>{zones.length} zones</Pill>
              <Pill>{cards.length} cards</Pill>
              <Pill tone="ok">GPA eligible: {totalCredits} cr</Pill>
              <Pill tone="neutral">GPA: {totalCredits ? gpa.toFixed(3) : "N/A"}</Pill>
              <Pill tone="ok">Major GPA: {majorCredits ? majorGpa.toFixed(3) : "N/A"}</Pill>
            </div>

            <button
              onClick={() => copyToClipboard(exportText)}
              className="rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Copy Export
            </button>
          </div>

          {/* Working zones */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 flex-1 min-h-0 overflow-auto">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-neutral-600">Working Zones（最多顯示 {MAX_VISIBLE_ZONES} 個）</div>
              {zones.length > MAX_VISIBLE_ZONES && <Pill tone="danger">已超出顯示上限（其餘隱藏）</Pill>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {zones.slice(0, MAX_VISIBLE_ZONES).map((z) => {
                const zoneCards = cards.filter((c) => c.zoneId === z.id);

                let zoneCredits = 0;
                let zonePoints = 0;
                for (const c of zoneCards) {
                  if (c.isDisabled) continue;
                  const gp = GRADE_POINTS[c.grade];
                  if (typeof gp === "number") {
                    zoneCredits += c.credits;
                    zonePoints += gp * c.credits;
                  }
                }
                const zoneGpa = zoneCredits ? zonePoints / zoneCredits : 0;

                return (
                  <DropZone
                    key={z.id}
                    title={z.name}
                    subtitle={`Cr: ${zoneCredits} | GPA: ${zoneCredits ? zoneGpa.toFixed(3) : "N/A"}`}
                    onDragOver={allowDrop}
                    onDrop={makeDropHandler(z.id)}
                    isActive={zoneCards.length > 0}
                    onTitleDoubleClick={() => {
                      setEditingZone(z);
                      setEditZoneForm({ name: z.name });
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      {zoneCards.length === 0 && <div className="text-xs text-neutral-400">Drop cards here</div>}
                      {zoneCards.map((c) => (
                        <DraggableCard
                          key={c.id}
                          id={c.id}
                          onDragStart={(e) => handleDragStart(e, c.id)}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => {
                            setEditingCard(c);
                            setEditCardForm({
                              name: c.name,
                              credits: String(c.credits),
                              grade: c.grade,
                              isMajorRequirement: c.isMajorRequirement,
                              isDisabled: c.isDisabled,
                            });
                          }}
                          name={c.name}
                          credits={c.credits}
                          grade={c.grade}
                          isMajorRequirement={c.isMajorRequirement}
                          isDisabled={c.isDisabled}
                        />
                      ))}
                    </div>
                  </DropZone>
                );
              })}

              {zones.length === 0 && <div className="text-sm text-neutral-500">未有 zones。你可以按上面 Add Zone。</div>}
            </div>
          </div>

          {/* Card Holder */}
          <div
            onDragOver={allowDrop}
            onDrop={makeDropHandler(CARD_HOLDER_ZONE_ID)}
            className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-neutral-600">Card Holder（上限 {MAX_CARDS_IN_HOLDER}）</div>
              <Pill tone={holderCount >= MAX_CARDS_IN_HOLDER ? "danger" : "neutral"}>
                {holderCount}/{MAX_CARDS_IN_HOLDER}
              </Pill>
            </div>

            <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto pr-1">
              {cards
                .filter((c) => c.zoneId === CARD_HOLDER_ZONE_ID)
                .map((c) => (
                  <DraggableCard
                    key={c.id}
                    id={c.id}
                    onDragStart={(e) => handleDragStart(e, c.id)}
                    onDragEnd={handleDragEnd}
                    onDoubleClick={() => {
                      setEditingCard(c);
                      setEditCardForm({
                        name: c.name,
                        credits: String(c.credits),
                        grade: c.grade,
                        isMajorRequirement: c.isMajorRequirement,
                        isDisabled: c.isDisabled,
                      });
                    }}
                    name={c.name}
                    credits={c.credits}
                    grade={c.grade}
                    isMajorRequirement={c.isMajorRequirement}
                    isDisabled={c.isDisabled}
                  />
                ))}

              {holderCount === 0 && <div className="text-sm text-neutral-500">Holder 暫時無 card。按 Add Card 新增。</div>}
            </div>
          </div>
        </section>

        {/* Right: session summary */}
        <section className="rounded-3xl border bg-white p-4 shadow-sm h-full overflow-hidden flex flex-col min-h-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">GPA Session</div>
            <div className="flex items-center gap-2">
              <Pill tone="ok">{totalCredits} cr</Pill>
              <Pill tone="neutral">Sorted by Grade</Pill>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 overflow-hidden">
            {/* 固定高度，只做垂直滾動；橫向直接 hidden */}
            <div className="h-[360px] overflow-y-auto overflow-x-hidden">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur text-neutral-600">
                  <tr className="border-b border-neutral-200">
                    {/* 用百分比固定欄寬，迫佢一定 fit 右邊 panel */}
                    <th className="py-2 px-3 text-left font-semibold">Course</th>
                    <th className="py-2 px-3 text-left font-semibold">Cr</th>
                    <th className="py-2 px-3 text-left font-semibold">Grade</th>
                    <th className="py-2 px-3 text-left font-semibold">Pts</th>
                  </tr>
                </thead>

                <tbody>
                  {workingCards.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-2 text-[11px] text-neutral-500 text-center">
                        無課程計入 GPA。拖 cards 入 working zones。
                      </td>
                    </tr>
                  ) : (
                    sortedWorkingCards.map((c) => {
                      const gp = GRADE_POINTS[c.grade];
                      const pts = !c.isDisabled && typeof gp === "number" ? gp * c.credits : null;

                      return (
                        <tr
                          key={c.id}
                          className={[
                            "border-t border-neutral-200 hover:bg-white",
                            c.isDisabled ? "bg-neutral-100 text-neutral-400" : c.isMajorRequirement ? "bg-emerald-50/60" : "bg-sky-50/50",
                          ].join(" ")}
                        >
                          {/* Course 名只顯示一行，唔再顯示 ID（用 title 代替） */}
                          <td className="py-2 px-3">
                            <div className={["font-semibold break-all", c.isDisabled ? "text-neutral-500" : "text-neutral-800"].join(" ")}>{c.name}</div>
                          </td>

                          <td className={["py-2 px-3 whitespace-nowrap tabular-nums", c.isDisabled ? "text-neutral-500" : "text-neutral-700"].join(" ")}>
                            {c.credits}
                          </td>

                          <td className={["py-2 px-3 font-semibold whitespace-nowrap", c.isDisabled ? "text-neutral-500" : "text-neutral-800"].join(" ")}>
                            {c.grade}
                          </td>

                          <td className={["py-2 px-3 whitespace-nowrap tabular-nums", c.isDisabled ? "text-neutral-500" : "text-neutral-700"].join(" ")}>
                            {pts === null ? "-" : pts.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-neutral-200 bg-white px-3 py-2 text-[11px] font-semibold text-neutral-700">
              Credits: {totalCredits} | Grade Points: {totalGradePoints.toFixed(2)} | GPA: {totalCredits ? gpa.toFixed(3) : "N/A"}
            </div>
          </div>

          <details className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shrink-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-xs font-semibold text-neutral-600">Current Honor</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {currentHonorBand ? currentHonorBand.label : "Not reached yet"}
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${currentHonorBand?.chip ?? "bg-neutral-200 text-neutral-700"}`}>
                {currentHonorBand ? "Matched" : "View"}
              </span>
            </summary>

            <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="mb-3 text-[11px] leading-relaxed text-neutral-500">
                Major GPA and overall GPA both need to reach the threshold.
              </div>

              <div className="grid grid-cols-1 gap-2">
                {HONOR_BANDS.map((band) => {
                  const reached = currentHonorBand?.label === band.label;
                  return (
                    <div
                      key={band.label}
                      className={[
                        "rounded-2xl border p-3 ring-1",
                        band.tone,
                        band.ring,
                        reached ? "shadow-md" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold leading-tight">{band.label}</div>
                        {reached && <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold">Current</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
                        <span className="rounded-full bg-white/70 px-2.5 py-1">MCGA {band.minMcga.toFixed(3)}+</span>
                        <span className="rounded-full bg-white/70 px-2.5 py-1">CGA {band.minCga.toFixed(3)}+</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

          {/* Trend chart */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3 shrink-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-neutral-600">GPA Trend（TGA vs CGA）</div>
              <Pill tone="neutral">3 d.p.</Pill>
            </div>

            {termSeries.length === 0 ? (
              <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
                未有任何 term 計入 GPA（拖 cards 入 working zones 先會有走勢）。
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={termSeries} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="term" tickFormatter={(v) => `T${v}`} fontSize={11} />
                    <YAxis domain={[0, 4.3]} tickCount={6} fontSize={11} />
                    <Tooltip
                      labelFormatter={(label, payload) => {
                        const first = payload?.[0]?.payload;
                        const p = first as TermPoint | undefined;
                        return p ? `T${p.term} · ${p.label}` : String(label ?? "");
                      }}
                      formatter={(value: ValueType, name: NameType) => {
                        const v = typeof value === "number" ? value.toFixed(3) : "-";
                        const n = name === "tga" ? "TGA" : name === "cga" ? "CGA" : String(name);
                        return [v, n];
                      }}
                    />
                    <Legend formatter={(value) => (value === "tga" ? "TGA（Term GPA）" : "CGA（Cumulative GPA）")} />
                    <Line type="monotone" dataKey="tga" dot={false} strokeWidth={2} stroke="#111827" connectNulls={false} />
                    <Line type="monotone" dataKey="cga" dot={false} strokeWidth={2} stroke="#6B7280" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
              TGA：每個 term（zone）內嘅 GPA。CGA：累積到該 term 為止嘅總 GPA。
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-500 leading-relaxed">
            GPA = Σ(grade points × credits) / Σ(credits)（只計可評分科目；P/T 不計）。<br />
            Double-click card / zone 可 edit；拖入 Delete 區可刪除。
          </div>
        </section>
      </main>

      {/* Floating delete zone */}
      {draggingId && (
        <div
          onDragOver={allowDrop}
          onDrop={handleDeleteDrop}
          className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-red-50 px-6 py-4 text-red-700 shadow-lg ring-1 ring-red-200"
        >
          <div className="text-xs font-semibold uppercase tracking-wide">Delete Card</div>
          <div className="mt-1 text-xs">Drop here to permanently remove</div>
        </div>
      )}

      {/* Create Card modal */}
      <Modal open={showCardModal} title="Create Card" onClose={() => setShowCardModal(false)}>
        <form onSubmit={submitNewCard} className="space-y-3">
          <label className="block text-sm">
            <div className="mb-1 text-xs font-semibold text-neutral-600">Course Name</div>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="e.g. COMP2011"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <div className="mb-1 text-xs font-semibold text-neutral-600">Credits</div>
              <input
                value={form.credits}
                onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="number"
                min={1}
                step={1}
                required
              />
            </label>

            <label className="block text-sm">
              <div className="mb-1 text-xs font-semibold text-neutral-600">Grade</div>
              <select
                value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={form.isMajorRequirement}
              onChange={(e) => setForm((f) => ({ ...f, isMajorRequirement: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
            />
            <div>
              <div className="font-semibold text-neutral-800">Major requirement course</div>
              <div className="text-xs text-neutral-500">Include this course in Major GPA</div>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCardModal(false)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Zone modal */}
      <Modal open={showZoneModal} title="Add Zone" onClose={() => setShowZoneModal(false)}>
        <form onSubmit={submitNewZone} className="space-y-3">
          <label className="block text-sm">
            <div className="mb-1 text-xs font-semibold text-neutral-600">Zone Name</div>
            <input
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ name: e.target.value })}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="e.g. Year 2 Fall"
              required
              maxLength={24}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowZoneModal(false)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Card modal */}
      <Modal open={!!editingCard} title="Edit Card" onClose={() => setEditingCard(null)}>
        <form onSubmit={submitEditCard} className="space-y-3">
          <label className="block text-sm">
            <div className="mb-1 text-xs font-semibold text-neutral-600">Course Name</div>
            <input
              value={editCardForm.name}
              onChange={(e) => setEditCardForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <div className="mb-1 text-xs font-semibold text-neutral-600">Credits</div>
              <input
                value={editCardForm.credits}
                onChange={(e) => setEditCardForm((f) => ({ ...f, credits: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="number"
                min={1}
                step={1}
                required
              />
            </label>

            <label className="block text-sm">
              <div className="mb-1 text-xs font-semibold text-neutral-600">Grade</div>
              <select
                value={editCardForm.grade}
                onChange={(e) => setEditCardForm((f) => ({ ...f, grade: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={editCardForm.isMajorRequirement}
              onChange={(e) => setEditCardForm((f) => ({ ...f, isMajorRequirement: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
            />
            <div>
              <div className="font-semibold text-neutral-800">Major requirement course</div>
              <div className="text-xs text-neutral-500">Include this course in Major GPA</div>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={editCardForm.isDisabled}
              onChange={(e) => setEditCardForm((f) => ({ ...f, isDisabled: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
            />
            <div>
              <div className="font-semibold text-neutral-800">Disable in working zone</div>
              <div className="text-xs text-neutral-500">Keep the card visible, but exclude it from GPA, Major GPA and trend.</div>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingCard(null)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Zone modal */}
      <Modal open={!!editingZone} title="Edit Zone" onClose={() => setEditingZone(null)}>
        <form onSubmit={submitEditZone} className="space-y-3">
          <label className="block text-sm">
            <div className="mb-1 text-xs font-semibold text-neutral-600">Zone Name</div>
            <input
              value={editZoneForm.name}
              onChange={(e) => setEditZoneForm({ name: e.target.value })}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
              required
              maxLength={24}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingZone(null)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Import / Export modal */}
      <Modal
        open={ieOpen}
        title="Import / Export（copy & paste）"
        onClose={() => {
          setIeOpen(false);
          setImportError(null);
        }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIeTab("export");
                setImportError(null);
              }}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold ring-1",
                ieTab === "export" ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white ring-neutral-200 hover:bg-neutral-100",
              ].join(" ")}
            >
              Export
            </button>

            <button
              onClick={() => {
                setIeTab("import");
                setImportError(null);
              }}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold ring-1",
                ieTab === "import" ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white ring-neutral-200 hover:bg-neutral-100",
              ].join(" ")}
            >
              Import
            </button>

            <div className="ml-auto flex items-center gap-2">
              <Pill>schema: v1</Pill>
              <Pill tone="neutral">zones: {zones.length}</Pill>
              <Pill tone="neutral">cards: {cards.length}</Pill>
            </div>
          </div>

          {ieTab === "export" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-neutral-600">Export JSON</div>
                  <button
                    onClick={() => copyToClipboard(exportText)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
                  >
                    Copy
                  </button>
                </div>

                <textarea
                  readOnly
                  value={exportText}
                  className="h-[45vh] w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3 font-mono text-xs leading-5 outline-none"
                />
              </div>

              <div className="text-xs text-neutral-500">
                直接 copy 呢段 JSON，喺另一部機 / 另一個 browser 用 Import 貼返入去。
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-neutral-600">Paste JSON</div>
                  <Pill tone="ok">mode: replace</Pill>
                </div>

                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='貼入 export 出嚟嘅 JSON（可選 prefix：GPA1:{"schema":...}）'
                  className="h-[40vh] w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-neutral-900/10"
                />

                {importError && (
                  <div className="mt-3 rounded-2xl bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">
                    <div className="font-semibold">Import Error</div>
                    <div className="mt-1">{importError}</div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setImportText("");
                    setImportError(null);
                  }}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-100"
                >
                  Clear
                </button>

                <button
                  onClick={doImport}
                  className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                >
                  Import（Replace）
                </button>
              </div>

              <div className="text-xs text-neutral-500">
                Replace 會直接覆蓋你而家嘅 zones/cards。
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold shadow-lg ring-1",
              toast.type === "ok"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-red-50 text-red-700 ring-red-200",
            ].join(" ")}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  isActive: boolean;
  onTitleDoubleClick?: () => void;
}) {
  const { title, subtitle, children, onDragOver, onDrop, isActive, onTitleDoubleClick } = props;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        "relative rounded-2xl border bg-white p-3 shadow-sm ring-1 flex flex-col gap-2",
        isActive ? "border-neutral-900 ring-neutral-900/10" : "border-neutral-200 ring-black/5",
        "h-[320px]", // 永遠攤開，固定高度 + 內部滾動
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-xs font-semibold text-neutral-800 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onTitleDoubleClick?.();
            }}
            title="Double-click 改名"
          >
            {title}
          </div>
          {subtitle && <div className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</div>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">{children}</div>
    </div>
  );
}

function DraggableCard(props: {
  id: string;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDoubleClick?: () => void;
  name: string;
  credits: number;
  grade: string;
  isMajorRequirement: boolean;
  isDisabled: boolean;
}) {
  const { id, onDragStart, onDragEnd, onDoubleClick, name, credits, grade, isMajorRequirement, isDisabled } = props;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      data-id={id}
      className={[
        "select-none cursor-grab active:cursor-grabbing rounded-2xl border px-3 py-2 text-neutral-900",
        isDisabled
          ? "border-neutral-300 bg-neutral-100 opacity-60"
          : isMajorRequirement
            ? "border-emerald-200 bg-emerald-50"
            : "border-sky-200 bg-sky-50",
      ].join(" ")}
      aria-grabbed="true"
      title="Drag to move | Double-click to edit"
    >
      {/* 單行：Name -> Credits -> Grade */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 break-all text-[13px] font-semibold leading-5">
          {name}
        </div>

        <div className="shrink-0 text-[11px] font-semibold text-neutral-500 whitespace-nowrap">
          {credits} cr
        </div>

        <div
          className={[
            "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap",
            isDisabled ? "bg-neutral-400 text-white" : "bg-neutral-900 text-white",
          ].join(" ")}
        >
          {grade}
        </div>
      </div>
    </div>
  );
}
