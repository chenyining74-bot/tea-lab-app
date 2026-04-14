"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { recognize } from "tesseract.js";
import { motion } from "framer-motion";
import { Bot, CalendarCheck2, Check, Clapperboard, CupSoda, FileUp, Folder, FolderArchive, Gamepad2, ImagePlus, Inbox, MoonStar, Plus, SendHorizontal } from "lucide-react";
import { predictTeaImpact, type TeaEntry } from "@/lib/prediction/teaSleepModel";
import { LAB_SAFETY_RULES } from "@/lib/constants/labRules";

type ModuleId = string;
type ModuleMeta = {
  id: string;
  title: string;
  icon: string;
  description?: string;
  isCustom?: boolean;
};
type VitalsEntry = {
  id: string;
  wakeTime: string;
  sleepTime: string;
  createdAt: string;
};
type PeriodEntry = {
  id: string;
  startDate: string;
  durationDays: number;
  flowLevel: "轻" | "中" | "重";
  symptom: string;
};
type PlanScope = "day" | "week" | "month";
type PlanItem = {
  id: string;
  title: string;
  note: string;
  date: string;
  scope: PlanScope;
  timeSlot?: string;
  done: boolean;
};
type GoalItem = {
  id: string;
  title: string;
  targetDate: string;
  progress: number;
  done: boolean;
};
type ReminderItem = {
  id: string;
  text: string;
  remindAt: string;
  done: boolean;
};
type DietEntry = {
  id: string;
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};
type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  note: string;
  imageDataUrl?: string;
  price?: number;
  status: "pending" | "bought" | "sold" | "cancelled";
  createdAt: string;
};
type GameProgressEntry = {
  id: string;
  title: string;
  platform: string;
  progress: number;
  playHours: number;
  nextObjective: string;
  todos: { id: string; text: string; done: boolean }[];
  status: "playing" | "paused" | "abandoned" | "completed";
  updatedAt: string;
};
type MemoryRangeEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  note: string;
  mood: string;
  dateType: "single" | "range";
};
type HealthExperimentEntry = {
  id: string;
  batchId: string;
  createdAt: string;
  experimenter: string;
  experimentDate: string;
  purpose: string;
  principle: string;
  result: string;
  analysis: string;
  teaCalories: number;
  sugarLevel: number;
  sleepHours: number;
  mealCompleteness: number;
  focusScore: number;
  energyScore: number;
  note: string;
};
type KnowledgeFolder = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};
type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  imageDataUrl?: string;
  folderId: string | null;
  source: "archive" | "quick";
  createdAt: string;
  /** 矩阵「记忆档案馆」归档专用 */
  memoryMood?: string;
  memoryDateType?: "single" | "range";
  memoryStartDate?: string;
  memoryEndDate?: string;
};
type SafetyRule = {
  id: string;
  text: string;
};
type TemporaryLog = {
  id: string;
  title: string;
  content: string;
  imageDataUrl?: string;
  fileNames: string[];
  suggestedFolderId: string | null;
  createdAt: string;
};
type ArchiveMatrixApp = {
  id: string;
  moduleId: string;
  title: string;
  folderId: string | null;
  badgeCount: number;
};
type LabAccount = {
  id: string;
  username: string;
  password: string;
  profileName: string;
  profileNote: string;
  createdAt: string;
  lastLoginAt: string;
};

const sugarFactor = [0, 0.6, 0.68, 0.76, 0.84, 0.92, 1, 1.12, 1.24, 1.36, 1.48];

const builtinModules: ModuleMeta[] = [
  { id: "health" as const, title: "实验总览", icon: "🧠" },
  { id: "archive" as const, title: "文件夹归纳", icon: "🗂️" },
  { id: "quick-input" as const, title: "快速输入", icon: "✏️" },
  { id: "safety" as const, title: "安全守则", icon: "🛟" },
  { id: "gaming" as const, title: "游戏进度", icon: "🎮" },
  { id: "period" as const, title: "周期监测", icon: "🌙" },
  { id: "planner" as const, title: "计划系统", icon: "🗓️" },
  { id: "shopping" as const, title: "购物清单", icon: "🛒" },
  { id: "memory" as const, title: "记忆档案馆", icon: "🗂️" },
  { id: "reflection" as const, title: "读后感", icon: "📖" },
  { id: "essay" as const, title: "生命感悟", icon: "✍️" },
  { id: "store" as const, title: "模块工坊", icon: "🛍️" },
];

const defaultEnabled: Record<string, boolean> = {
  health: true,
  archive: true,
  "quick-input": true,
  safety: true,
  gaming: true,
  period: true,
  planner: true,
  shopping: true,
  memory: true,
  reflection: true,
  essay: true,
  store: true,
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const AUTH_ACCOUNTS_KEY = "tea-auth-accounts";
const AUTH_CURRENT_ACCOUNT_KEY = "tea-auth-current-account";
const AUTH_DATA_PREFIX = "tea-auth-data-";
let accountDataBootstrapped = false;

function readAccountsFromStorage() {
  if (typeof window === "undefined") {
    return [] as LabAccount[];
  }
  const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as LabAccount[]) : [];
}

function writeAccountsToStorage(accounts: LabAccount[]) {
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function collectLabDataSnapshot() {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("tea-lab-")) {
      continue;
    }
    const value = localStorage.getItem(key);
    if (value != null) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function clearLabDataSnapshot() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("tea-lab-")) {
      keys.push(key);
    }
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function applyLabDataSnapshot(snapshot: Record<string, string>) {
  clearLabDataSnapshot();
  Object.entries(snapshot).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
}

function bootstrapLabDataForCurrentAccount() {
  if (accountDataBootstrapped || typeof window === "undefined") {
    return;
  }
  accountDataBootstrapped = true;
  const currentId = localStorage.getItem(AUTH_CURRENT_ACCOUNT_KEY);
  if (!currentId) {
    return;
  }
  const raw = localStorage.getItem(`${AUTH_DATA_PREFIX}${currentId}`);
  if (!raw) {
    return;
  }
  try {
    applyLabDataSnapshot(JSON.parse(raw) as Record<string, string>);
  } catch {
    // Ignore malformed snapshots and keep existing local data.
  }
}

export default function Home() {
  bootstrapLabDataForCurrentAccount();
  const [accounts, setAccounts] = useState<LabAccount[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    return readAccountsFromStorage();
  });
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(AUTH_CURRENT_ACCOUNT_KEY);
  });
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerProfileName, setRegisterProfileName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return defaultEnabled;
    }
    const savedModules = localStorage.getItem("tea-lab-enabled-modules");
    return savedModules ? { ...defaultEnabled, ...JSON.parse(savedModules) } : defaultEnabled;
  });
  const [teaRecords, setTeaRecords] = useState<TeaEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedTea = localStorage.getItem("tea-lab-tea-records");
    return savedTea ? JSON.parse(savedTea) : [];
  });
  const [vitalRecords, setVitalRecords] = useState<VitalsEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedVitals = localStorage.getItem("tea-lab-vitals-records");
    return savedVitals ? JSON.parse(savedVitals) : [];
  });
  const [periodRecords, setPeriodRecords] = useState<PeriodEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedPeriods = localStorage.getItem("tea-lab-period-records");
    return savedPeriods ? JSON.parse(savedPeriods) : [];
  });
  const [planItems, setPlanItems] = useState<PlanItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedPlans = localStorage.getItem("tea-lab-plan-items");
    return savedPlans ? JSON.parse(savedPlans) : [];
  });
  const [goals, setGoals] = useState<GoalItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedGoals = localStorage.getItem("tea-lab-goals");
    return savedGoals ? JSON.parse(savedGoals) : [];
  });
  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedReminders = localStorage.getItem("tea-lab-reminders");
    return savedReminders ? JSON.parse(savedReminders) : [];
  });
  const [dietRecords, setDietRecords] = useState<DietEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const savedDiet = localStorage.getItem("tea-lab-diet-records");
    return savedDiet ? JSON.parse(savedDiet) : [];
  });
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-shopping-items");
    return saved ? JSON.parse(saved) : [];
  });
  const [gameEntries, setGameEntries] = useState<GameProgressEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-game-progress");
    return saved ? JSON.parse(saved) : [];
  });
  const [customModules, setCustomModules] = useState<ModuleMeta[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-custom-modules");
    return saved ? JSON.parse(saved) : [];
  });
  const [customModuleContents, setCustomModuleContents] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const saved = localStorage.getItem("tea-lab-custom-module-contents");
    return saved ? JSON.parse(saved) : {};
  });

  const [sugarLevel, setSugarLevel] = useState(5);
  const [cupSize, setCupSize] = useState<"S" | "M" | "L">("M");
  const [brand, setBrand] = useState("霸王茶姬");
  const [beverageName, setBeverageName] = useState("");
  const [iceLevel, setIceLevel] = useState("少冰");
  const [teaTime, setTeaTime] = useState(new Date().toTimeString().slice(0, 5));

  const [wakeTime, setWakeTime] = useState("07:30");
  const [sleepTime, setSleepTime] = useState("00:30");
  const [addTopping, setAddTopping] = useState(false);
  const [toppingChoice, setToppingChoice] = useState("无加料");
  const [readingReflection, setReadingReflection] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("tea-lab-reading-reflection") ?? "";
  });
  const [reflectionTitle, setReflectionTitle] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("tea-lab-reflection-title") ?? "";
  });
  const [reflectionCategory, setReflectionCategory] = useState(() => {
    if (typeof window === "undefined") {
      return "book";
    }
    return localStorage.getItem("tea-lab-reflection-category") ?? "book";
  });
  const [lifeEssay, setLifeEssay] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("tea-lab-life-essay") ?? "";
  });
  const [lifeEmotion, setLifeEmotion] = useState(() => {
    if (typeof window === "undefined") {
      return "neutral";
    }
    return localStorage.getItem("tea-lab-life-emotion") ?? "neutral";
  });
  const [dailySummary, setDailySummary] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("tea-lab-daily-summary") ?? "";
  });
  const [summaryPopupOpen, setSummaryPopupOpen] = useState(false);
  const [summaryPopupText, setSummaryPopupText] = useState("");
  const [moduleViewMode, setModuleViewMode] = useState<Record<string, "input" | "archive">>({});
  const [periodStartDate, setPeriodStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodEndDate, setPeriodEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [flowLevel, setFlowLevel] = useState<"轻" | "中" | "重">("中");
  const [periodSymptom, setPeriodSymptom] = useState("");
  const [plannerView, setPlannerView] = useState<PlanScope>("day");
  const [plannerDate, setPlannerDate] = useState(new Date().toISOString().slice(0, 10));
  const [planTitle, setPlanTitle] = useState("");
  const [planNote, setPlanNote] = useState("");
  const [planTimeSlot, setPlanTimeSlot] = useState("09:00");
  const [plannerLabTab, setPlannerLabTab] = useState<"day" | "week" | "month" | "year">("day");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDate, setGoalDate] = useState(new Date().toISOString().slice(0, 10));
  const [reminderText, setReminderText] = useState("");
  const [reminderAt, setReminderAt] = useState("21:00");
  const [dietDate, setDietDate] = useState(new Date().toISOString().slice(0, 10));
  const [breakfast, setBreakfast] = useState("");
  const [lunch, setLunch] = useState("");
  const [dinner, setDinner] = useState("");
  const [breakfastImage, setBreakfastImage] = useState("");
  const [lunchImage, setLunchImage] = useState("");
  const [dinnerImage, setDinnerImage] = useState("");
  const [healthDraftMessage, setHealthDraftMessage] = useState("");
  const [shoppingName, setShoppingName] = useState("");
  const [shoppingCategory, setShoppingCategory] = useState("数码");
  const [shoppingNote, setShoppingNote] = useState("");
  const [shoppingPrice, setShoppingPrice] = useState("");
  const [shoppingImageDataUrl, setShoppingImageDataUrl] = useState<string>("");
  const [shoppingStatusDraft, setShoppingStatusDraft] = useState<ShoppingItem["status"]>("pending");
  const [memoryDate, setMemoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memoryRangeEvents, setMemoryRangeEvents] = useState<MemoryRangeEvent[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-memory-range-events");
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved) as MemoryRangeEvent[];
    return parsed.map((e) => ({
      ...e,
      mood: e.mood ?? "平稳",
      dateType: e.dateType ?? "range",
    }));
  });
  const [memoryRangeTitle, setMemoryRangeTitle] = useState("");
  const [memoryRangeStartDate, setMemoryRangeStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [memoryRangeEndDate, setMemoryRangeEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [memoryRangeNote, setMemoryRangeNote] = useState("");
  const [memoryRangeMood, setMemoryRangeMood] = useState("平稳");
  const [memoryRangeDateType, setMemoryRangeDateType] = useState<MemoryRangeEvent["dateType"]>("range");
  const [memoryMoodByDate, setMemoryMoodByDate] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const saved = localStorage.getItem("tea-lab-memory-mood-by-date");
    return saved ? JSON.parse(saved) : {};
  });
  const [memoryWeatherByDate, setMemoryWeatherByDate] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const saved = localStorage.getItem("tea-lab-memory-weather-by-date");
    return saved ? JSON.parse(saved) : {};
  });
  const [memoryLocationByDate, setMemoryLocationByDate] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const saved = localStorage.getItem("tea-lab-memory-location-by-date");
    return saved ? JSON.parse(saved) : {};
  });
  const [teaScanLoading, setTeaScanLoading] = useState(false);
  const [dietScanLoading, setDietScanLoading] = useState(false);
  const [teaScanPreview, setTeaScanPreview] = useState("");
  const [dietScanPreview, setDietScanPreview] = useState("");
  const [teaNaturalText, setTeaNaturalText] = useState("");
  const [teaAnalysisMessage, setTeaAnalysisMessage] = useState("");
  const [customModuleTitle, setCustomModuleTitle] = useState("");
  const [customModuleIcon, setCustomModuleIcon] = useState("🧩");
  const [customModuleDescription, setCustomModuleDescription] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [gamePlatform, setGamePlatform] = useState("PC");
  const [gameProgress, setGameProgress] = useState(20);
  const [gamePlayHours, setGamePlayHours] = useState(1);
  const [gameNextObjective, setGameNextObjective] = useState("");
  const [gameStatus, setGameStatus] = useState<GameProgressEntry["status"]>("playing");
  const [gameTodoInput, setGameTodoInput] = useState("");
  const [gameDraftTodos, setGameDraftTodos] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [focusScore, setFocusScore] = useState(6);
  const [energyScore, setEnergyScore] = useState(6);
  const [experimentNote, setExperimentNote] = useState("");
  const [experimenter, setExperimenter] = useState("实验员A");
  const [experimentDate, setExperimentDate] = useState(new Date().toISOString().slice(0, 10));
  const [experimentPurpose, setExperimentPurpose] = useState("");
  const [experimentPrinciple, setExperimentPrinciple] = useState("");
  const [experimentResult, setExperimentResult] = useState("");
  const [experimentAnalysis, setExperimentAnalysis] = useState("");
  const [experimentEntries, setExperimentEntries] = useState<HealthExperimentEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-health-experiments");
    return saved ? JSON.parse(saved) : [];
  });
  const [knowledgeFolders, setKnowledgeFolders] = useState<KnowledgeFolder[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-knowledge-folders");
    return saved ? JSON.parse(saved) : [];
  });
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-knowledge-entries");
    return saved ? JSON.parse(saved) : [];
  });
  const [safetyRules, setSafetyRules] = useState<SafetyRule[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("tea-lab-safety-rules");
    return saved
      ? JSON.parse(saved)
      : LAB_SAFETY_RULES.map((rule) => ({ id: rule.id, text: `${rule.title}：${rule.detail}` }));
  });
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderDescInput, setFolderDescInput] = useState("");
  const [archiveTitle, setArchiveTitle] = useState("");
  const [archiveContent, setArchiveContent] = useState("");
  const [archiveImage, setArchiveImage] = useState("");
  const [archiveMemoryMood, setArchiveMemoryMood] = useState("平稳");
  const [archiveMemoryDateType, setArchiveMemoryDateType] = useState<"single" | "range">("range");
  const [archiveMemoryStartDate, setArchiveMemoryStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [archiveMemoryEndDate, setArchiveMemoryEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualFolderId, setManualFolderId] = useState("auto");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickContent, setQuickContent] = useState("");
  const [quickImage, setQuickImage] = useState("");
  const [safetyInput, setSafetyInput] = useState("");
  const [safetyRuleDraft, setSafetyRuleDraft] = useState("");
  const [startupRule, setStartupRule] = useState("实验开始前，请先做一次深呼吸。");
  const [showStartupSplash, setShowStartupSplash] = useState(true);
  const [pagerTab, setPagerTab] = useState<"dashboard" | "input" | "archive">("input");
  const [universalTitle, setUniversalTitle] = useState("");
  const [universalContent, setUniversalContent] = useState("");
  const [universalImage, setUniversalImage] = useState("");
  const [universalFiles, setUniversalFiles] = useState<string[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [loggerFolderId, setLoggerFolderId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "auto";
    }
    return localStorage.getItem("tea-lab-logger-folder-id") || "auto";
  });
  const [pendingLog, setPendingLog] = useState<TemporaryLog | null>(null);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);
  const [selectorFolderId, setSelectorFolderId] = useState("auto");
  const [activeArchiveAppId, setActiveArchiveAppId] = useState<string | null>(null);
  const [archiveWorkshopOpen, setArchiveWorkshopOpen] = useState(false);
  const [matrixActionAppId, setMatrixActionAppId] = useState<string | null>(null);
  const [timelineEntryId, setTimelineEntryId] = useState<string | null>(null);
  const [timelineAppendText, setTimelineAppendText] = useState("");
  const [archiveSpotlight, setArchiveSpotlight] = useState("");
  const [activeArchiveMonth, setActiveArchiveMonth] = useState("all");
  const [dramaRating, setDramaRating] = useState(8);
  const [dramaTag, setDramaTag] = useState("");
  const [dramaType, setDramaType] = useState("影视");
  const [dramaAuthor, setDramaAuthor] = useState("");
  const [safetyTipIndex, setSafetyTipIndex] = useState(0);
  const universalImageInputRef = useRef<HTMLInputElement>(null);
  const universalFileInputRef = useRef<HTMLInputElement>(null);
  const matrixPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matrixLongPressedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("tea-lab-enabled-modules", JSON.stringify(enabledModules));
  }, [enabledModules]);

  useEffect(() => {
    localStorage.setItem("tea-lab-tea-records", JSON.stringify(teaRecords));
  }, [teaRecords]);

  useEffect(() => {
    localStorage.setItem("tea-lab-vitals-records", JSON.stringify(vitalRecords));
  }, [vitalRecords]);

  useEffect(() => {
    localStorage.setItem("tea-lab-period-records", JSON.stringify(periodRecords));
  }, [periodRecords]);

  useEffect(() => {
    localStorage.setItem("tea-lab-plan-items", JSON.stringify(planItems));
  }, [planItems]);

  useEffect(() => {
    localStorage.setItem("tea-lab-goals", JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem("tea-lab-reminders", JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem("tea-lab-diet-records", JSON.stringify(dietRecords));
  }, [dietRecords]);

  useEffect(() => {
    localStorage.setItem("tea-lab-shopping-items", JSON.stringify(shoppingItems));
  }, [shoppingItems]);

  useEffect(() => {
    localStorage.setItem("tea-lab-game-progress", JSON.stringify(gameEntries));
  }, [gameEntries]);
  useEffect(() => {
    localStorage.setItem("tea-lab-custom-modules", JSON.stringify(customModules));
  }, [customModules]);
  useEffect(() => {
    localStorage.setItem("tea-lab-custom-module-contents", JSON.stringify(customModuleContents));
  }, [customModuleContents]);
  useEffect(() => {
    setKnowledgeFolders((prev) => {
      const existing = new Set(prev.map((folder) => folder.name));
      const modulesForFolderSync = [...builtinModules, ...customModules];
      const additions = modulesForFolderSync
        .filter((module) => module.id !== "store" && module.id !== "archive")
        .filter((module) => !existing.has(module.title))
        .map((module) => ({
          id: uid(),
          name: module.title,
          description: module.description || "",
          createdAt: new Date().toISOString(),
        }));
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
  }, [customModules]);

  useEffect(() => {
    localStorage.setItem("tea-lab-health-experiments", JSON.stringify(experimentEntries));
  }, [experimentEntries]);
  useEffect(() => {
    localStorage.setItem("tea-lab-knowledge-folders", JSON.stringify(knowledgeFolders));
  }, [knowledgeFolders]);
  useEffect(() => {
    localStorage.setItem("tea-lab-knowledge-entries", JSON.stringify(knowledgeEntries));
  }, [knowledgeEntries]);
  useEffect(() => {
    localStorage.setItem("tea-lab-safety-rules", JSON.stringify(safetyRules));
  }, [safetyRules]);

  useEffect(() => {
    localStorage.setItem("tea-lab-reading-reflection", readingReflection);
  }, [readingReflection]);

  useEffect(() => {
    localStorage.setItem("tea-lab-reflection-title", reflectionTitle);
  }, [reflectionTitle]);

  useEffect(() => {
    localStorage.setItem("tea-lab-reflection-category", reflectionCategory);
  }, [reflectionCategory]);

  useEffect(() => {
    localStorage.setItem("tea-lab-life-essay", lifeEssay);
  }, [lifeEssay]);

  useEffect(() => {
    localStorage.setItem("tea-lab-life-emotion", lifeEmotion);
  }, [lifeEmotion]);

  useEffect(() => {
    localStorage.setItem("tea-lab-daily-summary", dailySummary);
  }, [dailySummary]);
  useEffect(() => {
    localStorage.setItem("tea-lab-memory-mood-by-date", JSON.stringify(memoryMoodByDate));
  }, [memoryMoodByDate]);
  useEffect(() => {
    localStorage.setItem("tea-lab-memory-weather-by-date", JSON.stringify(memoryWeatherByDate));
  }, [memoryWeatherByDate]);
  useEffect(() => {
    localStorage.setItem("tea-lab-memory-location-by-date", JSON.stringify(memoryLocationByDate));
  }, [memoryLocationByDate]);
  useEffect(() => {
    localStorage.setItem("tea-lab-memory-range-events", JSON.stringify(memoryRangeEvents));
  }, [memoryRangeEvents]);
  useEffect(() => {
    const rolloverKey = "tea-lab-plan-rollover-date";
    const currentDateKey = new Date().toISOString().slice(0, 10);
    const doneDate = localStorage.getItem(rolloverKey);
    if (doneDate === currentDateKey) {
      return;
    }
    setPlanItems((prev) =>
      prev.map((item) => {
        if (item.done || item.date >= currentDateKey) {
          return item;
        }
        const retryMark = item.note.includes("重试变量") ? item.note : `${item.note ? `${item.note} ` : ""}[重试变量]`;
        return { ...item, date: currentDateKey, note: retryMark.trim() };
      }),
    );
    localStorage.setItem(rolloverKey, currentDateKey);
  }, []);
  useEffect(() => {
    localStorage.setItem("tea-lab-logger-folder-id", loggerFolderId);
  }, [loggerFolderId]);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowStartupSplash(false), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  const prediction = useMemo(() => predictTeaImpact(teaRecords), [teaRecords]);
  const estimatedCalories = useMemo(() => {
    return estimateTeaCalories({
      cupSize,
      sugarLevel,
      addTopping,
      iceLevel,
    });
  }, [cupSize, sugarLevel, addTopping, iceLevel]);
  const breakfastCalories = useMemo(() => estimateMealCalories(breakfast), [breakfast]);
  const lunchCalories = useMemo(() => estimateMealCalories(lunch), [lunch]);
  const dinnerCalories = useMemo(() => estimateMealCalories(dinner), [dinner]);
  const dailyMealCalories = breakfastCalories + lunchCalories + dinnerCalories;
  const periodDurationDays = useMemo(() => calcDaySpan(periodStartDate, periodEndDate), [periodStartDate, periodEndDate]);
  const sleepHoursDelta = useMemo(() => calcSleepHours(wakeTime, sleepTime), [wakeTime, sleepTime]);
  const effectiveSleepHours = useMemo(
    () => Math.max(0, Math.round((sleepHoursDelta - prediction.predictedDelayMinutes / 60) * 10) / 10),
    [sleepHoursDelta, prediction.predictedDelayMinutes],
  );
  const periodInsight = useMemo(() => buildPeriodInsight(periodRecords), [periodRecords]);
  const lifeOptimizationTips = useMemo(() => {
    return buildLifeOptimizationTips({
      teaRecords,
      vitalRecords,
      periodInsight,
      predictionDelay: prediction.predictedDelayMinutes,
    });
  }, [teaRecords, vitalRecords, periodInsight, prediction.predictedDelayMinutes]);
  const plannerItemsForView = useMemo(() => {
    return filterPlansByView(planItems, plannerDate, plannerView);
  }, [planItems, plannerDate, plannerView]);
  const monthMatrix = useMemo(() => {
    return buildMonthMatrix(plannerDate);
  }, [plannerDate]);
  const memoryMonthMatrix = useMemo(() => {
    return buildMonthMatrix(memoryDate);
  }, [memoryDate]);
  const todayReminders = useMemo(() => {
    return [...reminders].filter((item) => !item.done).sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  }, [reminders]);
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const safetyTipPool = useMemo(() => {
    const merged = [
      ...LAB_SAFETY_RULES.map((rule) => `${rule.title}：${rule.detail}`),
      ...safetyRules.map((rule) => rule.text),
    ];
    return Array.from(new Set(merged.filter(Boolean)));
  }, [safetyRules]);
  const dailySafetyTip = safetyTipPool[safetyTipIndex] ?? "保持专注，安全第一。";
  const todayPlanItems = useMemo(() => planItems.filter((item) => item.date === todayDateKey), [planItems, todayDateKey]);
  const todayProtocolItems = useMemo(() => {
    return [...todayPlanItems]
      .sort((a, b) => {
        if (a.done !== b.done) {
          return Number(a.done) - Number(b.done);
        }
        return (a.timeSlot ?? "99:99").localeCompare(b.timeSlot ?? "99:99");
      })
      .slice(0, 5);
  }, [todayPlanItems]);
  const todayPlanCompletion = useMemo(() => {
    if (todayPlanItems.length === 0) {
      return 0;
    }
    return todayPlanItems.filter((item) => item.done).length / todayPlanItems.length;
  }, [todayPlanItems]);
  const entropyScore = useMemo(() => {
    const latestWake = vitalRecords[0]?.wakeTime ?? "08:30";
    const wakeMins = toMinutes(latestWake);
    const wakePenalty = wakeMins <= 8 * 60 ? 8 : 25;
    const planPenalty = Math.round((1 - todayPlanCompletion) * 35);
    const latestDiet = dietRecords.find((item) => item.date === todayDateKey);
    const filledMeals = [latestDiet?.breakfast, latestDiet?.lunch, latestDiet?.dinner].filter(Boolean).length;
    const dietPenalty = (3 - filledMeals) * 8;
    const reminderPenalty = Math.min(25, todayReminders.length * 5);
    return Math.min(100, wakePenalty + planPenalty + dietPenalty + reminderPenalty);
  }, [vitalRecords, todayPlanCompletion, dietRecords, todayDateKey, todayReminders.length]);
  const longTermGoals = useMemo(() => {
    return goals
      .filter((item) => !item.done)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
      .slice(0, 3)
      .map((goal) => {
        const today = new Date(todayDateKey).getTime();
        const target = new Date(goal.targetDate).getTime();
        const daysLeft = Math.max(0, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));
        return { ...goal, daysLeft };
      });
  }, [goals, todayDateKey]);
  const hasUrgentLongTermGoal = useMemo(() => longTermGoals.some((goal) => goal.daysLeft <= 7), [longTermGoals]);
  const backgroundStyle = useMemo(() => {
    if (hasUrgentLongTermGoal) {
      return { background: "linear-gradient(145deg, #d4d8ee 0%, #c5cbe2 55%, #b4bfd8 100%)" };
    }
    if (entropyScore < 35) {
      return { background: "linear-gradient(145deg, #d6e1ea 0%, #c3d0dc 55%, #b3c2d1 100%)" };
    }
    if (entropyScore < 65) {
      return { background: "linear-gradient(145deg, #c9d5df 0%, #b7c6d2 55%, #a8b9c7 100%)" };
    }
    return { background: "linear-gradient(145deg, #becad4 0%, #afbdca 55%, #9fb0bf 100%)" };
  }, [entropyScore, hasUrgentLongTermGoal]);
  useEffect(() => {
    if (safetyTipPool.length === 0) {
      return;
    }
    const seed = todayDateKey.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    setSafetyTipIndex(seed % safetyTipPool.length);
  }, [todayDateKey, safetyTipPool.length]);
  useEffect(() => {
    if (!showStartupSplash || safetyTipPool.length === 0) {
      return;
    }
    const randomIndex = Math.floor(Math.random() * safetyTipPool.length);
    setStartupRule(safetyTipPool[randomIndex] ?? "实验开始前，请先做一次深呼吸。");
  }, [showStartupSplash, safetyTipPool]);
  useEffect(() => {
    setArchiveSpotlight("");
    setActiveArchiveMonth("all");
    setTimelineEntryId(null);
  }, [activeArchiveAppId]);
  useEffect(() => {
    const shouldLockScroll = Boolean(activeArchiveAppId || activeModule || folderSelectorOpen || matrixActionAppId || summaryPopupOpen);
    if (!shouldLockScroll) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeArchiveAppId, activeModule, folderSelectorOpen, matrixActionAppId, summaryPopupOpen]);
  const yearOverview = useMemo(() => {
    return buildYearOverview({
      teaRecords,
      vitalRecords,
      dietRecords,
      periodRecords,
      planItems,
      shoppingItems,
      goals,
      reminders,
    });
  }, [teaRecords, vitalRecords, dietRecords, periodRecords, planItems, shoppingItems, goals, reminders]);
  const memoryDayData = useMemo(() => {
    return buildMemoryDayData(memoryDate, {
      teaRecords,
      vitalRecords,
      dietRecords,
      periodRecords,
      planItems,
      shoppingItems,
    });
  }, [memoryDate, teaRecords, vitalRecords, dietRecords, periodRecords, planItems, shoppingItems]);
  const memoryDigestByDate = useMemo(
    () =>
      buildMemoryDigestByDate({
        teaRecords,
        vitalRecords,
        dietRecords,
        periodRecords,
        planItems,
        shoppingItems,
      }),
    [teaRecords, vitalRecords, dietRecords, periodRecords, planItems, shoppingItems],
  );
  const memoryDayRecords = useMemo(() => {
    return {
      tea: teaRecords.filter((item) => toDateKey(item.teaTimestamp) === memoryDate),
      vitals: vitalRecords.filter((item) => toDateKey(item.createdAt) === memoryDate),
      diet: dietRecords.filter((item) => toDateKey(item.date) === memoryDate),
      period: periodRecords.filter((item) => toDateKey(item.startDate) === memoryDate),
      plan: planItems.filter((item) => toDateKey(item.date) === memoryDate),
      shopping: shoppingItems.filter((item) => toDateKey(item.createdAt) === memoryDate),
    };
  }, [memoryDate, teaRecords, vitalRecords, dietRecords, periodRecords, planItems, shoppingItems]);
  const activeMemoryRangeEvents = useMemo(() => {
    return memoryRangeEvents.filter((item) => memoryDate >= item.startDate && memoryDate <= item.endDate);
  }, [memoryRangeEvents, memoryDate]);
  const dailyLabBriefing = useMemo(() => {
    const todayTea = teaRecords.filter((item) => toDateKey(item.teaTimestamp) === todayDateKey);
    const todayCalories = todayTea.reduce((sum, item) => sum + (item.calories ?? 0), 0);
    const latestDiet = dietRecords.find((item) => item.date === todayDateKey);
    const mealCount = [latestDiet?.breakfast, latestDiet?.lunch, latestDiet?.dinner].filter(Boolean).length;
    const pmsHint = periodInsight.isPms ? "经前期建议降低学习强度，优先冥想 15 分钟。" : "今日可按常规节奏推进学习。";
    return `今日摄入约 ${todayCalories} kcal，三餐记录 ${mealCount}/3，计划任务 ${todayPlanItems.length} 项（完成率 ${Math.round(
      todayPlanCompletion * 100,
    )}%），建议强度：${periodInsight.studyIntensityLabel}。${pmsHint}`;
  }, [teaRecords, todayDateKey, dietRecords, todayPlanItems.length, todayPlanCompletion, periodInsight]);
  const dynamicTeaReminder = useMemo(() => {
    const todayTea = teaRecords.filter((item) => toDateKey(item.teaTimestamp) === todayDateKey);
    const avgSugar = todayTea.length > 0 ? todayTea.reduce((sum, item) => sum + item.sugarLevel, 0) / todayTea.length : 0;
    const tips = [
      "今日建议：奶茶后补一杯温水，减少口渴和口腔负担。",
      "今日建议：下午三点后可切换低糖或小杯，晚间更稳。",
      "今日建议：如果今晚要早睡，尽量把含咖啡因饮料提前到午后前段。",
      "今日建议：搭配蛋白质或主食，能减少血糖波动带来的疲惫感。",
    ];
    if (todayTea.length === 0) {
      return "今日建议：还没有奶茶记录，先记录再给你更精准提醒。";
    }
    if (avgSugar >= 7) {
      return "今日建议：糖度偏高，下一杯可降到五分糖以下。";
    }
    return tips[new Date().getDate() % tips.length];
  }, [teaRecords, todayDateKey]);
  const experimentKpis = useMemo(() => {
    const latest = experimentEntries.slice(0, 7);
    if (latest.length === 0) {
      return { avgFocus: 0, avgEnergy: 0, avgSleep: 0 };
    }
    return {
      avgFocus: Math.round((latest.reduce((sum, item) => sum + item.focusScore, 0) / latest.length) * 10) / 10,
      avgEnergy: Math.round((latest.reduce((sum, item) => sum + item.energyScore, 0) / latest.length) * 10) / 10,
      avgSleep: Math.round((latest.reduce((sum, item) => sum + item.sleepHours, 0) / latest.length) * 10) / 10,
    };
  }, [experimentEntries]);
  const allModules = useMemo(() => [...builtinModules, ...customModules], [customModules]);
  const filteredKnowledgeEntries = useMemo(() => {
    return knowledgeEntries.filter((item) => {
      const inFolder = selectedFolderId === "all" ? true : item.folderId === selectedFolderId;
      const keyword = knowledgeSearch.trim().toLowerCase();
      const hit =
        keyword.length === 0
          ? true
          : `${item.title} ${item.content}`.toLowerCase().includes(keyword) ||
            knowledgeFolders.find((f) => f.id === item.folderId)?.name.toLowerCase().includes(keyword);
      return inFolder && hit;
    });
  }, [knowledgeEntries, selectedFolderId, knowledgeSearch, knowledgeFolders]);
  const archiveMatrixApps = useMemo<ArchiveMatrixApp[]>(() => {
    const moduleApps = allModules
      .filter((module) => !["store", "archive", "safety", "quick-input"].includes(module.id))
      .map((module) => {
        const folder = knowledgeFolders.find((x) => x.name === module.title);
        return {
          id: `module-${module.id}`,
          moduleId: module.id,
          title: module.title,
          folderId: folder?.id ?? null,
          badgeCount: folder ? knowledgeEntries.filter((entry) => entry.folderId === folder.id).length : 0,
        };
      });
    const mappedFolderNames = new Set(allModules.map((module) => module.title));
    const folderApps = knowledgeFolders
      .filter((folder) => !mappedFolderNames.has(folder.name))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .map((folder) => ({
        id: `folder-${folder.id}`,
        moduleId: `folder-${folder.id}`,
        title: folder.name,
        folderId: folder.id,
        badgeCount: knowledgeEntries.filter((entry) => entry.folderId === folder.id).length,
      }));
    return [...moduleApps, ...folderApps];
  }, [allModules, knowledgeFolders, knowledgeEntries]);
  const activeArchiveApp = useMemo(
    () => archiveMatrixApps.find((item) => item.id === activeArchiveAppId) ?? null,
    [archiveMatrixApps, activeArchiveAppId],
  );
  const matrixActionApp = useMemo(
    () => archiveMatrixApps.find((item) => item.id === matrixActionAppId) ?? null,
    [archiveMatrixApps, matrixActionAppId],
  );
  const activeArchiveTimeline = useMemo(() => {
    if (!activeArchiveAppId) {
      return [] as KnowledgeEntry[];
    }
    if (activeArchiveApp?.moduleId === "health") {
      return teaRecords.map((item) => ({
        id: item.id,
        title: `${item.brand || "奶茶"}${item.beverageName ? ` ${item.beverageName}` : ""} ${item.cupSize}杯 ${item.iceLevel}`,
        content: `糖度 ${item.sugarLevel}/10 ｜ 热量 ${item.calories ?? 0}kcal ｜ ${new Date(item.teaTimestamp).toLocaleString()}`,
        folderId: activeArchiveApp?.folderId ?? null,
        source: "archive" as const,
        createdAt: item.teaTimestamp,
      }));
    }
    if (activeArchiveApp?.moduleId === "period") {
      return periodRecords.map((item) => ({
        id: item.id,
        title: `周期记录 ${item.startDate}`,
        content: `持续 ${item.durationDays} 天 ｜ 流量 ${item.flowLevel} ｜ ${item.symptom || "无备注"}`,
        folderId: activeArchiveApp?.folderId ?? null,
        source: "archive" as const,
        createdAt: item.startDate,
      }));
    }
    if (activeArchiveApp?.moduleId === "planner") {
      return planItems.map((item) => ({
        id: item.id,
        title: item.title,
        content: `${item.date} ${item.timeSlot ?? ""} ｜ ${item.scope} ｜ ${item.done ? "已完成" : "待完成"} ｜ ${item.note || "无备注"}`.trim(),
        folderId: activeArchiveApp?.folderId ?? null,
        source: "archive" as const,
        createdAt: item.date,
      }));
    }
    if (activeArchiveApp?.moduleId === "gaming") {
      return gameEntries.map((item) => ({
        id: item.id,
        title: item.title,
        content: `${item.platform} ｜ 进度 ${item.progress}% ｜ ${
          item.status === "playing" ? "进行中" : item.status === "paused" ? "暂停" : item.status === "abandoned" ? "放弃" : "通关"
        } ｜ 下一步 ${item.nextObjective || "-"}`,
        folderId: activeArchiveApp?.folderId ?? null,
        source: "archive" as const,
        createdAt: item.updatedAt,
      }));
    }
    if (activeArchiveApp?.moduleId === "shopping") {
      return shoppingItems.map((item) => ({
        id: item.id,
        title: item.name,
        content: `${item.category || "其他"} ｜ ${item.status} ｜ ${typeof item.price === "number" ? `￥${item.price}` : "未填价格"} ｜ ${item.note || "无备注"}`,
        imageDataUrl: item.imageDataUrl,
        folderId: activeArchiveApp?.folderId ?? null,
        source: "archive" as const,
        createdAt: item.createdAt,
      }));
    }
    if (activeArchiveApp?.moduleId === "reflection") {
      const dramaFolderIds = new Set(
        knowledgeFolders
          .filter((folder) => ["短剧", "影视", "读后感"].some((k) => folder.name.includes(k)))
          .map((item) => item.id),
      );
      return knowledgeEntries.filter((entry) => entry.folderId && dramaFolderIds.has(entry.folderId));
    }
    if (!activeArchiveApp?.folderId) {
      return [];
    }
    return knowledgeEntries.filter((item) => item.folderId === activeArchiveApp.folderId);
  }, [activeArchiveAppId, activeArchiveApp, knowledgeEntries, knowledgeFolders, teaRecords, periodRecords, planItems, gameEntries, shoppingItems]);
  const archiveTimelineByMonth = useMemo(() => {
    const keyword = archiveSpotlight.trim().toLowerCase();
    const filtered = activeArchiveTimeline.filter((item) => {
      if (!keyword) {
        return true;
      }
      return `${item.title} ${item.content}`.toLowerCase().includes(keyword);
    });
    const monthFiltered =
      activeArchiveMonth === "all"
        ? filtered
        : filtered.filter((item) => new Date(item.createdAt).toISOString().slice(0, 7) === activeArchiveMonth);
    const groups = monthFiltered.reduce<Record<string, KnowledgeEntry[]>>((acc, item) => {
      const monthKey = new Date(item.createdAt).toISOString().slice(0, 7);
      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(item);
      return acc;
    }, {});
    const monthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    monthKeys.forEach((k) => {
      groups[k] = groups[k].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    });
    return { groups, monthKeys };
  }, [activeArchiveTimeline, archiveSpotlight, activeArchiveMonth]);
  function renderArchiveAppIcon(moduleId: string) {
    const baseClass = "text-slate-700";
    if (moduleId === "health") return <CupSoda size={18} strokeWidth={1.5} className={baseClass} />;
    if (moduleId === "reflection") return <Clapperboard size={18} strokeWidth={1.5} className={baseClass} />;
    if (moduleId === "period") return <MoonStar size={18} strokeWidth={1.5} className={baseClass} />;
    if (moduleId === "planner") return <CalendarCheck2 size={18} strokeWidth={1.5} className={baseClass} />;
    if (moduleId === "gaming") return <Gamepad2 size={18} strokeWidth={1.5} className={baseClass} />;
    return <FolderArchive size={18} strokeWidth={1.5} className={baseClass} />;
  }
  const safetySuggestions = useMemo(() => {
    if (!safetyInput.includes("@")) {
      return [];
    }
    return safetyRules.slice(0, 6);
  }, [safetyInput, safetyRules]);

  const dualModeModules = useMemo(
    () => new Set(["health", "gaming", "period", "planner", "shopping", "quick-input", "reflection", "essay", "safety"]),
    [],
  );
  const currentModuleMode = activeModule ? moduleViewMode[activeModule] ?? "input" : "input";

  function addTeaRecord() {
    const teaTimestamp = new Date(`${new Date().toISOString().slice(0, 10)}T${teaTime}:00`).toISOString();
    const newRecord: TeaEntry = {
      id: uid(),
      teaTimestamp,
      sugarLevel,
      cupSize,
      brand,
      beverageName: beverageName.trim() || undefined,
      iceLevel,
      calories: estimatedCalories,
      caffeineIntensity: estimateCaffeineIntensity({ cupSize, teaTimestamp }),
    };
    setTeaRecords((prev) => [newRecord, ...prev].slice(0, 30));
  }

  function addVitalRecord() {
    const newRecord: VitalsEntry = {
      id: uid(),
      wakeTime,
      sleepTime,
      createdAt: new Date().toISOString(),
    };
    setVitalRecords((prev) => [newRecord, ...prev].slice(0, 30));
  }

  function addPeriodRecord() {
    const newRecord: PeriodEntry = {
      id: uid(),
      startDate: periodStartDate,
      durationDays: periodDurationDays,
      flowLevel,
      symptom: periodSymptom,
    };
    setPeriodRecords((prev) => [newRecord, ...prev].slice(0, 24));
    setSaveNotice("保存完成：周期记录已添加");
  }

  function addPlanItem(options?: { scope?: PlanScope; date?: string; timeSlot?: string }) {
    if (!planTitle.trim()) {
      return;
    }
    const scope = options?.scope ?? plannerView;
    const date = options?.date ?? plannerDate;
    const newPlan: PlanItem = {
      id: uid(),
      title: planTitle.trim(),
      note: planNote.trim(),
      date,
      scope,
      timeSlot: options?.timeSlot ?? (scope === "day" ? planTimeSlot : undefined),
      done: false,
    };
    setPlanItems((prev) => [newPlan, ...prev].slice(0, 300));
    setPlanTitle("");
    setPlanNote("");
    setSaveNotice("保存完成：计划已添加");
  }

  function togglePlanDone(id: string) {
    setPlanItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function addGoal() {
    if (!goalTitle.trim()) {
      return;
    }
    const goal: GoalItem = {
      id: uid(),
      title: goalTitle.trim(),
      targetDate: goalDate,
      progress: 0,
      done: false,
    };
    setGoals((prev) => [goal, ...prev].slice(0, 100));
    setGoalTitle("");
  }

  function advanceGoal(id: string) {
    setGoals((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextProgress = Math.min(100, item.progress + 20);
        return { ...item, progress: nextProgress, done: nextProgress >= 100 };
      }),
    );
  }

  function addReminder() {
    if (!reminderText.trim()) {
      return;
    }
    const reminder: ReminderItem = {
      id: uid(),
      text: reminderText.trim(),
      remindAt: reminderAt,
      done: false,
    };
    setReminders((prev) => [reminder, ...prev].slice(0, 200));
    setReminderText("");
  }

  function addDietRecord() {
    const record: DietEntry = {
      id: uid(),
      date: dietDate,
      breakfast: breakfast.trim(),
      lunch: lunch.trim(),
      dinner: dinner.trim(),
    };
    setDietRecords((prev) => [record, ...prev].slice(0, 60));
    setBreakfast("");
    setLunch("");
    setDinner("");
  }

  function toggleReminderDone(id: string) {
    setReminders((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function handleShoppingImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setShoppingImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }
  function handleMealImageUpload(type: "breakfast" | "lunch" | "dinner", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (type === "breakfast") {
      getPreviewDataUrl(file, setBreakfastImage);
      return;
    }
    if (type === "lunch") {
      getPreviewDataUrl(file, setLunchImage);
      return;
    }
    getPreviewDataUrl(file, setDinnerImage);
  }

  function addShoppingItem() {
    if (!shoppingName.trim()) {
      return;
    }
    const item: ShoppingItem = {
      id: uid(),
      name: shoppingName.trim(),
      category: shoppingCategory.trim() || "其他",
      note: shoppingNote.trim(),
      price: shoppingPrice ? Number(shoppingPrice) : undefined,
      imageDataUrl: shoppingImageDataUrl || undefined,
      status: shoppingStatusDraft,
      createdAt: new Date().toISOString(),
    };
    setShoppingItems((prev) => [item, ...prev].slice(0, 200));
    setShoppingName("");
    setShoppingCategory("数码");
    setShoppingNote("");
    setShoppingPrice("");
    setShoppingImageDataUrl("");
    setShoppingStatusDraft("pending");
    setSaveNotice("保存完成：购物项已添加");
  }

  function setShoppingStatus(id: string, status: ShoppingItem["status"]) {
    setShoppingItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  function createKnowledgeFolder(name: string, description: string) {
    const folderName = name.trim();
    if (!folderName) {
      return null;
    }
    const existing = knowledgeFolders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
    if (existing) {
      return existing.id;
    }
    const id = uid();
    setKnowledgeFolders((prev) => [
      { id, name: folderName, description: description.trim(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
    return id;
  }

  function guessFolderFromContent(input: string) {
    const text = input.toLowerCase();
    const map: Array<{ keywords: string[]; folder: string; description: string }> = [
      { keywords: ["摄影", "打光", "构图", "镜头", "滤镜"], folder: "摄影", description: "摄影技法与后期" },
      { keywords: ["游戏", "boss", "通关", "配装"], folder: "游戏", description: "游戏心得与攻略" },
      { keywords: ["bjd", "娃娃", "妆面", "娃衣"], folder: "BJD", description: "BJD娃娃资料库" },
      { keywords: ["短剧", "影视", "电影", "剧评"], folder: "影视", description: "短剧影视观察" },
    ];
    const hit = map.find((item) => item.keywords.some((k) => text.includes(k)));
    if (!hit) {
      return null;
    }
    return createKnowledgeFolder(hit.folder, hit.description);
  }

  function handleArchiveImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    getPreviewDataUrl(file, setArchiveImage);
  }

  function handleQuickImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    getPreviewDataUrl(file, setQuickImage);
  }

  function handleUniversalImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    getPreviewDataUrl(file, setUniversalImage);
  }

  function handleUniversalFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    setUniversalFiles(Array.from(files).map((file) => file.name));
  }

  function saveArchiveEntry() {
    if (!archiveTitle.trim() && !archiveContent.trim()) {
      return;
    }
    let folderId: string | null = null;
    if (manualFolderId !== "auto" && manualFolderId !== "") {
      folderId = manualFolderId;
    } else {
      folderId = guessFolderFromContent(`${archiveTitle} ${archiveContent}`);
    }
    const entry: KnowledgeEntry = {
      id: uid(),
      title: archiveTitle.trim() || "未命名条目",
      content: archiveContent.trim(),
      imageDataUrl: archiveImage || undefined,
      folderId,
      source: "archive",
      createdAt: new Date().toISOString(),
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setArchiveTitle("");
    setArchiveContent("");
    setArchiveImage("");
    setManualFolderId("auto");
    setSaveNotice("保存完成：已归档");
  }

  function saveQuickEntry() {
    if (!quickTitle.trim() && !quickContent.trim()) {
      return;
    }
    const entry: KnowledgeEntry = {
      id: uid(),
      title: quickTitle.trim() || "快速收藏",
      content: quickContent.trim(),
      imageDataUrl: quickImage || undefined,
      folderId: null,
      source: "quick",
      createdAt: new Date().toISOString(),
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setQuickTitle("");
    setQuickContent("");
    setQuickImage("");
    setSaveNotice("保存完成：快速收藏已保存");
  }
  function buildTemporaryLog(allowEmpty = false) {
    if (!allowEmpty && !universalTitle.trim() && !universalContent.trim() && !universalImage && universalFiles.length === 0) {
      return null;
    }
    const suggestedFolderId = guessFolderFromContent(`${universalTitle} ${universalContent}`);
    const autoTags = [
      universalImage ? "#图片" : "",
      /奶茶|茶|霸王茶姬/.test(`${universalTitle} ${universalContent}`) ? "#奶茶" : "",
      /短剧|电影|剧/.test(`${universalTitle} ${universalContent}`) ? "#短剧" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: uid(),
      title: universalTitle.trim() || (allowEmpty ? "待归档输入" : "未命名收藏"),
      content: `${universalContent.trim()}${autoTags ? `\n\n自动标签: ${autoTags}` : ""}`.trim(),
      imageDataUrl: universalImage || undefined,
      fileNames: universalFiles,
      suggestedFolderId,
      createdAt: new Date().toISOString(),
    } satisfies TemporaryLog;
  }
  function openFolderSelectorFromLogger() {
    const tempLog = buildTemporaryLog(true);
    if (!tempLog) {
      return;
    }
    setPendingLog(tempLog);
    setSelectorFolderId(loggerFolderId === "auto" ? tempLog.suggestedFolderId ?? "auto" : loggerFolderId);
    setFolderSelectorOpen(true);
  }
  function sendLoggerEntry() {
    const tempLog = buildTemporaryLog();
    if (!tempLog) {
      return;
    }
    setPendingLog(tempLog);
    const defaultSelector = loggerFolderId === "auto" ? tempLog.suggestedFolderId ?? "auto" : loggerFolderId;
    setSelectorFolderId(defaultSelector);
    if (defaultSelector === "auto" || defaultSelector === "") {
      setFolderSelectorOpen(true);
      return;
    }
    const entry: KnowledgeEntry = {
      id: uid(),
      title: tempLog.title,
      content: `${tempLog.content}${tempLog.fileNames.length > 0 ? `\n\n附件: ${tempLog.fileNames.join(", ")}` : ""}`.trim(),
      imageDataUrl: tempLog.imageDataUrl,
      folderId: defaultSelector,
      source: "quick",
      createdAt: new Date().toISOString(),
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setUniversalTitle("");
    setUniversalContent("");
    setUniversalImage("");
    setUniversalFiles([]);
    setPendingLog(null);
    setPagerTab("archive");
    setSaveNotice("保存完成：记录已发送");
  }
  function appendToKnowledgeEntry() {
    if (!timelineEntryId || !timelineAppendText.trim()) {
      return;
    }
    setKnowledgeEntries((prev) =>
      prev.map((item) =>
        item.id === timelineEntryId
          ? { ...item, content: `${item.content}\n\n补充记录：${timelineAppendText.trim()}`.trim() }
          : item,
      ),
    );
    setTimelineAppendText("");
    setTimelineEntryId(null);
  }
  function handleArchiveTimelineSelect(entryId: string) {
    setTimelineEntryId(entryId);
    if (activeArchiveApp?.moduleId === "health") {
      const record = teaRecords.find((item) => item.id === entryId);
      if (!record) return;
      setBrand(record.brand);
      setBeverageName(record.beverageName ?? "");
      setIceLevel(record.iceLevel);
      setCupSize(record.cupSize);
      setSugarLevel(record.sugarLevel);
      setTeaTime(new Date(record.teaTimestamp).toISOString().slice(11, 16));
      return;
    }
    if (activeArchiveApp?.moduleId === "planner") {
      const record = planItems.find((item) => item.id === entryId);
      if (!record) return;
      setPlanTitle(record.title);
      setPlanNote(record.note);
      setPlannerDate(record.date);
      setPlanTimeSlot(record.timeSlot ?? "09:00");
      setPlannerLabTab(record.scope === "month" ? "month" : record.scope === "week" ? "week" : "day");
      return;
    }
    if (activeArchiveApp?.moduleId === "period") {
      const record = periodRecords.find((item) => item.id === entryId);
      if (!record) return;
      setPeriodStartDate(record.startDate);
      setPeriodEndDate(toDateKey(addDays(new Date(record.startDate), Math.max(0, record.durationDays - 1))));
      setFlowLevel(record.flowLevel);
      setPeriodSymptom(record.symptom);
      return;
    }
    if (activeArchiveApp?.moduleId === "gaming") {
      const record = gameEntries.find((item) => item.id === entryId);
      if (!record) return;
      setGameTitle(record.title);
      setGamePlatform(record.platform);
      setGameProgress(record.progress);
      setGamePlayHours(record.playHours);
      setGameNextObjective(record.nextObjective);
      setGameStatus(record.status);
      return;
    }
    if (activeArchiveApp?.moduleId === "shopping") {
      const record = shoppingItems.find((item) => item.id === entryId);
      if (!record) return;
      setShoppingName(record.name);
      setShoppingCategory(record.category || "其他");
      setShoppingNote(record.note);
      setShoppingPrice(typeof record.price === "number" ? String(record.price) : "");
      setShoppingImageDataUrl(record.imageDataUrl ?? "");
      return;
    }
    const entry = knowledgeEntries.find((item) => item.id === entryId);
    if (!entry) return;
    setArchiveTitle(entry.title);
    setArchiveContent(entry.content);
    setArchiveImage(entry.imageDataUrl ?? "");
    if (activeArchiveApp?.moduleId === "memory") {
      setArchiveMemoryMood(entry.memoryMood ?? "平稳");
      setArchiveMemoryDateType(entry.memoryDateType ?? "range");
      const fallbackDate = new Date(entry.createdAt).toISOString().slice(0, 10);
      setArchiveMemoryStartDate(entry.memoryStartDate ?? fallbackDate);
      setArchiveMemoryEndDate(entry.memoryEndDate ?? entry.memoryStartDate ?? fallbackDate);
    }
  }
  function updateSelectedArchiveRecord() {
    if (!timelineEntryId) {
      return;
    }
    if (activeArchiveApp?.moduleId === "health") {
      const teaTimestamp = new Date(`${new Date().toISOString().slice(0, 10)}T${teaTime}:00`).toISOString();
      setTeaRecords((prev) =>
        prev.map((item) =>
          item.id === timelineEntryId
            ? {
                ...item,
                brand,
                beverageName: beverageName.trim() || undefined,
                iceLevel,
                cupSize,
                sugarLevel,
                teaTimestamp,
                calories: estimatedCalories,
                caffeineIntensity: estimateCaffeineIntensity({ cupSize, teaTimestamp }),
              }
            : item,
        ),
      );
      setSaveNotice("保存完成：已更新所选记录");
      return;
    }
    if (activeArchiveApp?.moduleId === "planner") {
      const nextScope: PlanScope = plannerLabTab === "year" ? "month" : plannerLabTab;
      setPlanItems((prev) =>
        prev.map((item) =>
          item.id === timelineEntryId
            ? { ...item, title: planTitle.trim() || item.title, note: planNote.trim(), date: plannerDate, scope: nextScope, timeSlot: nextScope === "day" ? planTimeSlot : undefined }
            : item,
        ),
      );
      setSaveNotice("保存完成：已更新所选记录");
      return;
    }
    if (activeArchiveApp?.moduleId === "period") {
      setPeriodRecords((prev) =>
        prev.map((item) =>
          item.id === timelineEntryId
            ? { ...item, startDate: periodStartDate, durationDays: periodDurationDays, flowLevel, symptom: periodSymptom.trim() }
            : item,
        ),
      );
      setSaveNotice("保存完成：已更新所选记录");
      return;
    }
    if (activeArchiveApp?.moduleId === "gaming") {
      setGameEntries((prev) =>
        prev.map((item) =>
          item.id === timelineEntryId
            ? {
                ...item,
                title: gameTitle.trim() || item.title,
                platform: gamePlatform,
                progress: Math.max(0, Math.min(100, gameProgress)),
                playHours: Math.max(0, gamePlayHours),
                nextObjective: gameNextObjective.trim(),
                status: gameStatus,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      setSaveNotice("保存完成：已更新所选记录");
      return;
    }
    if (activeArchiveApp?.moduleId === "shopping") {
      setShoppingItems((prev) =>
        prev.map((item) =>
          item.id === timelineEntryId
            ? {
                ...item,
                name: shoppingName.trim() || item.name,
                category: shoppingCategory.trim() || item.category,
                note: shoppingNote.trim(),
                price: shoppingPrice ? Number(shoppingPrice) : undefined,
                imageDataUrl: shoppingImageDataUrl || undefined,
              }
            : item,
        ),
      );
      setSaveNotice("保存完成：已更新所选记录");
      return;
    }
    setKnowledgeEntries((prev) =>
      prev.map((item) => {
        if (item.id !== timelineEntryId) {
          return item;
        }
        const base = {
          ...item,
          title: archiveTitle.trim() || item.title,
          content: archiveContent.trim(),
          imageDataUrl: archiveImage || undefined,
        };
        if (activeArchiveApp?.moduleId !== "memory") {
          return base;
        }
        let start = archiveMemoryStartDate;
        let end = archiveMemoryDateType === "single" ? archiveMemoryStartDate : archiveMemoryEndDate;
        if (archiveMemoryDateType === "range" && start > end) {
          [start, end] = [end, start];
        }
        return {
          ...base,
          memoryMood: archiveMemoryMood,
          memoryDateType: archiveMemoryDateType,
          memoryStartDate: start,
          memoryEndDate: end,
        };
      }),
    );
    setSaveNotice("保存完成：已更新所选记录");
  }
  function deleteSelectedArchiveRecord() {
    if (!timelineEntryId) {
      return;
    }
    if (activeArchiveApp?.moduleId === "health") {
      setTeaRecords((prev) => prev.filter((item) => item.id !== timelineEntryId));
    } else if (activeArchiveApp?.moduleId === "planner") {
      setPlanItems((prev) => prev.filter((item) => item.id !== timelineEntryId));
    } else if (activeArchiveApp?.moduleId === "period") {
      setPeriodRecords((prev) => prev.filter((item) => item.id !== timelineEntryId));
    } else if (activeArchiveApp?.moduleId === "gaming") {
      setGameEntries((prev) => prev.filter((item) => item.id !== timelineEntryId));
    } else if (activeArchiveApp?.moduleId === "shopping") {
      setShoppingItems((prev) => prev.filter((item) => item.id !== timelineEntryId));
    } else {
      setKnowledgeEntries((prev) => prev.filter((item) => item.id !== timelineEntryId));
    }
    setTimelineEntryId(null);
    setTimelineAppendText("");
    setSaveNotice("删除完成：记录已移除");
  }
  function saveArchiveMiniAppEntry(folderId: string | null) {
    if (!archiveTitle.trim() && !archiveContent.trim() && !archiveImage) {
      return;
    }
    const isMemoryArchive = activeArchiveApp?.moduleId === "memory";
    let memoryFields: Pick<KnowledgeEntry, "memoryMood" | "memoryDateType" | "memoryStartDate" | "memoryEndDate"> | undefined;
    if (isMemoryArchive) {
      let start = archiveMemoryStartDate;
      let end = archiveMemoryDateType === "single" ? archiveMemoryStartDate : archiveMemoryEndDate;
      if (archiveMemoryDateType === "range" && start > end) {
        [start, end] = [end, start];
      }
      memoryFields = {
        memoryMood: archiveMemoryMood,
        memoryDateType: archiveMemoryDateType,
        memoryStartDate: start,
        memoryEndDate: end,
      };
    }
    const entry: KnowledgeEntry = {
      id: uid(),
      title: archiveTitle.trim() || "未命名条目",
      content: archiveContent.trim(),
      imageDataUrl: archiveImage || undefined,
      folderId,
      source: "archive",
      createdAt: new Date().toISOString(),
      ...memoryFields,
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setArchiveTitle("");
    setArchiveContent("");
    setArchiveImage("");
    if (isMemoryArchive) {
      setArchiveMemoryMood("平稳");
      setArchiveMemoryDateType("range");
      const today = new Date().toISOString().slice(0, 10);
      setArchiveMemoryStartDate(today);
      setArchiveMemoryEndDate(today);
    }
    setSaveNotice("保存完成：已写入归档");
  }
  function saveDramaMiniEntry() {
    const dramaFolderId = createKnowledgeFolder(dramaType, `${dramaType}记录与感受`);
    const tagText = dramaTag.trim() ? `#${dramaTag.trim()}` : "";
    const authorText = dramaAuthor.trim() ? `作者/创作者：${dramaAuthor.trim()}` : "";
    const entry: KnowledgeEntry = {
      id: uid(),
      title: archiveTitle.trim() || `${dramaType}记录`,
      content: `${archiveContent.trim()}\n类型：${dramaType}\n${authorText}\n评分：${dramaRating}/10 ${tagText}`.trim(),
      imageDataUrl: archiveImage || undefined,
      folderId: dramaFolderId,
      source: "archive",
      createdAt: new Date().toISOString(),
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setArchiveTitle("");
    setArchiveContent("");
    setArchiveImage("");
    setSaveNotice("保存完成：媒体条目已保存");
  }

  function submitUniversalInput() {
    sendLoggerEntry();
  }

  function confirmFolderSelection() {
    if (!pendingLog) {
      return;
    }
    const finalFolderId = selectorFolderId === "auto" ? pendingLog.suggestedFolderId : selectorFolderId === "" ? null : selectorFolderId;
    const hasPayload = pendingLog.content.trim().length > 0 || Boolean(pendingLog.imageDataUrl) || pendingLog.fileNames.length > 0;
    if (!hasPayload) {
      setFolderSelectorOpen(false);
      setPendingLog(null);
      setLoggerFolderId(finalFolderId ?? "auto");
      return;
    }
    const entry: KnowledgeEntry = {
      id: uid(),
      title: pendingLog.title,
      content: `${pendingLog.content}${pendingLog.fileNames.length > 0 ? `\n\n附件: ${pendingLog.fileNames.join(", ")}` : ""}`.trim(),
      imageDataUrl: pendingLog.imageDataUrl,
      folderId: finalFolderId,
      source: "quick",
      createdAt: new Date().toISOString(),
    };
    setKnowledgeEntries((prev) => [entry, ...prev].slice(0, 1000));
    setUniversalTitle("");
    setUniversalContent("");
    setUniversalImage("");
    setUniversalFiles([]);
    setPendingLog(null);
    setFolderSelectorOpen(false);
    setLoggerFolderId(finalFolderId ?? "auto");
    setPagerTab("archive");
    setSaveNotice("保存完成：已归档到文件夹");
  }

  function addSafetyRule() {
    if (!safetyRuleDraft.trim()) {
      return;
    }
    setSafetyRules((prev) => [{ id: uid(), text: safetyRuleDraft.trim() }, ...prev]);
    setSafetyRuleDraft("");
  }

  function createCustomModule() {
    const title = customModuleTitle.trim();
    if (!title) {
      return;
    }
    const moduleId = `custom-${uid()}`;
    const moduleMeta: ModuleMeta = {
      id: moduleId,
      title,
      icon: customModuleIcon.trim() || "🧩",
      description: customModuleDescription.trim(),
      isCustom: true,
    };
    setCustomModules((prev) => [moduleMeta, ...prev]);
    setEnabledModules((prev) => ({ ...prev, [moduleId]: true }));
    setCustomModuleContents((prev) => ({ ...prev, [moduleId]: "" }));
    createKnowledgeFolder(title, customModuleDescription.trim());
    setCustomModuleTitle("");
    setCustomModuleDescription("");
    setCustomModuleIcon("🧩");
  }

  function removeCustomModule(moduleId: string) {
    setCustomModules((prev) => prev.filter((item) => item.id !== moduleId));
    setCustomModuleContents((prev) => {
      const next = { ...prev };
      delete next[moduleId];
      return next;
    });
    setEnabledModules((prev) => {
      const next = { ...prev };
      delete next[moduleId];
      return next;
    });
    if (activeModule === moduleId) {
      setActiveModule(null);
    }
  }

  function addGameProgressEntry() {
    if (!gameTitle.trim()) {
      return;
    }
    const entry: GameProgressEntry = {
      id: uid(),
      title: gameTitle.trim(),
      platform: gamePlatform,
      progress: Math.max(0, Math.min(100, gameProgress)),
      playHours: Math.max(0, gamePlayHours),
      nextObjective: gameNextObjective.trim(),
      todos: gameDraftTodos,
      status: gameStatus,
      updatedAt: new Date().toISOString(),
    };
    setGameEntries((prev) => [entry, ...prev].slice(0, 200));
    setGameTitle("");
    setGameNextObjective("");
    setGameDraftTodos([]);
    setGameTodoInput("");
    setSaveNotice("保存完成：游戏进度已记录");
  }

  function addGameDraftTodo() {
    if (!gameTodoInput.trim()) {
      return;
    }
    setGameDraftTodos((prev) => [...prev, { id: uid(), text: gameTodoInput.trim(), done: false }]);
    setGameTodoInput("");
  }

  function toggleGameTodo(entryId: string, todoId: string) {
    setGameEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }
        return {
          ...entry,
          todos: entry.todos.map((todo) => (todo.id === todoId ? { ...todo, done: !todo.done } : todo)),
        };
      }),
    );
  }

  function saveHealthDraft() {
    const draft = {
      brand,
      beverageName,
      iceLevel,
      sugarLevel,
      cupSize,
      teaTime,
      addTopping,
      wakeTime,
      sleepTime,
      dietDate,
      breakfast,
      lunch,
      dinner,
      experimenter,
      experimentDate,
      experimentPurpose,
      experimentPrinciple,
      experimentResult,
      experimentAnalysis,
    };
    localStorage.setItem("tea-lab-health-draft", JSON.stringify(draft));
    setHealthDraftMessage("已暂存草稿，可稍后继续编辑。");
  }

  function loadHealthDraft() {
    const raw = localStorage.getItem("tea-lab-health-draft");
    if (!raw) {
      setHealthDraftMessage("未找到暂存草稿。");
      return;
    }
    const draft = JSON.parse(raw);
    setBrand(draft.brand ?? brand);
    setBeverageName(draft.beverageName ?? beverageName);
    setIceLevel(draft.iceLevel ?? iceLevel);
    setSugarLevel(draft.sugarLevel ?? sugarLevel);
    setCupSize(draft.cupSize ?? cupSize);
    setTeaTime(draft.teaTime ?? teaTime);
    setAddTopping(draft.addTopping ?? addTopping);
    setWakeTime(draft.wakeTime ?? wakeTime);
    setSleepTime(draft.sleepTime ?? sleepTime);
    setDietDate(draft.dietDate ?? dietDate);
    setBreakfast(draft.breakfast ?? breakfast);
    setLunch(draft.lunch ?? lunch);
    setDinner(draft.dinner ?? dinner);
    setExperimenter(draft.experimenter ?? experimenter);
    setExperimentDate(draft.experimentDate ?? experimentDate);
    setExperimentPurpose(draft.experimentPurpose ?? experimentPurpose);
    setExperimentPrinciple(draft.experimentPrinciple ?? experimentPrinciple);
    setExperimentResult(draft.experimentResult ?? experimentResult);
    setExperimentAnalysis(draft.experimentAnalysis ?? experimentAnalysis);
    setHealthDraftMessage("已恢复暂存草稿。");
  }

  function saveHealthAll() {
    addTeaRecord();
    addVitalRecord();
    addDietRecord();
    addHealthExperimentEntry();
    setHealthDraftMessage("已保存奶茶、作息和饮食记录。");
    setSaveNotice("保存完成：健康记录已写入");
  }

  function addHealthExperimentEntry() {
    const sleepHours = calcSleepHours(wakeTime, sleepTime);
    const mealCompleteness = [breakfast, lunch, dinner].filter((item) => item.trim()).length;
    const entry: HealthExperimentEntry = {
      id: uid(),
      batchId: `EXP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(Math.random() * 900 + 100)}`,
      createdAt: new Date().toISOString(),
      experimenter: experimenter.trim() || "实验员A",
      experimentDate,
      purpose: experimentPurpose.trim(),
      principle: experimentPrinciple.trim(),
      result: experimentResult.trim(),
      analysis: experimentAnalysis.trim(),
      teaCalories: estimatedCalories,
      sugarLevel,
      sleepHours,
      mealCompleteness,
      focusScore,
      energyScore,
      note: experimentNote.trim(),
    };
    setExperimentEntries((prev) => [entry, ...prev].slice(0, 200));
    setExperimentNote("");
    setExperimentResult("");
    setExperimentAnalysis("");
  }

  async function readImageText(file: File) {
    const result = await recognize(file, "chi_sim+eng");
    return result.data.text || "";
  }

  function getPreviewDataUrl(file: File, setter: (value: string) => void) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleTeaPhotoAutoFill(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    getPreviewDataUrl(file, setTeaScanPreview);
    setTeaScanLoading(true);
    try {
      const text = (await readImageText(file)).replace(/\s+/g, "");
      const parsed = parseTeaFromOcrText(text);
      if (parsed.brand) {
        setBrand(parsed.brand);
      }
      if (parsed.beverageName) {
        setBeverageName(parsed.beverageName);
      }
      if (parsed.sugarLevel) {
        setSugarLevel(parsed.sugarLevel);
      }
      if (parsed.cupSize) {
        setCupSize(parsed.cupSize);
      }
      if (parsed.iceLevel) {
        setIceLevel(parsed.iceLevel);
      }
      setTeaAnalysisMessage("图片识别完成，已自动填充奶茶参数。");
    } finally {
      setTeaScanLoading(false);
    }
  }

  function handleTeaTextAnalyzeAndSync() {
    if (!teaNaturalText.trim()) {
      return;
    }
    const parsed = parseTeaFromOcrText(teaNaturalText.replace(/\s+/g, ""));
    if (parsed.brand) {
      setBrand(parsed.brand);
    }
    if (parsed.beverageName) {
      setBeverageName(parsed.beverageName);
    }
    if (parsed.sugarLevel) {
      setSugarLevel(parsed.sugarLevel);
    }
    if (parsed.cupSize) {
      setCupSize(parsed.cupSize);
    }
    if (parsed.iceLevel) {
      setIceLevel(parsed.iceLevel);
    }
    addTeaRecord();
    setTeaAnalysisMessage("文本解析完成，已同步到奶茶实验室数据库。");
    setTeaNaturalText("");
  }

  async function handleDietPhotoAutoFill(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    getPreviewDataUrl(file, setDietScanPreview);
    setDietScanLoading(true);
    try {
      const text = await readImageText(file);
      const mealText = parseMealFromOcrText(text);
      if (mealText) {
        setLunch(mealText);
      }
    } finally {
      setDietScanLoading(false);
    }
  }

  function toggleModule(id: ModuleId) {
    if (id === "store") {
      return;
    }
    setEnabledModules((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function addMemoryRangeEvent() {
    if (!memoryRangeTitle.trim()) {
      return;
    }
    const start = memoryRangeStartDate <= memoryRangeEndDate ? memoryRangeStartDate : memoryRangeEndDate;
    const end = memoryRangeStartDate <= memoryRangeEndDate ? memoryRangeEndDate : memoryRangeStartDate;
    const next: MemoryRangeEvent = {
      id: uid(),
      title: memoryRangeTitle.trim(),
      startDate: start,
      endDate: end,
      note: memoryRangeNote.trim(),
      mood: memoryRangeMood,
      dateType: memoryRangeDateType,
    };
    setMemoryRangeEvents((prev) => [next, ...prev].slice(0, 200));
    setMemoryRangeTitle("");
    setMemoryRangeNote("");
    setMemoryRangeMood("平稳");
    setMemoryRangeDateType("range");
    setSaveNotice("保存完成：记忆事件已添加");
  }
  function updateMemoryRangeEvent(eventId: string, updater: (item: MemoryRangeEvent) => MemoryRangeEvent) {
    setMemoryRangeEvents((prev) => prev.map((item) => (item.id === eventId ? updater(item) : item)));
  }
  function formatMemoryEventDate(item: MemoryRangeEvent) {
    const type = item.dateType ?? "range";
    if (type === "single") {
      return item.startDate;
    }
    return `${item.startDate} ~ ${item.endDate}`;
  }

  function persistAccountSnapshot(targetAccountId: string) {
    const snapshot = collectLabDataSnapshot();
    localStorage.setItem(`${AUTH_DATA_PREFIX}${targetAccountId}`, JSON.stringify(snapshot));
  }

  function switchToAccount(targetAccountId: string) {
    if (typeof window === "undefined") {
      return;
    }
    if (currentAccountId) {
      persistAccountSnapshot(currentAccountId);
    }
    const raw = localStorage.getItem(`${AUTH_DATA_PREFIX}${targetAccountId}`);
    const nextSnapshot = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    applyLabDataSnapshot(nextSnapshot);
    localStorage.setItem(AUTH_CURRENT_ACCOUNT_KEY, targetAccountId);
    setCurrentAccountId(targetAccountId);
    window.location.reload();
  }

  function handleAuthLogin() {
    const username = authUsername.trim();
    if (!username || !authPassword) {
      setAuthError("请输入账号和密码。");
      return;
    }
    const account = accounts.find((a) => a.username === username && a.password === authPassword);
    if (!account) {
      setAuthError("账号或密码不正确。");
      return;
    }
    const nextAccounts = accounts.map((item) =>
      item.id === account.id ? { ...item, lastLoginAt: new Date().toISOString() } : item,
    );
    setAccounts(nextAccounts);
    writeAccountsToStorage(nextAccounts);
    setAuthError("");
    switchToAccount(account.id);
  }

  function handleAuthRegister() {
    const username = registerUsername.trim();
    if (!username || !registerPassword) {
      setAuthError("请至少填写账号与密码。");
      return;
    }
    if (accounts.some((item) => item.username === username)) {
      setAuthError("该账号已存在，请换一个用户名。");
      return;
    }
    const now = new Date().toISOString();
    const newAccount: LabAccount = {
      id: uid(),
      username,
      password: registerPassword,
      profileName: registerProfileName.trim() || username,
      profileNote: "",
      createdAt: now,
      lastLoginAt: now,
    };
    const nextAccounts = [newAccount, ...accounts];
    setAccounts(nextAccounts);
    writeAccountsToStorage(nextAccounts);
    setAuthError("");
    setCurrentAccountId(newAccount.id);
    localStorage.setItem(AUTH_CURRENT_ACCOUNT_KEY, newAccount.id);
    localStorage.setItem(`${AUTH_DATA_PREFIX}${newAccount.id}`, JSON.stringify({}));
    clearLabDataSnapshot();
    window.location.reload();
  }

  function handleLogout() {
    if (currentAccountId) {
      persistAccountSnapshot(currentAccountId);
    }
    localStorage.removeItem(AUTH_CURRENT_ACCOUNT_KEY);
    setCurrentAccountId(null);
    clearLabDataSnapshot();
    window.location.reload();
  }

  function updateCurrentAccountProfile(patch: Partial<Pick<LabAccount, "profileName" | "profileNote">>) {
    if (!currentAccountId) {
      return;
    }
    const nextAccounts = accounts.map((item) => (item.id === currentAccountId ? { ...item, ...patch } : item));
    setAccounts(nextAccounts);
    writeAccountsToStorage(nextAccounts);
  }

  function generateTodaySummary() {
    const today = new Date().toDateString();
    const todayTea = teaRecords.filter((item) => new Date(item.teaTimestamp).toDateString() === today);
    const todayVitals = vitalRecords.filter((item) => new Date(item.createdAt).toDateString() === today);
    const todayPeriod = periodRecords.filter((item) => new Date(item.startDate).toDateString() === today);
    const todayDiet = dietRecords.find((item) => new Date(item.date).toDateString() === today);
    const avgCalories =
      todayTea.length > 0
        ? Math.round(todayTea.reduce((sum, item) => sum + (item.calories ?? 0), 0) / todayTea.length)
        : 0;
    const focusHint = readingReflection.length + lifeEssay.length > 80 ? "有较完整反思，建议保持。" : "建议再补充 2-3 句实验感受。";
    const openGoals = goals.filter((item) => !item.done).length;
    const undoneReminders = reminders.filter((item) => !item.done).length;
    const pendingShopping = shoppingItems.filter((item) => item.status === "pending").length;
    const activeGames = gameEntries.filter((item) => item.status === "playing").length;
    const hasTodayInput =
      todayTea.length > 0 ||
      todayVitals.length > 0 ||
      todayPeriod.length > 0 ||
      Boolean(todayDiet?.breakfast || todayDiet?.lunch || todayDiet?.dinner) ||
      todayPlanItems.length > 0;
    if (!hasTodayInput) {
      const lazyHint = "小懒虫，你为什么今天没有写你的实验数据记录？";
      setDailySummary(`今日实验摘要（${new Date().toLocaleDateString()}）\n- ${lazyHint}`);
      setSummaryPopupText(lazyHint);
      setSummaryPopupOpen(true);
      return;
    }

    const summary = [
      `今日实验摘要（${new Date().toLocaleDateString()}）`,
      `- 奶茶实验：记录 ${todayTea.length} 次，预估平均热量 ${avgCalories} kcal。`,
      `- 饮食记录：早餐${todayDiet?.breakfast ? "已记录" : "未记录"}，午餐${todayDiet?.lunch ? "已记录" : "未记录"}，晚餐${todayDiet?.dinner ? "已记录" : "未记录"}。`,
      `- 生理监测：记录 ${todayVitals.length} 次。`,
      `- 周期记录：新增 ${todayPeriod.length} 条。${periodInsight.phaseHint}`,
      `- 睡眠预测：预计延后 ${prediction.predictedDelayMinutes} 分钟，置信度 ${Math.round(prediction.confidence * 100)}%。`,
      `- 思考文本：读后感《${reflectionTitle || "未命名"}》(${reflectionCategory}) ${readingReflection.length} 字，生命感悟 ${lifeEssay.length} 字（情感倾向：${emotionLabel(
        lifeEmotion,
      )}）。`,
      `- 计划系统：当前${plannerView === "day" ? "日" : plannerView === "week" ? "周" : "月"}视图任务 ${plannerItemsForView.length} 条。`,
      `- 目标与提醒：未完成目标 ${openGoals} 个，待提醒 ${undoneReminders} 条。`,
      `- 购物清单：待购买 ${pendingShopping} 项。`,
      `- 游戏进度：进行中 ${activeGames} 款。`,
      `- 实验台账：累计 ${experimentEntries.length} 条，近7条专注均值 ${experimentKpis.avgFocus || 0}。`,
      `- AI 建议：${dynamicTeaReminder} ${focusHint} ${
        periodInsight.isPms ? "PMS 期间建议降低逻辑训练强度并增加 15 分钟冥想。" : ""
      }`,
      ...lifeOptimizationTips.map((tip) => `- 生活优化：${tip}`),
    ].join("\n");
    setDailySummary(summary);
    const quickLine1 = `今天完成率 ${Math.round(todayPlanCompletion * 100)}%，奶茶记录 ${todayTea.length} 次，预计平均 ${avgCalories} kcal。`;
    const quickLine2 = `${dynamicTeaReminder}${periodInsight.isPms ? " 当前经前期，建议降低强度并早点休息。" : ""}`;
    setSummaryPopupText(`${quickLine1}\n${quickLine2}`);
    setSummaryPopupOpen(true);
  }
  function rotateSafetyTip() {
    if (safetyTipPool.length <= 1) {
      return;
    }
    setSafetyTipIndex((prev) => (prev + 1) % safetyTipPool.length);
  }
  function openMatrixActions(appId: string) {
    setMatrixActionAppId(appId);
  }
  function handleMatrixPressStart(appId: string) {
    if (matrixPressTimerRef.current) {
      clearTimeout(matrixPressTimerRef.current);
    }
    matrixPressTimerRef.current = setTimeout(() => {
      matrixLongPressedRef.current = true;
      openMatrixActions(appId);
    }, 520);
  }
  function handleMatrixPressEnd() {
    if (!matrixPressTimerRef.current) {
      return;
    }
    clearTimeout(matrixPressTimerRef.current);
    matrixPressTimerRef.current = null;
  }
  function handleMatrixAppOpen(appId: string) {
    if (matrixLongPressedRef.current) {
      matrixLongPressedRef.current = false;
      return;
    }
    setActiveArchiveAppId(appId);
  }
  function removeArchiveApp() {
    if (!matrixActionApp) {
      return;
    }
    const folderId = matrixActionApp.folderId;
    if (!folderId) {
      setMatrixActionAppId(null);
      return;
    }
    const folder = knowledgeFolders.find((item) => item.id === folderId);
    if (!folder) {
      setMatrixActionAppId(null);
      return;
    }
    const isCustomModule = customModules.some((module) => module.title === folder.name);
    setKnowledgeEntries((prev) => prev.filter((item) => item.folderId !== folderId));
    setKnowledgeFolders((prev) => prev.filter((item) => item.id !== folderId));
    if (isCustomModule) {
      const target = customModules.find((module) => module.title === folder.name);
      if (target) {
        removeCustomModule(target.id);
      }
    }
    if (selectedFolderId === folderId) {
      setSelectedFolderId("all");
    }
    setMatrixActionAppId(null);
  }

  useEffect(() => {
    if (!currentAccountId || typeof window === "undefined") {
      return;
    }
    const onBeforeUnload = () => {
      persistAccountSnapshot(currentAccountId);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [currentAccountId]);

  useEffect(() => {
    if (!saveNotice) {
      return;
    }
    const timer = window.setTimeout(() => setSaveNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  if (!currentAccountId) {
    return (
      <div className="min-h-screen p-6 text-slate-800" style={backgroundStyle}>
        <main className="mx-auto max-w-md">
          <section className="glass rounded-3xl p-5">
            <p className="text-sm text-slate-600">Life Optimization Lab Manual</p>
            <h1 className="mt-1 text-2xl font-semibold">账号管理</h1>
            <p className="mt-2 text-sm text-slate-600">登录后将进入你的专属数据空间，不同账号的数据互相隔离。</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setAuthMode("login")}
                className={`rounded-xl px-3 py-1 text-sm ${authMode === "login" ? "bg-white/70" : "bg-white/30"}`}
              >
                登录
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`rounded-xl px-3 py-1 text-sm ${authMode === "register" ? "bg-white/70" : "bg-white/30"}`}
              >
                注册
              </button>
            </div>
            {authMode === "login" ? (
              <div className="mt-4 space-y-2">
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="账号"
                  className="w-full rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <button onClick={handleAuthLogin} className="rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm">
                  登录并进入
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <input
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="新账号"
                  className="w-full rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <input
                  value={registerProfileName}
                  onChange={(e) => setRegisterProfileName(e.target.value)}
                  placeholder="昵称（可选）"
                  className="w-full rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <button onClick={handleAuthRegister} className="rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm">
                  注册并创建专属数据
                </button>
              </div>
            )}
            {authError && <p className="mt-3 text-sm text-red-700">{authError}</p>}
          </section>
        </main>
      </div>
    );
  }

  const currentAccount = accounts.find((item) => item.id === currentAccountId) ?? null;

  return (
    <div className="min-h-screen p-6 text-slate-800" style={backgroundStyle}>
      {saveNotice && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border border-emerald-300/70 bg-emerald-50/95 px-4 py-2 text-sm text-emerald-800 shadow-lg">
          {saveNotice}
        </div>
      )}
      {accountPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-lg rounded-3xl p-4 text-slate-800 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold">账号中心</p>
              <button onClick={() => setAccountPanelOpen(false)} className="rounded-lg border border-white/35 bg-white/60 px-2 py-1 text-xs">
                关闭
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-600">
                当前昵称
                <input
                  value={currentAccount?.profileName ?? ""}
                  onChange={(e) => updateCurrentAccountProfile({ profileName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/35 bg-white/60 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                个人说明
                <textarea
                  value={currentAccount?.profileNote ?? ""}
                  onChange={(e) => updateCurrentAccountProfile({ profileNote: e.target.value })}
                  className="mt-1 h-20 w-full rounded-lg border border-white/35 bg-white/60 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                切换账号
                <select
                  value={currentAccountId}
                  onChange={(e) => switchToAccount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/35 bg-white/60 px-2 py-1 text-sm"
                >
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.profileName || item.username}（{item.username}）
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthMode("register")}
                  className="rounded-lg border border-white/35 bg-white/60 px-3 py-1 text-xs"
                >
                  新建账号
                </button>
                <button onClick={handleLogout} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700">
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showStartupSplash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-md">
          <div className="glass w-full max-w-xl rounded-3xl p-6 text-gray-800 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-600">生活安全守则</p>
            <p className="mt-3 text-lg font-semibold leading-relaxed">{startupRule}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowStartupSplash(false)}
                className="rounded-xl border border-white/40 bg-white/70 px-3 py-1 text-sm"
              >
                跳过
              </button>
            </div>
          </div>
        </div>
      )}
      {summaryPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-20 backdrop-blur-sm">
          <div className="glass w-full max-w-lg rounded-2xl p-4 text-slate-800 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">今日摘要</p>
              <button onClick={() => setSummaryPopupOpen(false)} className="rounded-lg border border-white/40 bg-white/70 px-2 py-1 text-xs">
                关闭
              </button>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{summaryPopupText}</p>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-1 md:px-2">
        <header className="glass mb-6 flex items-center justify-between rounded-3xl px-5 py-4">
          <div>
            <p className="text-sm text-slate-600">Life Optimization Lab Manual</p>
            <h1 className="text-2xl font-semibold tracking-tight">生命优化实验手册</h1>
            <p className="text-xs text-slate-500">当前用户：{currentAccount?.profileName || currentAccount?.username}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAccountPanelOpen(true)}
              className="rounded-2xl border border-white/40 bg-white/20 px-4 py-2 text-sm backdrop-blur-xl hover:bg-white/30"
            >
              账号管理
            </button>
            <button
              onClick={generateTodaySummary}
              className="rounded-2xl border border-white/40 bg-white/20 px-4 py-2 text-sm backdrop-blur-xl hover:bg-white/30"
            >
              生成今日摘要
            </button>
          </div>
        </header>

        <section className="glass mb-5 rounded-3xl p-3">
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setPagerTab("dashboard")}
              className={`rounded-xl px-3 py-1 text-sm ${pagerTab === "dashboard" ? "bg-white/70 text-gray-800" : "bg-white/30 text-gray-700"}`}
            >
              总结 {todayProtocolItems.length > 0 ? `(${todayProtocolItems.length})` : ""}
            </button>
            <button
              onClick={() => setPagerTab("input")}
              className={`rounded-xl px-3 py-1 text-sm ${pagerTab === "input" ? "bg-white/70 text-gray-800" : "bg-white/30 text-gray-700"}`}
            >
              实验
            </button>
            <button
              onClick={() => setPagerTab("archive")}
              className={`rounded-xl px-3 py-1 text-sm ${pagerTab === "archive" ? "bg-white/70 text-gray-800" : "bg-white/30 text-gray-700"}`}
            >
              归档
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl">
            <div
              className="flex transition-transform duration-300"
              style={{
                width: "300%",
                transform: `translateX(${pagerTab === "dashboard" ? "0%" : pagerTab === "input" ? "-33.3333%" : "-66.6667%"})`,
              }}
            >
              <div className="w-1/3 p-2">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border-2 border-sky-300 bg-sky-50/80 p-3 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-sky-800">今日实验待办</p>
                        <span className="text-xs text-gray-700">{todayProtocolItems.filter((item) => item.done).length}/{todayProtocolItems.length || 0}</span>
                      </div>
                      <div className="space-y-1.5">
                        {todayProtocolItems.slice(0, 4).map((item) => (
                          <label key={item.id} className="flex items-start gap-2 rounded-xl bg-white/65 px-2 py-1 text-xs text-slate-700">
                            <input type="checkbox" checked={item.done} onChange={() => togglePlanDone(item.id)} className="mt-0.5" />
                            <span className="line-clamp-2">{item.timeSlot ? `${item.timeSlot} ` : ""}{item.title}</span>
                          </label>
                        ))}
                        {todayProtocolItems.length === 0 && <p className="text-xs text-slate-600">今天还没有任务。</p>}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/50 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-800">长期计划进度</p>
                      <div className="space-y-2">
                        {longTermGoals.slice(0, 3).map((goal) => (
                          <div key={goal.id}>
                            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-700">
                              <span className="line-clamp-1">{goal.title}</span>
                              <span>{goal.daysLeft}天</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-white/70">
                              <div className="h-full rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.45)]" style={{ width: `${goal.progress}%` }} />
                            </div>
                          </div>
                        ))}
                        {longTermGoals.length === 0 && <p className="text-xs text-slate-600">暂无里程碑。</p>}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/45 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">今日实验导读</p>
                      <span className="text-xs text-gray-700">Entropy {entropyScore}</span>
                    </div>
                    <p className="text-sm text-gray-800">{dailyLabBriefing}</p>
                  </div>
                  <div className="rounded-2xl bg-white/45 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">实验日历可视化</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setMemoryDate(shiftMonth(memoryDate, -1))} className="rounded-lg border border-white/35 bg-white/70 px-2 py-0.5 text-xs">◀</button>
                        <span className="text-xs text-slate-600">{memoryDate.slice(0, 7)}</span>
                        <button onClick={() => setMemoryDate(shiftMonth(memoryDate, 1))} className="rounded-lg border border-white/35 bg-white/70 px-2 py-0.5 text-xs">▶</button>
                      </div>
                    </div>
                    <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
                      {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {memoryMonthMatrix.map((day) => {
                        const digest = memoryDigestByDate[day.dateKey];
                        const selected = day.dateKey === memoryDate;
                        return (
                          <button
                            key={day.dateKey}
                            onClick={() => setMemoryDate(day.dateKey)}
                            className={`min-h-12 rounded-lg border p-1 text-left ${selected ? "border-sky-400 bg-sky-100/50" : "border-white/25 bg-white/60"}`}
                          >
                            <p className="text-[10px] text-slate-700">{day.dayOfMonth}</p>
                            <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">{digest?.icon || "·"} {digest?.label || ""}</p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 rounded-xl border border-white/25 bg-white/65 p-2 text-xs text-slate-700">
                      <p>{memoryDate}：奶茶 {memoryDayData.teaCount} ｜ 饮食 {memoryDayData.dietCount} ｜ 计划 {memoryDayData.planCount}</p>
                      <p className="mt-1 line-clamp-1">
                        当日摘要：{memoryDayRecords.plan[0]?.title || memoryDayRecords.tea[0]?.brand || memoryDayRecords.shopping[0]?.name || "暂无记录"}
                      </p>
                    </div>
                  </div>
                  <button onClick={rotateSafetyTip} className="w-full rounded-2xl border border-cyan-200/70 bg-cyan-50/80 p-3 text-left">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-semibold text-cyan-700">实验室注意事项</p>
                      <span className="text-xs text-cyan-700/80">点击换一条</span>
                    </div>
                    <p className="text-sm text-slate-700">{dailySafetyTip}</p>
                  </button>
                </div>
              </div>

              <div className="w-1/3 p-2">
                <div className="flex h-full min-h-[420px] flex-col rounded-2xl bg-white/45 p-4">
                  <p className="mb-2 text-sm font-semibold text-gray-800">实验数据记录</p>
                  <input value={universalTitle} onChange={(e) => setUniversalTitle(e.target.value)} placeholder="记录标题（可选）" className="lab-input mb-2" />
                  <textarea
                    value={universalContent}
                    onChange={(e) => setUniversalContent(e.target.value)}
                    placeholder="记录你的实验数据、闪念、观察..."
                    className="flex-1 rounded-2xl border border-white/30 bg-white/55 p-4 text-gray-800 outline-none"
                  />
                  {universalImage && <Image src={universalImage} alt="universal preview" width={100} height={100} className="mt-2 rounded border border-white/40 object-cover" />}
                  {universalFiles.length > 0 && <p className="mt-2 text-xs text-gray-700">附件：{universalFiles.join(" / ")}</p>}
                  <div className="relative mt-3 flex items-center gap-2 rounded-2xl border border-white/40 bg-white/65 p-2">
                    <motion.button
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      className="h-9 w-9 rounded-xl border border-white/50 bg-white/80 text-lg leading-none"
                      whileTap={{ scale: 0.95 }}
                    >
                      <Plus size={16} strokeWidth={1.5} className="mx-auto" />
                    </motion.button>
                    {attachmentMenuOpen && (
                      <div className="absolute bottom-12 left-0 z-10 w-40 rounded-xl border border-white/40 bg-white/90 p-2 text-sm shadow-lg">
                        <button
                          onClick={() => {
                            universalFileInputRef.current?.click();
                            setAttachmentMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-2 py-1 text-left hover:bg-slate-100"
                        >
                          <span className="inline-flex items-center gap-1"><FileUp size={14} strokeWidth={1.5} /> 上传文件</span>
                        </button>
                        <button
                          onClick={() => {
                            universalImageInputRef.current?.click();
                            setAttachmentMenuOpen(false);
                          }}
                          className="mt-1 block w-full rounded-lg px-2 py-1 text-left hover:bg-slate-100"
                        >
                          <span className="inline-flex items-center gap-1"><ImagePlus size={14} strokeWidth={1.5} /> 相册照片</span>
                        </button>
                      </div>
                    )}
                    <input
                      ref={universalFileInputRef}
                      type="file"
                      multiple
                      onChange={handleUniversalFileUpload}
                      className="hidden"
                    />
                    <input
                      ref={universalImageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUniversalImageUpload}
                      className="hidden"
                    />
                    <div className="flex-1 text-xs text-slate-600">
                      当前归档路径：{loggerFolderId === "auto" ? "自动建议" : knowledgeFolders.find((x) => x.id === loggerFolderId)?.name || "未分类"}
                    </div>
                    <motion.button
                      onClick={openFolderSelectorFromLogger}
                      className="h-9 w-9 rounded-xl border border-white/50 bg-white/80 text-base"
                      whileTap={{ scale: 0.95 }}
                    >
                      <Folder size={16} strokeWidth={1.5} className="mx-auto" />
                    </motion.button>
                    <motion.button onClick={submitUniversalInput} className="rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-sm" whileTap={{ scale: 0.95 }}>
                      <span className="inline-flex items-center gap-1"><SendHorizontal size={14} strokeWidth={1.5} /> 发送</span>
                    </motion.button>
                  </div>
                </div>
              </div>

              <div className="w-1/3 p-2">
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white/45 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">实验室应用矩阵</p>
                      <button
                        onClick={() => setArchiveWorkshopOpen((prev) => !prev)}
                        className="rounded-lg border border-white/40 bg-white/75 px-2.5 py-1 text-xs font-medium text-slate-600"
                      >
                        编辑
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {archiveMatrixApps.map((app) => (
                        <motion.button
                          key={app.id}
                          onClick={() => handleMatrixAppOpen(app.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openMatrixActions(app.id);
                          }}
                          onMouseDown={() => handleMatrixPressStart(app.id)}
                          onMouseUp={handleMatrixPressEnd}
                          onMouseLeave={handleMatrixPressEnd}
                          onTouchStart={() => handleMatrixPressStart(app.id)}
                          onTouchEnd={handleMatrixPressEnd}
                          className="relative rounded-xl border border-white/40 bg-white/60 p-2 text-xs text-gray-700"
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/70">
                            {renderArchiveAppIcon(app.moduleId)}
                          </span>
                          <p className="mt-1 line-clamp-1">{app.title}</p>
                          {app.badgeCount > 0 && (
                            <span className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-slate-700 px-1 text-[10px] text-white">
                              {app.badgeCount > 99 ? "99+" : app.badgeCount}
                            </span>
                          )}
                        </motion.button>
                      ))}
                    </div>
                    {archiveWorkshopOpen && (
                      <div className="mt-3 space-y-2 rounded-xl border border-white/35 bg-white/55 p-2">
                        <div className="max-h-32 space-y-1 overflow-auto pr-1 text-xs">
                          {archiveMatrixApps.map((app) => (
                            <div key={app.id} className="flex items-center justify-between rounded-lg border border-white/35 bg-white/65 px-2 py-1">
                              <span>{app.title}</span>
                              <button
                                onClick={() => toggleModule(app.moduleId)}
                                className="rounded-md border border-white/40 bg-white/80 px-2 py-0.5 disabled:opacity-60"
                              >
                                {enabledModules[app.moduleId] ? "启用" : "隐藏"}
                              </button>
                            </div>
                          ))}
                        </div>
                        <input value={customModuleTitle} onChange={(e) => setCustomModuleTitle(e.target.value)} placeholder="新实验课题名" className="lab-input" />
                        <input value={customModuleDescription} onChange={(e) => setCustomModuleDescription(e.target.value)} placeholder="课题说明（可选）" className="lab-input" />
                        <button onClick={createCustomModule} className="w-full rounded-xl border border-white/35 bg-white/75 px-3 py-2 text-sm">
                          新建并同步到归档矩阵
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white/45 p-3">
                    <p className="mb-2 text-sm font-semibold text-gray-800">Spotlight 检索</p>
                    <input
                      value={knowledgeSearch}
                      onChange={(e) => setKnowledgeSearch(e.target.value)}
                      placeholder="搜索文字 / 文件夹 / 图片识别文本..."
                      className="lab-input"
                    />
                    <div className="mt-2 space-y-1 text-xs text-gray-700">
                      {filteredKnowledgeEntries.slice(0, 4).map((item) => (
                        <p key={item.id}>• {item.title}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {folderSelectorOpen && pendingLog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-2xl rounded-2xl p-4 text-gray-800">
            <p className="mb-2 text-sm font-semibold">选择归档文件夹</p>
            <p className="mb-2 text-xs text-gray-700">条目：{pendingLog.title}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                onClick={() => setSelectorFolderId("auto")}
                className={`rounded-xl border p-3 text-left ${selectorFolderId === "auto" ? "border-sky-400 bg-sky-100/60" : "border-white/35 bg-white/60"}`}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/75">
                  <Bot size={16} strokeWidth={1.5} />
                </span>
                <p className="mt-1 text-xs">自动建议</p>
              </button>
              <button
                onClick={() => setSelectorFolderId("")}
                className={`rounded-xl border p-3 text-left ${selectorFolderId === "" ? "border-sky-400 bg-sky-100/60" : "border-white/35 bg-white/60"}`}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/75">
                  <Inbox size={16} strokeWidth={1.5} />
                </span>
                <p className="mt-1 text-xs">暂不分类</p>
              </button>
              {knowledgeFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectorFolderId(folder.id)}
                  className={`rounded-xl border p-3 text-left ${selectorFolderId === folder.id ? "border-sky-400 bg-sky-100/60" : "border-white/35 bg-white/60"}`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/75">
                    <FolderArchive size={16} strokeWidth={1.5} />
                  </span>
                  <p className="mt-1 text-xs">{folder.name}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/30 pt-3">
              <input
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="新文件夹名"
                className="lab-input basis-full sm:basis-auto sm:flex-1"
              />
              <button
                onClick={() => {
                  const id = createKnowledgeFolder(folderNameInput, "");
                  if (id) {
                    setSelectorFolderId(id);
                    setFolderNameInput("");
                    setSaveNotice("创建完成：文件夹已加入应用矩阵");
                  }
                }}
                className="rounded-xl border border-white/35 bg-white/65 px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-1"><Plus size={14} strokeWidth={1.5} /> 新建文件夹</span>
              </button>
              <button onClick={confirmFolderSelection} className="rounded-xl border border-white/35 bg-white/80 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1"><Check size={14} strokeWidth={1.5} /> 确认归档</span>
              </button>
              <button onClick={() => setFolderSelectorOpen(false)} className="rounded-xl border border-white/35 bg-white/50 px-3 py-2 text-sm">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {matrixActionApp && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-sm rounded-2xl p-3 text-slate-800">
            <p className="mb-2 text-sm font-semibold">应用操作：{matrixActionApp.title}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setActiveArchiveAppId(matrixActionApp.id);
                  setMatrixActionAppId(null);
                }}
                className="w-full rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-left text-sm"
              >
                查看
              </button>
              <button
                onClick={() => {
                  setArchiveWorkshopOpen(true);
                  setPagerTab("archive");
                  setMatrixActionAppId(null);
                }}
                className="w-full rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-left text-sm"
              >
                编辑文件夹
              </button>
              <button
                onClick={removeArchiveApp}
                disabled={!matrixActionApp.folderId}
                className="w-full rounded-xl border border-red-300/50 bg-red-50/80 px-3 py-2 text-left text-sm text-red-700 disabled:opacity-50"
              >
                删除
              </button>
              <button
                onClick={() => setMatrixActionAppId(null)}
                className="w-full rounded-xl border border-white/35 bg-white/60 px-3 py-2 text-left text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {activeArchiveApp && (
        <div className="fixed inset-0 z-40 bg-slate-900/35 p-3 backdrop-blur-sm">
          <div
            className="glass mx-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-y-auto rounded-3xl p-4 text-slate-800"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/35 bg-white/65 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  {renderArchiveAppIcon(activeArchiveApp.moduleId)}
                </span>
                <p className="font-semibold">{activeArchiveApp.title}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-white/70 px-2 py-1">本月记录 {activeArchiveTimeline.length}</span>
                <button onClick={() => setActiveArchiveAppId(null)} className="rounded-lg border border-white/35 bg-white/70 px-3 py-1">
                  返回矩阵
                </button>
              </div>
            </div>

            <div className="flex h-full flex-col gap-3">
              <div className="rounded-2xl border border-white/30 bg-white/55 p-3">
                <p className="mb-2 text-sm font-semibold">
                  {activeArchiveApp.moduleId === "health"
                    ? "今日奶茶与作息"
                    : activeArchiveApp.moduleId === "planner"
                      ? "今日计划编辑"
                      : activeArchiveApp.moduleId === "period"
                        ? "今日周期记录"
                        : activeArchiveApp.moduleId === "gaming"
                          ? "今日游戏进度"
                          : activeArchiveApp.moduleId === "shopping"
                            ? "今日购物清单"
                      : activeArchiveApp.moduleId === "reflection"
                        ? "今日短剧记录"
                        : activeArchiveApp.moduleId === "memory"
                          ? "今日记忆归档"
                          : "今日记录编辑"}
                </p>
                {activeArchiveApp.moduleId === "health" ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/35 bg-white/60 p-2">
                      <p className="mb-2 text-xs font-semibold text-slate-600">今日奶茶</p>
                      <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="品牌" className="lab-input" />
                      <input value={beverageName} onChange={(e) => setBeverageName(e.target.value)} placeholder="饮品名称（如：伯牙绝弦）" className="lab-input mt-2" />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input type="time" value={teaTime} onChange={(e) => setTeaTime(e.target.value)} className="lab-input" />
                        <select value={cupSize} onChange={(e) => setCupSize(e.target.value as "S" | "M" | "L")} className="lab-input">
                          <option value="S">小杯</option>
                          <option value="M">中杯</option>
                          <option value="L">大杯</option>
                        </select>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select value={iceLevel} onChange={(e) => setIceLevel(e.target.value)} className="lab-input">
                          <option>热</option>
                          <option>温</option>
                          <option>去冰</option>
                          <option>少冰</option>
                          <option>正常冰</option>
                        </select>
                        <select
                          value={toppingChoice}
                          onChange={(e) => {
                            const value = e.target.value;
                            setToppingChoice(value);
                            setAddTopping(value !== "无加料");
                          }}
                          className="lab-input"
                        >
                          <option>无加料</option>
                          <option>珍珠</option>
                          <option>椰果</option>
                          <option>奶盖</option>
                          <option>寒天晶球</option>
                          <option>少料</option>
                        </select>
                      </div>
                      <label className="mt-2 block text-sm">
                        糖度 {sugarLevel}/10
                        <input type="range" min={1} max={10} value={sugarLevel} onChange={(e) => setSugarLevel(Number(e.target.value))} className="w-full" />
                      </label>
                      <div className="mt-2 rounded-xl border border-blue-200/70 bg-blue-100/55 px-3 py-2 text-sm text-blue-900">
                        预计热量 {estimatedCalories} kcal ｜ 咖啡因强度 {estimateCaffeineIntensity({ cupSize, teaTimestamp: new Date().toISOString() })}/10
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/35 bg-white/60 p-2">
                      <p className="mb-2 text-xs font-semibold text-slate-600">今日作息</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="lab-input" />
                        <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="lab-input" />
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-white/30 bg-white/70 px-2 py-1 text-xs text-slate-700">
                          <p>睡眠时长 Delta</p>
                          <p className="font-semibold">{sleepHoursDelta.toFixed(1)}h（相对8h：{(sleepHoursDelta - 8).toFixed(1)}h）</p>
                        </div>
                        <div className="rounded-lg border border-white/30 bg-white/70 px-2 py-1 text-xs text-slate-700">
                          <p>精神睡眠时间（估算）</p>
                          <p className="font-semibold">{effectiveSleepHours.toFixed(1)}h</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/35 bg-white/60 p-2">
                      <p className="mb-2 text-xs font-semibold text-slate-600">今日饮食</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input type="date" value={dietDate} onChange={(e) => setDietDate(e.target.value)} className="lab-input sm:col-span-2" />
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input value={breakfast} onChange={(e) => setBreakfast(e.target.value)} placeholder="早餐" className="lab-input" />
                          <button
                            type="button"
                            onClick={() => setBreakfast("没吃")}
                            className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-2 py-1 text-xs text-amber-800"
                          >
                            没吃
                          </button>
                          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-white/35 bg-white/75 text-slate-600">
                            <Plus size={14} strokeWidth={1.5} />
                            <input type="file" accept="image/*" onChange={(e) => handleMealImageUpload("breakfast", e)} className="hidden" />
                          </label>
                        </div>
                        <p className="text-xs text-slate-600 sm:col-span-2">早餐估算热量：{breakfastCalories} kcal</p>
                        {breakfastImage && <Image src={breakfastImage} alt="breakfast preview" width={84} height={84} className="rounded-lg border border-white/40 object-cover sm:col-span-2" />}
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input value={lunch} onChange={(e) => setLunch(e.target.value)} placeholder="午餐" className="lab-input" />
                          <button
                            type="button"
                            onClick={() => setLunch("没吃")}
                            className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-2 py-1 text-xs text-amber-800"
                          >
                            没吃
                          </button>
                          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-white/35 bg-white/75 text-slate-600">
                            <Plus size={14} strokeWidth={1.5} />
                            <input type="file" accept="image/*" onChange={(e) => handleMealImageUpload("lunch", e)} className="hidden" />
                          </label>
                        </div>
                        <p className="text-xs text-slate-600 sm:col-span-2">午餐估算热量：{lunchCalories} kcal</p>
                        {lunchImage && <Image src={lunchImage} alt="lunch preview" width={84} height={84} className="rounded-lg border border-white/40 object-cover sm:col-span-2" />}
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input value={dinner} onChange={(e) => setDinner(e.target.value)} placeholder="晚餐" className="lab-input" />
                          <button
                            type="button"
                            onClick={() => setDinner("没吃")}
                            className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-2 py-1 text-xs text-amber-800"
                          >
                            没吃
                          </button>
                          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-white/35 bg-white/75 text-slate-600">
                            <Plus size={14} strokeWidth={1.5} />
                            <input type="file" accept="image/*" onChange={(e) => handleMealImageUpload("dinner", e)} className="hidden" />
                          </label>
                        </div>
                        <p className="text-xs text-slate-600 sm:col-span-2">晚餐估算热量：{dinnerCalories} kcal</p>
                        {dinnerImage && <Image src={dinnerImage} alt="dinner preview" width={84} height={84} className="rounded-lg border border-white/40 object-cover sm:col-span-2" />}
                        <div className="rounded-lg border border-white/30 bg-white/70 px-2 py-1 text-xs font-semibold text-slate-700 sm:col-span-2">
                          今日三餐估算总热量：{dailyMealCalories} kcal
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveHealthAll} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">保存今天健康记录</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                  </div>
                ) : activeArchiveApp.moduleId === "planner" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/35 bg-white/70 p-1 text-xs">
                      {[
                        { id: "day", label: "日计划" },
                        { id: "week", label: "周计划" },
                        { id: "month", label: "月计划" },
                        { id: "year", label: "年计划" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setPlannerLabTab(tab.id as "day" | "week" | "month" | "year")}
                          className={`rounded-lg px-2 py-1 ${plannerLabTab === tab.id ? "bg-sky-100 text-sky-800" : "text-slate-600"}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    {plannerLabTab === "day" && (
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input type="date" value={plannerDate} onChange={(e) => setPlannerDate(e.target.value)} className="lab-input" />
                          <input type="time" value={planTimeSlot} onChange={(e) => setPlanTimeSlot(e.target.value)} className="lab-input" />
                        </div>
                        <input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="今日任务标题" className="lab-input" />
                        <input value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="备注" className="lab-input" />
                        <div className="flex gap-2">
                          <button onClick={() => addPlanItem({ scope: "day", date: plannerDate, timeSlot: planTimeSlot })} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">添加日计划</button>
                          <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                        </div>
                      </div>
                    )}
                    {plannerLabTab === "week" && (
                      <div className="space-y-2">
                        <input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="本周重点目标" className="lab-input" />
                        <input value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="执行策略/里程碑" className="lab-input" />
                        <div className="flex gap-2">
                          <button onClick={() => addPlanItem({ scope: "week", date: plannerDate })} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">添加周计划</button>
                          <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                        </div>
                        {planItems.filter((x) => x.scope === "week").slice(0, 4).map((x) => (
                          <div key={x.id} className="rounded-xl bg-white/70 px-2 py-1 text-xs">
                            <p>{x.title}</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full bg-sky-400" style={{ width: x.done ? "100%" : "40%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {plannerLabTab === "month" && (
                      <div className="space-y-2">
                        <input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="本月核心课题" className="lab-input" />
                        <input value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="关键结果描述" className="lab-input" />
                        <div className="flex gap-2">
                          <button onClick={() => addPlanItem({ scope: "month", date: plannerDate })} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">添加月计划</button>
                          <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                        </div>
                        {planItems.filter((x) => x.scope === "month").slice(0, 4).map((x) => (
                          <div key={x.id} className="rounded-xl bg-white/70 px-2 py-1 text-xs">
                            <p>{x.title}</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full bg-violet-400" style={{ width: x.done ? "100%" : "30%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {plannerLabTab === "year" && (
                      <div className="space-y-2">
                        <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="年度里程碑（如雅思准备）" className="lab-input" />
                        <input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} className="lab-input" />
                        <button onClick={addGoal} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">
                          添加年度里程碑
                        </button>
                        {goals.slice(0, 4).map((goal) => (
                          <button key={goal.id} onClick={() => advanceGoal(goal.id)} className="w-full rounded-xl bg-white/70 px-2 py-2 text-left text-xs">
                            <p>{goal.title} ｜ 截止 {goal.targetDate}</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full bg-emerald-400" style={{ width: `${goal.progress}%` }} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : activeArchiveApp.moduleId === "period" ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input type="date" value={periodStartDate} onChange={(e) => setPeriodStartDate(e.target.value)} className="lab-input" />
                      <input type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} className="lab-input" />
                    </div>
                    <p className="text-xs text-slate-600">自动计算时长：{periodDurationDays} 天（由开始与结束日期计算）</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select value={flowLevel} onChange={(e) => setFlowLevel(e.target.value as "轻" | "中" | "重")} className="lab-input">
                        <option value="轻">偏少</option>
                        <option value="中">正常</option>
                        <option value="重">偏多</option>
                      </select>
                    </div>
                    <p className="text-xs text-slate-600">“持续天数”表示本次周期实际持续了几天（例如 5 = 持续 5 天）。</p>
                    <textarea
                      value={periodSymptom}
                      onChange={(e) => setPeriodSymptom(e.target.value)}
                      placeholder="症状/备注"
                      className="h-20 w-full rounded-xl border border-white/30 bg-white/60 p-2 outline-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={addPeriodRecord} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">新增周期记录</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                  </div>
                ) : activeArchiveApp.moduleId === "gaming" ? (
                  <div className="space-y-2">
                    <input value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} placeholder="游戏名称" className="lab-input" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={gamePlatform} onChange={(e) => setGamePlatform(e.target.value)} placeholder="平台（PC/PS5等）" className="lab-input" />
                      <select value={gameStatus} onChange={(e) => setGameStatus(e.target.value as GameProgressEntry["status"])} className="lab-input">
                        <option value="playing">进行中</option>
                        <option value="paused">暂停</option>
                        <option value="abandoned">放弃</option>
                        <option value="completed">通关</option>
                      </select>
                    </div>
                    <label className="text-sm">
                      进度 {gameProgress}%
                      <input type="range" min={0} max={100} value={gameProgress} onChange={(e) => setGameProgress(Number(e.target.value))} className="w-full" />
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={gamePlayHours}
                      onChange={(e) => setGamePlayHours(Number(e.target.value))}
                      placeholder="游玩小时"
                      className="lab-input"
                    />
                    <input value={gameNextObjective} onChange={(e) => setGameNextObjective(e.target.value)} placeholder="下一目标" className="lab-input" />
                    <div className="flex gap-2">
                      <button onClick={addGameProgressEntry} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">新增游戏记录</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                  </div>
                ) : activeArchiveApp.moduleId === "shopping" ? (
                  <div className="space-y-2">
                    <input value={shoppingName} onChange={(e) => setShoppingName(e.target.value)} placeholder="商品名称" className="lab-input" />
                    <input value={shoppingCategory} onChange={(e) => setShoppingCategory(e.target.value)} placeholder="商品大类（数码/美妆/服饰...）" className="lab-input" />
                    <input value={shoppingPrice} onChange={(e) => setShoppingPrice(e.target.value)} placeholder="价格（元）" className="lab-input" />
                    <textarea
                      value={shoppingNote}
                      onChange={(e) => setShoppingNote(e.target.value)}
                      placeholder="备注（型号/链接/购买理由）"
                      className="h-20 w-full rounded-xl border border-white/30 bg-white/60 p-2 outline-none"
                    />
                    <input type="file" accept="image/*" onChange={handleShoppingImageUpload} className="block w-full text-sm" />
                    {shoppingImageDataUrl && <Image src={shoppingImageDataUrl} alt="shopping preview" width={90} height={90} className="rounded-lg border border-white/40 object-cover" />}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { id: "pending", label: "想买" },
                        { id: "bought", label: "买了" },
                        { id: "sold", label: "卖掉了" },
                        { id: "cancelled", label: "不买了" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setShoppingStatusDraft(option.id as ShoppingItem["status"])}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-left ${
                            shoppingStatusDraft === option.id ? "border-sky-300 bg-sky-50 text-sky-800" : "border-white/35 bg-white/70"
                          }`}
                        >
                          <span
                            className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                              shoppingStatusDraft === option.id ? "border-sky-500 bg-sky-500 text-white" : "border-slate-400 bg-white"
                            }`}
                          >
                            {shoppingStatusDraft === option.id ? "✓" : ""}
                          </span>
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addShoppingItem} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">新增购物项</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                    {timelineEntryId && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { id: "pending", label: "想买" },
                          { id: "bought", label: "买了" },
                          { id: "sold", label: "卖掉了" },
                          { id: "cancelled", label: "不买了" },
                        ].map((option) => {
                          const current = shoppingItems.find((item) => item.id === timelineEntryId);
                          const selected = current?.status === option.id;
                          return (
                            <button
                              key={option.id}
                              onClick={() => setShoppingStatus(timelineEntryId, option.id as ShoppingItem["status"])}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-left ${selected ? "border-sky-300 bg-sky-50 text-sky-800" : "border-white/35 bg-white/70"}`}
                            >
                              <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${selected ? "border-sky-500 bg-sky-500 text-white" : "border-slate-400 bg-white"}`}>
                                {selected ? "✓" : ""}
                              </span>
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : activeArchiveApp.moduleId === "reflection" ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={archiveTitle} onChange={(e) => setArchiveTitle(e.target.value)} placeholder="作品名 / 条目标题" className="lab-input" />
                      <select value={dramaType} onChange={(e) => setDramaType(e.target.value)} className="lab-input">
                        <option value="影视">影视</option>
                        <option value="短剧">短剧</option>
                        <option value="音乐">音乐</option>
                        <option value="书籍">书籍</option>
                        <option value="播客">播客</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    <input value={dramaAuthor} onChange={(e) => setDramaAuthor(e.target.value)} placeholder="作者 / 导演 / 演唱者" className="lab-input" />
                    <textarea
                      value={archiveContent}
                      onChange={(e) => setArchiveContent(e.target.value)}
                      placeholder="今天发生了什么 / 细节 / 你的感受"
                      className="h-24 w-full rounded-xl border border-white/30 bg-white/60 p-2 outline-none"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm">
                        评分 {dramaRating}/10
                        <input type="range" min={1} max={10} value={dramaRating} onChange={(e) => setDramaRating(Number(e.target.value))} className="w-full accent-sky-500" />
                      </label>
                      <input value={dramaTag} onChange={(e) => setDramaTag(e.target.value)} placeholder="标签：治愈/悬疑/电子/叙事..." className="lab-input" />
                    </div>
                    <input type="file" accept="image/*" onChange={handleArchiveImageUpload} className="block w-full text-sm" />
                    <div className="flex gap-2">
                      <button onClick={saveDramaMiniEntry} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">保存媒体条目</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                  </div>
                ) : activeArchiveApp.moduleId === "memory" ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-sky-200/60 bg-sky-50/50 px-3 py-2 text-xs text-sky-900">
                      在此选择<strong>事件发生的时间范围</strong>与<strong>心情</strong>，再填写标题与正文；保存后会出现在下方「历史档案馆」。
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-600">
                        时间范围
                        <select
                          value={archiveMemoryDateType}
                          onChange={(e) => {
                            const v = e.target.value as "single" | "range";
                            setArchiveMemoryDateType(v);
                            if (v === "single") {
                              setArchiveMemoryEndDate(archiveMemoryStartDate);
                            }
                          }}
                          className="mt-1 w-full lab-input"
                        >
                          <option value="single">某一天</option>
                          <option value="range">一段时间</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-600">
                        事件心情
                        <select
                          value={archiveMemoryMood}
                          onChange={(e) => setArchiveMemoryMood(e.target.value)}
                          className="mt-1 w-full lab-input"
                        >
                          <option>平稳</option>
                          <option>开心</option>
                          <option>焦虑</option>
                          <option>疲惫</option>
                          <option>低落</option>
                          <option>满足</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-600 sm:col-span-2">
                        {archiveMemoryDateType === "single" ? "发生日期" : "开始日期"}
                        <input
                          type="date"
                          value={archiveMemoryStartDate}
                          onChange={(e) => {
                            const v = e.target.value;
                            setArchiveMemoryStartDate(v);
                            if (archiveMemoryDateType === "single") {
                              setArchiveMemoryEndDate(v);
                            }
                          }}
                          className="mt-1 w-full lab-input"
                        />
                      </label>
                      {archiveMemoryDateType === "range" && (
                        <label className="text-xs text-slate-600 sm:col-span-2">
                          结束日期
                          <input
                            type="date"
                            value={archiveMemoryEndDate}
                            onChange={(e) => setArchiveMemoryEndDate(e.target.value)}
                            className="mt-1 w-full lab-input"
                          />
                        </label>
                      )}
                    </div>
                    <input value={archiveTitle} onChange={(e) => setArchiveTitle(e.target.value)} placeholder="条目标题" className="lab-input" />
                    <textarea
                      value={archiveContent}
                      onChange={(e) => setArchiveContent(e.target.value)}
                      placeholder="在这个小应用里补充细节..."
                      className="h-24 w-full rounded-xl border border-white/30 bg-white/60 p-2 outline-none"
                    />
                    <input type="file" accept="image/*" onChange={handleArchiveImageUpload} className="block w-full text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => saveArchiveMiniAppEntry(activeArchiveApp.folderId)} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">
                        保存到当前应用归档
                      </button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                        更新所选记录
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input value={archiveTitle} onChange={(e) => setArchiveTitle(e.target.value)} placeholder="条目标题" className="lab-input" />
                    <textarea
                      value={archiveContent}
                      onChange={(e) => setArchiveContent(e.target.value)}
                      placeholder="在这个小应用里补充细节..."
                      className="h-24 w-full rounded-xl border border-white/30 bg-white/60 p-2 outline-none"
                    />
                    <input type="file" accept="image/*" onChange={handleArchiveImageUpload} className="block w-full text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => saveArchiveMiniAppEntry(activeArchiveApp.folderId)} className="rounded-xl border border-white/35 bg-white/70 px-3 py-2 text-sm">保存到当前应用归档</button>
                      <button onClick={updateSelectedArchiveRecord} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">更新所选记录</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/35 bg-white/65 p-3">
                <p className="mb-2 text-sm font-semibold">Spotlight 检索栏</p>
                <input value={archiveSpotlight} onChange={(e) => setArchiveSpotlight(e.target.value)} placeholder="搜索标题/关键词..." className="lab-input" />
              </div>

              <div className="flex-1 rounded-2xl border border-white/30 bg-white/55 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">历史档案馆</p>
                  <select value={activeArchiveMonth} onChange={(e) => setActiveArchiveMonth(e.target.value)} className="rounded-lg border border-white/35 bg-white/75 px-2 py-1 text-xs">
                    <option value="all">全部月份</option>
                    {archiveTimelineByMonth.monthKeys.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>
                <div className="max-h-[42vh] space-y-3 overflow-auto pr-1">
                  {archiveTimelineByMonth.monthKeys.map((month) => (
                    <div key={month} className="rounded-xl border border-white/35 bg-white/60 p-2">
                      <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><FolderArchive size={13} strokeWidth={1.5} /> {month}</p>
                      <div className="space-y-2">
                        {archiveTimelineByMonth.groups[month]?.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleArchiveTimelineSelect(item.id)}
                            className={`w-full rounded-xl border p-2 text-left ${timelineEntryId === item.id ? "border-sky-400 bg-sky-100/50" : "border-white/30 bg-white/70"}`}
                          >
                            <p className="text-sm font-medium">{item.title}</p>
                            {activeArchiveApp.moduleId === "memory" && (
                              <p className="text-xs font-medium text-sky-900">
                                {(item.memoryDateType ?? "range") === "single"
                                  ? item.memoryStartDate ?? "未选日期"
                                  : `${item.memoryStartDate ?? "?"} ~ ${item.memoryEndDate ?? "?"}`}{" "}
                                ｜ 心情 {item.memoryMood ?? "—"}
                              </p>
                            )}
                            <p className="text-xs text-slate-600">{new Date(item.createdAt).toLocaleString()}</p>
                            <p className="mt-1 line-clamp-3 text-sm text-slate-700">{item.content}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {archiveTimelineByMonth.monthKeys.length === 0 && <p className="text-sm text-slate-600">没有匹配到档案记录。</p>}
                </div>
                {timelineEntryId && (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/35 bg-white/70 p-2">
                    <p className="text-xs text-slate-600">给选中记录补充细节（追加到正文）</p>
                    <textarea
                      value={timelineAppendText}
                      onChange={(e) => setTimelineAppendText(e.target.value)}
                      placeholder="例如：补充图片说明、复盘结论..."
                      className="h-20 w-full rounded-xl border border-white/35 bg-white/80 p-2 text-sm outline-none"
                    />
                    <button onClick={appendToKnowledgeEntry} className="rounded-lg border border-white/35 bg-white/80 px-3 py-1 text-sm">
                      追加到记录
                    </button>
                    <button
                      onClick={deleteSelectedArchiveRecord}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-700"
                    >
                      删除所选记录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModule && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/30 p-3 backdrop-blur-sm">
          <div
            className="glass sheet-up mx-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-3xl p-6 text-slate-800 shadow-2xl"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex justify-center">
              <div className="sheet-handle" />
            </div>
            <div className="sticky top-0 z-20 -mx-6 mb-5 flex items-center justify-between border-b border-white/45 bg-slate-900/70 px-6 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <h2 className="text-xl font-semibold">
                {allModules.find((item) => item.id === activeModule)?.title}
              </h2>
              <button
                onClick={() => setActiveModule(null)}
                className="rounded-xl border border-white/30 bg-white/20 px-3 py-1 text-sm hover:bg-white/35"
              >
                关闭
              </button>
            </div>
            {activeModule && dualModeModules.has(activeModule) && (
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setModuleViewMode((prev) => ({ ...prev, [activeModule]: "input" }))}
                  className={`rounded-xl px-3 py-1 text-sm ${currentModuleMode === "input" ? "bg-white/70 text-gray-800" : "bg-white/30 text-gray-700"}`}
                >
                  精确输入
                </button>
                <button
                  onClick={() => setModuleViewMode((prev) => ({ ...prev, [activeModule]: "archive" }))}
                  className={`rounded-xl px-3 py-1 text-sm ${currentModuleMode === "archive" ? "bg-white/70 text-gray-800" : "bg-white/30 text-gray-700"}`}
                >
                  归档查看
                </button>
              </div>
            )}

            {activeModule === "health" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-3 text-sm">
                  <div className="rounded-2xl border border-white/30 bg-white/15 p-3">
                    <p>奶茶记录 {teaRecords.length} 条 ｜ 作息记录 {vitalRecords.length} 条 ｜ 饮食记录 {dietRecords.length} 条</p>
                  </div>
                  <div className="rounded-2xl border border-white/30 bg-white/15 p-3">
                    <p className="mb-2 font-medium">实验台账归档</p>
                    {experimentEntries.slice(0, 20).map((entry) => (
                      <p key={entry.id}>
                        {entry.batchId} ｜ {entry.experimentDate} ｜ {entry.experimenter} ｜ 专注 {entry.focusScore}/10 ｜ 精力 {entry.energyScore}/10
                      </p>
                    ))}
                    {experimentEntries.length === 0 && <p>暂无归档。</p>}
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">在一个页面集中编辑奶茶、作息和饮食。可先暂存，吃完饭后继续补充。</p>
                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">奶茶</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="品牌"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={beverageName}
                      onChange={(e) => setBeverageName(e.target.value)}
                      placeholder="饮品名称（如：伯牙绝弦）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <select
                      value={iceLevel}
                      onChange={(e) => setIceLevel(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    >
                      <option className="text-black">热</option>
                      <option className="text-black">温</option>
                      <option className="text-black">去冰</option>
                      <option className="text-black">少冰</option>
                      <option className="text-black">正常冰</option>
                    </select>
                    <input
                      type="time"
                      value={teaTime}
                      onChange={(e) => setTeaTime(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <select
                      value={cupSize}
                      onChange={(e) => setCupSize(e.target.value as "S" | "M" | "L")}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    >
                      <option className="text-black" value="S">
                        小杯
                      </option>
                      <option className="text-black" value="M">
                        中杯
                      </option>
                      <option className="text-black" value="L">
                        大杯
                      </option>
                    </select>
                    <label className="text-sm sm:col-span-2">
                      糖度: {sugarLevel}
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={sugarLevel}
                        onChange={(e) => setSugarLevel(Number(e.target.value))}
                        className="mt-1 w-full"
                      />
                    </label>
                    <select
                      value={addTopping ? "加料" : "不加料"}
                      onChange={(e) => setAddTopping(e.target.value === "加料")}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    >
                      <option className="text-black">不加料</option>
                      <option className="text-black">加料</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">作息</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="time"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="time"
                      value={sleepTime}
                      onChange={(e) => setSleepTime(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">饮食（早中晚）</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="date"
                      value={dietDate}
                      onChange={(e) => setDietDate(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    />
                    <input
                      value={breakfast}
                      onChange={(e) => setBreakfast(e.target.value)}
                      placeholder="早餐"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    />
                    <button
                      type="button"
                      onClick={() => setBreakfast("没吃")}
                      className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-800 sm:col-span-2"
                    >
                      早餐没吃
                    </button>
                    <input
                      value={lunch}
                      onChange={(e) => setLunch(e.target.value)}
                      placeholder="午餐"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    />
                    <button
                      type="button"
                      onClick={() => setLunch("没吃")}
                      className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-800 sm:col-span-2"
                    >
                      午餐没吃
                    </button>
                    <input
                      value={dinner}
                      onChange={(e) => setDinner(e.target.value)}
                      placeholder="晚餐"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    />
                    <button
                      type="button"
                      onClick={() => setDinner("没吃")}
                      className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-800 sm:col-span-2"
                    >
                      晚餐没吃
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">实验报告结构化录入</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      实验员
                      <input
                        value={experimenter}
                        onChange={(e) => setExperimenter(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                      />
                    </label>
                    <label className="text-sm">
                      日期
                      <input
                        type="date"
                        value={experimentDate}
                        onChange={(e) => setExperimentDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      实验目的
                      <textarea
                        value={experimentPurpose}
                        onChange={(e) => setExperimentPurpose(e.target.value)}
                        className="mt-1 h-16 w-full rounded-xl border border-white/30 bg-white/20 p-2 outline-none"
                        placeholder="例如：观察晚间奶茶与次日专注度关系"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      实验原理
                      <textarea
                        value={experimentPrinciple}
                        onChange={(e) => setExperimentPrinciple(e.target.value)}
                        className="mt-1 h-16 w-full rounded-xl border border-white/30 bg-white/20 p-2 outline-none"
                        placeholder="例如：通过摄入量、睡眠时长、主观评分的相关性评估"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      专注度评分: {focusScore}/10
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={focusScore}
                        onChange={(e) => setFocusScore(Number(e.target.value))}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      精力评分: {energyScore}/10
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={energyScore}
                        onChange={(e) => setEnergyScore(Number(e.target.value))}
                        className="mt-1 w-full"
                      />
                    </label>
                    <textarea
                      value={experimentNote}
                      onChange={(e) => setExperimentNote(e.target.value)}
                      placeholder="实验结果（客观描述，如：下午2点后注意力下降）"
                      className="h-20 rounded-xl border border-white/30 bg-white/20 p-2 text-sm outline-none sm:col-span-2"
                    />
                    <textarea
                      value={experimentResult}
                      onChange={(e) => setExperimentResult(e.target.value)}
                      placeholder="实验结果补充（量化或关键观察）"
                      className="h-16 rounded-xl border border-white/30 bg-white/20 p-2 text-sm outline-none sm:col-span-2"
                    />
                    <textarea
                      value={experimentAnalysis}
                      onChange={(e) => setExperimentAnalysis(e.target.value)}
                      placeholder="实验分析（原因推断与下一步）"
                      className="h-20 rounded-xl border border-white/30 bg-white/20 p-2 text-sm outline-none sm:col-span-2"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-3 text-sm">
                  <p>AI 文本解析奶茶（示例：下午喝了一杯中杯多肉葡萄，少冰，五分糖）</p>
                  <textarea
                    value={teaNaturalText}
                    onChange={(e) => setTeaNaturalText(e.target.value)}
                    placeholder="输入描述，自动解析并同步奶茶记录..."
                    className="mt-2 h-20 w-full rounded-xl border border-white/30 bg-white/20 p-2 outline-none"
                  />
                  <button
                    onClick={handleTeaTextAnalyzeAndSync}
                    className="mt-2 rounded-xl border border-white/35 bg-white/25 px-3 py-1 text-sm hover:bg-white/35"
                  >
                    解析并同步
                  </button>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-3 text-sm">
                  <p>拍照自动填写（奶茶/午餐）</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="file" accept="image/*" onChange={handleTeaPhotoAutoFill} className="block w-full text-sm" />
                    <input type="file" accept="image/*" onChange={handleDietPhotoAutoFill} className="block w-full text-sm" />
                  </div>
                  {(teaScanLoading || dietScanLoading) && <p className="mt-2 text-slate-700">识别中，请稍候...</p>}
                  {teaAnalysisMessage && <p className="mt-2 text-slate-700">{teaAnalysisMessage}</p>}
                  <div className="mt-2 flex gap-2">
                    {teaScanPreview && (
                      <Image src={teaScanPreview} alt="tea scan preview" width={90} height={90} className="rounded-lg border border-white/40 object-cover" />
                    )}
                    {dietScanPreview && (
                      <Image src={dietScanPreview} alt="lunch scan preview" width={90} height={90} className="rounded-lg border border-white/40 object-cover" />
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-white/30 bg-white/10 p-3 text-sm">
                  <p>最近健康记录</p>
                  {teaRecords.slice(0, 2).map((item) => (
                    <p key={item.id}>
                      奶茶：{new Date(item.teaTimestamp).toLocaleString()} ｜ {item.brand}{item.beverageName ? ` ${item.beverageName}` : ""} {item.iceLevel} ｜ {item.calories ?? 0} kcal
                    </p>
                  ))}
                  {vitalRecords.slice(0, 2).map((item) => (
                    <p key={item.id}>
                      作息：起床 {item.wakeTime} ｜ 入睡 {item.sleepTime}
                    </p>
                  ))}
                  {dietRecords.slice(0, 2).map((item) => (
                    <p key={item.id}>
                      饮食：{item.date} ｜ 早:{item.breakfast || "-"} 中:{item.lunch || "-"} 晚:{item.dinner || "-"}
                    </p>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/10 p-3 text-sm">
                  <p className="mb-2">实验数据看板（近 7 条）</p>
                  <p>
                    KPI：专注均值 {experimentKpis.avgFocus || "-"} ｜ 精力均值 {experimentKpis.avgEnergy || "-"} ｜ 睡眠均值{" "}
                    {experimentKpis.avgSleep || "-"}h
                  </p>
                  <div className="mt-2 space-y-1">
                    {experimentEntries.slice(0, 6).map((entry) => (
                      <p key={entry.id}>
                        {entry.batchId} ｜ {entry.experimenter} ｜ {entry.experimentDate} ｜ 专注 {entry.focusScore}/10 ｜ 精力 {entry.energyScore}/10
                      </p>
                    ))}
                    {experimentEntries.length === 0 && <p>暂无实验台账，点击“保存全部记录”会自动生成一条。</p>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={saveHealthDraft} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                    暂存草稿
                  </button>
                  <button onClick={loadHealthDraft} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                    恢复暂存
                  </button>
                  <button onClick={saveHealthAll} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                    保存全部记录
                  </button>
                </div>
                {healthDraftMessage && <p className="text-sm text-slate-700">{healthDraftMessage}</p>}

                <div className="sticky bottom-0 z-20 -mx-2 mt-2 rounded-t-2xl border border-white/45 bg-slate-900/75 px-2 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={saveHealthDraft} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                      暂存
                    </button>
                    <button onClick={loadHealthDraft} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                      恢复
                    </button>
                    <button onClick={saveHealthAll} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                      保存
                    </button>
                    <button
                      onClick={() => setActiveModule(null)}
                      className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm"
                    >
                      关闭窗口
                    </button>
                  </div>
                </div>
              </div>
              )
            )}


            {activeModule === "period" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">周期记录归档</p>
                  {periodRecords.slice(0, 20).map((item) => (
                    <p key={item.id}>
                      {item.startDate} ｜ 持续 {item.durationDays} 天 ｜ 流量 {item.flowLevel} ｜ {item.symptom || "无备注"}
                    </p>
                  ))}
                  {periodRecords.length === 0 && <p>暂无归档。</p>}
                </div>
              ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    姨妈开始日期
                    <input
                      type="date"
                      value={periodStartDate}
                      onChange={(e) => setPeriodStartDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                    />
                  </label>
                  <label className="text-sm">
                    结束日期
                    <input
                      type="date"
                      value={periodEndDate}
                      onChange={(e) => setPeriodEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                    />
                  </label>
                  <label className="text-sm">
                    流量级别
                    <select
                      value={flowLevel}
                      onChange={(e) => setFlowLevel(e.target.value as "轻" | "中" | "重")}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                    >
                      <option className="text-black" value="轻">
                        偏少
                      </option>
                      <option className="text-black" value="中">
                        正常
                      </option>
                      <option className="text-black" value="重">
                        偏多
                      </option>
                    </select>
                  </label>
                  <label className="text-sm">
                    主要感受
                    <input
                      value={periodSymptom}
                      onChange={(e) => setPeriodSymptom(e.target.value)}
                      placeholder="如：腹痛、乏力、情绪波动"
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-700">自动计算时长：{periodDurationDays} 天（由开始与结束日期计算）</p>

                <div className="rounded-2xl border border-white/35 bg-white/20 p-4 text-sm">
                  <p>{periodInsight.phaseHint}</p>
                  <p className="mt-1">预测下次开始：{periodInsight.nextStartDateLabel}</p>
                </div>

                <button
                  onClick={addPeriodRecord}
                  className="rounded-2xl border border-white/35 bg-white/25 px-4 py-2 font-medium hover:bg-white/35"
                >
                  保存周期记录
                </button>

                <div className="space-y-2">
                  {periodRecords.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-sm">
                      {item.startDate} ｜ 持续 {item.durationDays} 天 ｜ 流量 {item.flowLevel} ｜ {item.symptom || "无备注"}
                    </div>
                  ))}
                </div>
              </div>
              )
            )}

            {activeModule === "gaming" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">游戏进度归档</p>
                  {gameEntries.slice(0, 30).map((entry) => (
                    <p key={entry.id}>
                      {entry.title} ｜ 进度 {entry.progress}% ｜ 状态 {entry.status}
                    </p>
                  ))}
                  {gameEntries.length === 0 && <p>暂无归档。</p>}
                </div>
              ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">记录你的游戏推进路径，避免卡关后忘记当前目标。</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={gameTitle}
                    onChange={(e) => setGameTitle(e.target.value)}
                    placeholder="游戏名称（如：Elden Ring）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={gamePlatform}
                    onChange={(e) => setGamePlatform(e.target.value)}
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  >
                    <option className="text-black">PC</option>
                    <option className="text-black">PS5</option>
                    <option className="text-black">Switch</option>
                    <option className="text-black">Mobile</option>
                    <option className="text-black">Other</option>
                  </select>
                  <label className="text-sm">
                    主线进度: {gameProgress}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={gameProgress}
                      onChange={(e) => setGameProgress(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="text-sm">
                    本次游玩时长（小时）
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={gamePlayHours}
                      onChange={(e) => setGamePlayHours(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                    />
                  </label>
                  <select
                    value={gameStatus}
                    onChange={(e) => setGameStatus(e.target.value as GameProgressEntry["status"])}
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                  >
                    <option className="text-black" value="playing">
                      进行中
                    </option>
                    <option className="text-black" value="paused">
                      暂停中
                    </option>
                    <option className="text-black" value="abandoned">
                      已放弃
                    </option>
                    <option className="text-black" value="completed">
                      已通关
                    </option>
                  </select>
                  <textarea
                    value={gameNextObjective}
                    onChange={(e) => setGameNextObjective(e.target.value)}
                    placeholder="下一目标（如：今晚打完王城下水道并拿到护符）"
                    className="h-20 rounded-xl border border-white/30 bg-white/20 p-2 text-sm outline-none sm:col-span-2"
                  />
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-sm">待办/目标列表</p>
                    <div className="flex gap-2">
                      <input
                        value={gameTodoInput}
                        onChange={(e) => setGameTodoInput(e.target.value)}
                        placeholder="添加一条待办（如：刷到+10锻造石）"
                        className="flex-1 rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                      />
                      <button
                        onClick={addGameDraftTodo}
                        className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm"
                      >
                        添加
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {gameDraftTodos.map((todo) => (
                        <p key={todo.id}>- {todo.text}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={addGameProgressEntry}
                  className="rounded-2xl border border-white/35 bg-white/25 px-4 py-2 font-medium hover:bg-white/35"
                >
                  保存游戏进度
                </button>
                <div className="space-y-2">
                  {gameEntries.length === 0 && (
                    <p className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-slate-700">
                      还没有游戏进度记录，先添加第一条吧。
                    </p>
                  )}
                  {gameEntries.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-sm">
                      {entry.title} ({entry.platform}) ｜ 进度 {entry.progress}% ｜ 时长 {entry.playHours}h ｜ 状态{" "}
                      {entry.status === "playing"
                          ? "进行中"
                          : entry.status === "paused"
                            ? "暂停中"
                            : entry.status === "abandoned"
                              ? "已放弃"
                              : "已通关"}
                      {entry.nextObjective ? ` ｜ 下一步：${entry.nextObjective}` : ""}
                      {entry.todos.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {entry.todos.map((todo) => (
                            <button
                              key={todo.id}
                              onClick={() => toggleGameTodo(entry.id, todo.id)}
                              className="block rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-left text-xs"
                            >
                              {todo.done ? "✅" : "⬜"} {todo.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )
            )}

            {activeModule === "planner" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">计划归档</p>
                  <p>计划 {planItems.length} 条 ｜ 目标 {goals.length} 条 ｜ 提醒 {reminders.length} 条</p>
                  {planItems.slice(0, 20).map((item) => (
                    <p key={item.id}>
                      [{item.scope}] {item.date} ｜ {item.title} ｜ {item.done ? "已完成" : "待完成"}
                    </p>
                  ))}
                </div>
              ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(["day", "week", "month"] as PlanScope[]).map((view) => (
                    <button
                      key={view}
                      onClick={() => setPlannerView(view)}
                      className={`rounded-xl border px-3 py-1 text-sm ${
                        plannerView === view ? "border-white/60 bg-white/35" : "border-white/30 bg-white/20"
                      }`}
                    >
                      {view === "day" ? "日计划" : view === "week" ? "周计划" : "月计划"}
                    </button>
                  ))}
                  <input
                    type="date"
                    value={plannerDate}
                    onChange={(e) => setPlannerDate(e.target.value)}
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-1 text-sm outline-none"
                  />
                </div>

                {plannerView === "month" && (
                  <div className="grid grid-cols-7 gap-2 rounded-2xl border border-white/30 bg-white/15 p-3 text-xs">
                    {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                      <div key={d} className="text-center text-slate-600">
                        {d}
                      </div>
                    ))}
                    {monthMatrix.map((day) => {
                      const dayPlans = planItems.filter((p) => p.date === day.dateKey);
                      const isSelected = day.dateKey === plannerDate;
                      return (
                        <button
                          key={day.dateKey}
                          onClick={() => setPlannerDate(day.dateKey)}
                          className={`rounded-lg border px-2 py-2 text-left ${
                            isSelected ? "border-white/70 bg-white/35" : "border-white/20 bg-white/10"
                          } ${day.inCurrentMonth ? "" : "opacity-55"}`}
                        >
                          <div>{day.dayOfMonth}</div>
                          <div className="text-[10px] text-slate-600">{dayPlans.length} 条</div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="计划标题（如：雅思口语打卡）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                  />
                  <input
                    value={planNote}
                    onChange={(e) => setPlanNote(e.target.value)}
                    placeholder="备注（可选）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 outline-none"
                  />
                </div>

                <button
                  onClick={() => addPlanItem()}
                  className="rounded-2xl border border-white/35 bg-white/25 px-4 py-2 font-medium hover:bg-white/35"
                >
                  添加到{plannerView === "day" ? "日计划" : plannerView === "week" ? "周计划" : "月计划"}
                </button>

                <div className="space-y-2">
                  {plannerItemsForView.length === 0 && (
                    <p className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-slate-700">
                      当前视图暂无计划，先添加一条吧。
                    </p>
                  )}
                  {plannerItemsForView.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => togglePlanDone(item.id)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-left text-sm"
                    >
                      <span className={item.done ? "line-through opacity-70" : ""}>
                        [{item.scope === "day" ? "日" : item.scope === "week" ? "周" : "月"}] {item.title}
                        {item.note ? ` ｜ ${item.note}` : ""}
                      </span>
                      <span>{item.done ? "已完成" : "待完成"}</span>
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">目标计划制定</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      placeholder="目标（如：本月完成 20 次口语训练）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="date"
                      value={goalDate}
                      onChange={(e) => setGoalDate(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <button
                    onClick={addGoal}
                    className="mt-2 rounded-xl border border-white/35 bg-white/25 px-3 py-1 text-sm hover:bg-white/35"
                  >
                    添加目标
                  </button>
                  <div className="mt-2 space-y-2">
                    {goals.slice(0, 6).map((goal) => (
                      <button
                        key={goal.id}
                        onClick={() => advanceGoal(goal.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-left text-sm"
                      >
                        <span className={goal.done ? "line-through opacity-70" : ""}>
                          {goal.title} ｜ 截止 {goal.targetDate}
                        </span>
                        <span>{goal.progress}%</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">提醒列表</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={reminderText}
                      onChange={(e) => setReminderText(e.target.value)}
                      placeholder="提醒内容（如：21:30 停止摄入咖啡因）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="time"
                      value={reminderAt}
                      onChange={(e) => setReminderAt(e.target.value)}
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <button
                    onClick={addReminder}
                    className="mt-2 rounded-xl border border-white/35 bg-white/25 px-3 py-1 text-sm hover:bg-white/35"
                  >
                    添加提醒
                  </button>
                  <div className="mt-2 space-y-2">
                    {reminders.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => toggleReminderDone(item.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-left text-sm"
                      >
                        <span className={item.done ? "line-through opacity-70" : ""}>
                          {item.remindAt} ｜ {item.text}
                        </span>
                        <span>{item.done ? "已处理" : "待提醒"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              )
            )}

            {activeModule === "shopping" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">购物归档</p>
                  {shoppingItems.slice(0, 30).map((item) => (
                    <p key={item.id}>
                      {item.name} ｜ {item.status} {typeof item.price === "number" ? `｜ ￥${item.price}` : ""}
                    </p>
                  ))}
                  {shoppingItems.length === 0 && <p>暂无归档。</p>}
                </div>
              ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">记录想买的东西，可附带图片参考（例如配色、型号、外观）。</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={shoppingName}
                    onChange={(e) => setShoppingName(e.target.value)}
                    placeholder="想买什么（如：无线耳机）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={shoppingNote}
                    onChange={(e) => setShoppingNote(e.target.value)}
                    placeholder="备注（预算、型号）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    value={shoppingPrice}
                    onChange={(e) => setShoppingPrice(e.target.value)}
                    placeholder="价格（元）"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                  />
                </div>
                <div className="rounded-xl border border-white/30 bg-white/15 p-3">
                  <label className="text-sm">
                    插入图片
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleShoppingImageUpload}
                      className="mt-2 block w-full text-sm"
                    />
                  </label>
                  {shoppingImageDataUrl && (
                    <Image
                      src={shoppingImageDataUrl}
                      alt="shopping preview"
                      width={112}
                      height={112}
                      className="mt-3 h-28 w-28 rounded-lg border border-white/40 object-cover"
                    />
                  )}
                </div>
                <button
                  onClick={addShoppingItem}
                  className="rounded-2xl border border-white/35 bg-white/25 px-4 py-2 font-medium hover:bg-white/35"
                >
                  添加到购物清单
                </button>
                <div className="space-y-2">
                  {shoppingItems.length === 0 && (
                    <p className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-slate-700">
                      暂无清单项，先添加一个想买的东西吧。
                    </p>
                  )}
                  {shoppingItems.slice(0, 20).map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className={item.status !== "pending" ? "line-through opacity-70" : ""}>
                          {item.name}
                          {item.note ? ` ｜ ${item.note}` : ""}
                          {typeof item.price === "number" ? ` ｜ ￥${item.price}` : ""}
                          {item.imageDataUrl ? " ｜ 已附图" : ""}
                        </span>
                        <span>
                          {item.status === "pending"
                            ? "待处理"
                            : item.status === "bought"
                              ? "买了"
                              : item.status === "sold"
                                ? "卖掉了"
                                : "不买了"}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setShoppingStatus(item.id, "bought")}
                          className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                        >
                          买了
                        </button>
                        <button
                          onClick={() => setShoppingStatus(item.id, "sold")}
                          className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                        >
                          卖掉了
                        </button>
                        <button
                          onClick={() => setShoppingStatus(item.id, "cancelled")}
                          className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                        >
                          不买了
                        </button>
                        <button
                          onClick={() => setShoppingStatus(item.id, "pending")}
                          className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                        >
                          设为待处理
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )
            )}

            {activeModule === "archive" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">文件夹管理</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={folderNameInput}
                      onChange={(e) => setFolderNameInput(e.target.value)}
                      placeholder="文件夹名（如：摄影）"
                      className="lab-input"
                    />
                    <input
                      value={folderDescInput}
                      onChange={(e) => setFolderDescInput(e.target.value)}
                      placeholder="文件夹说明"
                      className="lab-input"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const id = createKnowledgeFolder(folderNameInput, folderDescInput);
                      if (id) {
                        setFolderNameInput("");
                        setFolderDescInput("");
                        setSaveNotice("创建完成：文件夹已加入应用矩阵");
                      }
                    }}
                    className="mt-2 rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm"
                  >
                    新建文件夹
                  </button>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">输入并归类</p>
                  <div className="space-y-2">
                    <input value={archiveTitle} onChange={(e) => setArchiveTitle(e.target.value)} placeholder="标题" className="lab-input" />
                    <textarea
                      value={archiveContent}
                      onChange={(e) => setArchiveContent(e.target.value)}
                      placeholder="粘贴小红书笔记、截图文字、心得..."
                      className="h-28 w-full rounded-xl border border-white/30 bg-white/45 p-3 text-gray-800 outline-none"
                    />
                    <select value={manualFolderId} onChange={(e) => setManualFolderId(e.target.value)} className="lab-input">
                      <option value="auto">自动归类（AI关键词）</option>
                      {knowledgeFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          手动：{folder.name}
                        </option>
                      ))}
                    </select>
                    <input type="file" accept="image/*" onChange={handleArchiveImageUpload} className="block w-full text-sm" />
                    {archiveImage && <Image src={archiveImage} alt="archive preview" width={90} height={90} className="rounded-lg border border-white/40 object-cover" />}
                    <button onClick={saveArchiveEntry} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                      保存并归类
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">检索</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)} className="lab-input">
                      <option value="all">全部文件夹</option>
                      {knowledgeFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={knowledgeSearch}
                      onChange={(e) => setKnowledgeSearch(e.target.value)}
                      placeholder="检索关键词（如：打光 / 滤镜）"
                      className="lab-input"
                    />
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {filteredKnowledgeEntries.slice(0, 30).map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/25 bg-white/12 p-2">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-gray-700">
                          {knowledgeFolders.find((f) => f.id === item.folderId)?.name || "未归类"} ｜ {item.source === "quick" ? "快速输入" : "归纳输入"}
                        </p>
                        <p className="mt-1 line-clamp-3 text-gray-800">{item.content}</p>
                        {item.imageDataUrl && (
                          <Image src={item.imageDataUrl} alt="knowledge" width={84} height={84} className="mt-2 rounded border border-white/40 object-cover" />
                        )}
                      </div>
                    ))}
                    {filteredKnowledgeEntries.length === 0 && <p className="text-slate-600">没有匹配内容。</p>}
                  </div>
                </div>
              </div>
            )}

            {activeModule === "quick-input" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">快速输入归档</p>
                  {knowledgeEntries
                    .filter((x) => x.source === "quick")
                    .slice(0, 30)
                    .map((item) => (
                      <p key={item.id}>
                        {item.title} ｜ {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    ))}
                </div>
              ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">这里是“先记下来”区域，不强制分类，后续可在文件夹归纳里整理。</p>
                <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="标题（可空）" className="lab-input" />
                <textarea
                  value={quickContent}
                  onChange={(e) => setQuickContent(e.target.value)}
                  placeholder="只管输入：文字、观点、网址、想法都可以..."
                  className="h-52 w-full rounded-2xl border border-white/30 bg-white/45 p-4 text-gray-800 outline-none"
                />
                <input type="file" accept="image/*" onChange={handleQuickImageUpload} className="block w-full text-sm" />
                {quickImage && <Image src={quickImage} alt="quick preview" width={96} height={96} className="rounded-lg border border-white/40 object-cover" />}
                <button onClick={saveQuickEntry} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                  收藏到输入池
                </button>
              </div>
              )
            )}

            {activeModule === "safety" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p className="font-medium">安全守则归档</p>
                  {safetyRules.map((rule) => (
                    <p key={rule.id}>- {rule.text}</p>
                  ))}
                </div>
              ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">生活安全语录</p>
                  <div className="flex gap-2">
                    <input
                      value={safetyRuleDraft}
                      onChange={(e) => setSafetyRuleDraft(e.target.value)}
                      placeholder="添加一条守则（如：雨天楼梯不看手机）"
                      className="lab-input"
                    />
                    <button onClick={addSafetyRule} className="rounded-xl border border-white/35 bg-white/25 px-3 py-2 text-sm">
                      添加
                    </button>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    {safetyRules.map((rule) => (
                      <p key={rule.id}>- {rule.text}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">@触发提示预览</p>
                  <textarea
                    value={safetyInput}
                    onChange={(e) => setSafetyInput(e.target.value)}
                    placeholder="输入 @ 会出现安全语录建议..."
                    className="h-24 w-full rounded-xl border border-white/30 bg-white/45 p-3 text-gray-800 outline-none"
                  />
                  {safetySuggestions.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-xl border border-white/25 bg-white/15 p-2 text-sm">
                      {safetySuggestions.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSafetyInput((prev) => `${prev}\n${item.text}`)}
                          className="block w-full rounded-lg px-2 py-1 text-left hover:bg-white/20"
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              )
            )}

            {activeModule === "memory" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">实验日历</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMemoryDate(shiftMonth(memoryDate, -1))}
                        className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                      >
                        上月
                      </button>
                      <button
                        onClick={() => setMemoryDate(shiftMonth(memoryDate, 1))}
                        className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-xs"
                      >
                        下月
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-2 rounded-2xl border border-white/20 bg-white/10 p-3 text-xs">
                    {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                      <div key={d} className="text-center text-slate-600">
                        {d}
                      </div>
                    ))}
                    {memoryMonthMatrix.map((day) => {
                      const digest = memoryDigestByDate[day.dateKey];
                      const selected = day.dateKey === memoryDate;
                      return (
                        <button
                          key={day.dateKey}
                          onClick={() => setMemoryDate(day.dateKey)}
                          className={`rounded-lg border p-2 text-left ${
                            selected ? "border-white/70 bg-white/30" : "border-white/20 bg-white/10"
                          } ${day.inCurrentMonth ? "" : "opacity-50"}`}
                        >
                          <div>{day.dayOfMonth}</div>
                          <div className="mt-1 text-[10px] text-slate-700">{digest?.icon || "·"}</div>
                          <div className="text-[10px] text-slate-500">{digest?.label || "无记录"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">当日完整记录 · {memoryDate}</p>
                  <div className="mb-3 rounded-xl border border-white/25 bg-white/15 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-700">一段时间事件</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={memoryRangeTitle}
                        onChange={(e) => setMemoryRangeTitle(e.target.value)}
                        placeholder="事件名称（如：期末复习周）"
                        className="rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm outline-none sm:col-span-2"
                      />
                      <label className="text-xs text-slate-600">
                        时间范围
                        <select
                          value={memoryRangeDateType}
                          onChange={(e) => {
                            const v = e.target.value as MemoryRangeEvent["dateType"];
                            setMemoryRangeDateType(v);
                            if (v === "single") {
                              setMemoryRangeEndDate(memoryRangeStartDate);
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm"
                        >
                          <option value="single">某一天</option>
                          <option value="range">一段时间</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-600">
                        事件心情
                        <select
                          value={memoryRangeMood}
                          onChange={(e) => setMemoryRangeMood(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm"
                        >
                          <option>平稳</option>
                          <option>开心</option>
                          <option>焦虑</option>
                          <option>疲惫</option>
                          <option>低落</option>
                          <option>满足</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-600 sm:col-span-2">
                        {memoryRangeDateType === "single" ? "发生日期" : "开始日期"}
                        <input
                          type="date"
                          value={memoryRangeStartDate}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMemoryRangeStartDate(v);
                            if (memoryRangeDateType === "single") {
                              setMemoryRangeEndDate(v);
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm outline-none"
                        />
                      </label>
                      {memoryRangeDateType === "range" && (
                        <label className="text-xs text-slate-600 sm:col-span-2">
                          结束日期
                          <input
                            type="date"
                            value={memoryRangeEndDate}
                            onChange={(e) => setMemoryRangeEndDate(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm outline-none"
                          />
                        </label>
                      )}
                      <input
                        value={memoryRangeNote}
                        onChange={(e) => setMemoryRangeNote(e.target.value)}
                        placeholder="备注（可选）"
                        className="rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm outline-none sm:col-span-2"
                      />
                    </div>
                    <button onClick={addMemoryRangeEvent} className="mt-2 rounded-lg border border-white/35 bg-white/25 px-3 py-1 text-xs">
                      添加区间事件
                    </button>
                    {activeMemoryRangeEvents.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-slate-700">
                        {activeMemoryRangeEvents.map((item) => (
                          <p key={item.id}>
                            {item.title} ｜ {formatMemoryEventDate(item)} ｜ 心情：{item.mood ?? "平稳"}
                            {item.note ? ` ｜ ${item.note}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-3 rounded-2xl border-2 border-white/50 bg-white/30 p-4 shadow-[0_4px_24px_rgba(15,23,42,0.08)]">
                    <p className="text-sm font-semibold text-slate-900">记忆档案管理（可编辑）</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      这里可修改已保存的记忆事件。若列表为空，请先在上方「一段时间事件」里填写并点击「添加区间事件」。
                    </p>
                    {memoryRangeEvents.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-white/50 bg-white/15 px-3 py-4 text-center text-xs text-slate-600">
                        当前还没有任何记忆事件，添加后会出现在这里。
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {memoryRangeEvents.slice(0, 20).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-400/25 bg-white/50 p-3 text-xs text-slate-800 shadow-sm"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="font-medium text-slate-900">{item.title}</div>
                              <button
                                onClick={() => setMemoryRangeEvents((prev) => prev.filter((entry) => entry.id !== item.id))}
                                className="rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                              >
                                删除
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label>
                                时间范围
                                <select
                                  value={item.dateType ?? "range"}
                                  onChange={(e) =>
                                    updateMemoryRangeEvent(item.id, (current) => {
                                      const dateType = e.target.value as MemoryRangeEvent["dateType"];
                                      return {
                                        ...current,
                                        dateType,
                                        endDate: dateType === "single" ? current.startDate : current.endDate,
                                      };
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/25 bg-white/30 px-2 py-1 text-xs"
                                >
                                  <option value="single">某一天</option>
                                  <option value="range">一段时间</option>
                                </select>
                              </label>
                              <label>
                                心情
                                <select
                                  value={item.mood ?? "平稳"}
                                  onChange={(e) => updateMemoryRangeEvent(item.id, (current) => ({ ...current, mood: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-white/25 bg-white/30 px-2 py-1 text-xs"
                                >
                                  <option>平稳</option>
                                  <option>开心</option>
                                  <option>焦虑</option>
                                  <option>疲惫</option>
                                  <option>低落</option>
                                  <option>满足</option>
                                </select>
                              </label>
                              <label>
                                {(item.dateType ?? "range") === "single" ? "发生日期" : "开始日期"}
                                <input
                                  type="date"
                                  value={item.startDate}
                                  onChange={(e) =>
                                    updateMemoryRangeEvent(item.id, (current) => {
                                      const v = e.target.value;
                                      return {
                                        ...current,
                                        startDate: v,
                                        endDate: (current.dateType ?? "range") === "single" ? v : current.endDate,
                                      };
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-white/25 bg-white/30 px-2 py-1 text-xs"
                                />
                              </label>
                              {(item.dateType ?? "range") === "range" && (
                                <label>
                                  结束日期
                                  <input
                                    type="date"
                                    value={item.endDate}
                                    onChange={(e) => updateMemoryRangeEvent(item.id, (current) => ({ ...current, endDate: e.target.value }))}
                                    className="mt-1 w-full rounded-lg border border-white/25 bg-white/30 px-2 py-1 text-xs"
                                  />
                                </label>
                              )}
                              <label className="sm:col-span-2">
                                备注
                                <input
                                  value={item.note}
                                  onChange={(e) => updateMemoryRangeEvent(item.id, (current) => ({ ...current, note: e.target.value }))}
                                  className="mt-1 w-full rounded-lg border border-white/25 bg-white/30 px-2 py-1 text-xs"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-2 grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-slate-600">
                      当日情绪标签
                      <select
                        value={memoryMoodByDate[memoryDate] ?? "平稳"}
                        onChange={(e) =>
                          setMemoryMoodByDate((prev) => ({
                            ...prev,
                            [memoryDate]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm"
                      >
                        <option>平稳</option>
                        <option>开心</option>
                        <option>焦虑</option>
                        <option>疲惫</option>
                        <option>低落</option>
                        <option>满足</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">
                      当天天气
                      <select
                        value={memoryWeatherByDate[memoryDate] ?? "晴"}
                        onChange={(e) =>
                          setMemoryWeatherByDate((prev) => ({
                            ...prev,
                            [memoryDate]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm"
                      >
                        <option>晴</option>
                        <option>阴</option>
                        <option>多云</option>
                        <option>小雨</option>
                        <option>大雨</option>
                        <option>雪</option>
                        <option>雾</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">
                      当天地点
                      <input
                        value={memoryLocationByDate[memoryDate] ?? ""}
                        onChange={(e) =>
                          setMemoryLocationByDate((prev) => ({
                            ...prev,
                            [memoryDate]: e.target.value,
                          }))
                        }
                        placeholder="例如：学校 / 家 / 商场"
                        className="mt-1 w-full rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>情绪标签：{memoryMoodByDate[memoryDate] ?? "平稳"}</p>
                    <p>天气：{memoryWeatherByDate[memoryDate] ?? "晴"}</p>
                    <p>地点：{memoryLocationByDate[memoryDate] || "未填写"}</p>
                    <p>奶茶记录：{memoryDayData.teaCount} 次</p>
                    <p>饮食记录：{memoryDayData.dietCount} 条</p>
                    <p>生理记录：{memoryDayData.vitalsCount} 条</p>
                    <p>周期记录：{memoryDayData.periodCount} 条</p>
                    <p>计划记录：{memoryDayData.planCount} 条</p>
                    <p>购物记录：{memoryDayData.shoppingCount} 条</p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {memoryDayRecords.tea.map((item) => (
                      <p key={item.id}>🧋 {item.brand}{item.beverageName ? ` ${item.beverageName}` : ""} {item.iceLevel} ｜ 糖度 {item.sugarLevel} ｜ {item.calories ?? 0} kcal</p>
                    ))}
                    {memoryDayRecords.diet.map((item) => (
                      <p key={item.id}>🍱 早:{item.breakfast || "-"} 中:{item.lunch || "-"} 晚:{item.dinner || "-"}</p>
                    ))}
                    {memoryDayRecords.vitals.map((item) => (
                      <p key={item.id}>🫀 起床 {item.wakeTime} ｜ 入睡 {item.sleepTime}</p>
                    ))}
                    {memoryDayRecords.period.map((item) => (
                      <p key={item.id}>🌙 周期：{item.flowLevel} ｜ {item.symptom || "无备注"}</p>
                    ))}
                    {memoryDayRecords.plan.map((item) => (
                      <p key={item.id}>🗓️ {item.title} ｜ {item.done ? "已完成" : "待完成"}</p>
                    ))}
                    {memoryDayRecords.shopping.map((item) => (
                      <p key={item.id}>🛒 {item.name} ｜ {item.status}</p>
                    ))}
                    {memoryDayData.teaCount +
                      memoryDayData.dietCount +
                      memoryDayData.vitalsCount +
                      memoryDayData.periodCount +
                      memoryDayData.planCount +
                      memoryDayData.shoppingCount ===
                      0 && <p className="text-slate-600">这一天还没有记录。</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/30 bg-white/15 p-4">
                  <p className="mb-2 text-sm font-semibold">往年总览</p>
                  <div className="space-y-2">
                    {yearOverview.length === 0 && <p className="text-sm text-slate-700">暂无历史数据。</p>}
                    {yearOverview.map((year) => (
                      <div key={year.year} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm">
                        <p className="font-medium">{year.year} 年</p>
                        <p>
                          奶茶 {year.teaCount} 次 ｜ 饮食 {year.dietCount} 条 ｜ 生理 {year.vitalsCount} 条 ｜ 周期 {year.periodCount} 条
                        </p>
                        <p>
                          计划 {year.planCount} 条 ｜ 购物 {year.shoppingCount} 条 ｜ 目标完成 {year.goalDoneCount} 个 ｜ 提醒完成{" "}
                          {year.reminderDoneCount} 条
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeModule === "reflection" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p>标题：{reflectionTitle || "未命名"}</p>
                  <p>分类：{reflectionCategory}</p>
                  <p className="whitespace-pre-wrap">{readingReflection || "暂无内容"}</p>
                </div>
              ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={reflectionTitle}
                    onChange={(e) => setReflectionTitle(e.target.value)}
                    placeholder="读后感标题"
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={reflectionCategory}
                    onChange={(e) => setReflectionCategory(e.target.value)}
                    className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                  >
                    <option className="text-black" value="music">
                      music
                    </option>
                    <option className="text-black" value="film">
                      film
                    </option>
                    <option className="text-black" value="book">
                      book
                    </option>
                    <option className="text-black" value="other">
                      other
                    </option>
                  </select>
                </div>
                <textarea
                  className="h-52 w-full rounded-2xl border border-white/30 bg-white/20 p-4 outline-none"
                  placeholder="写下今天的读后感（书籍 / 文章 / 视频都可）..."
                  value={readingReflection}
                  onChange={(e) => setReadingReflection(e.target.value)}
                />
              </div>
              )
            )}

            {activeModule === "essay" && (
              currentModuleMode === "archive" ? (
                <div className="space-y-2 text-sm rounded-2xl border border-white/30 bg-white/15 p-3">
                  <p>情感倾向：{emotionLabel(lifeEmotion)}</p>
                  <p className="whitespace-pre-wrap">{lifeEssay || "暂无内容"}</p>
                </div>
              ) : (
              <div className="space-y-3">
                <select
                  value={lifeEmotion}
                  onChange={(e) => setLifeEmotion(e.target.value)}
                  className="w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                >
                  <option className="text-black" value="positive">
                    正向
                  </option>
                  <option className="text-black" value="neutral">
                    中性
                  </option>
                  <option className="text-black" value="negative">
                    负向
                  </option>
                  <option className="text-black" value="mixed">
                    复杂/混合
                  </option>
                </select>
                <textarea
                  className="h-52 w-full rounded-2xl border border-white/30 bg-white/20 p-4 outline-none"
                  placeholder="写下今天的生命感悟随笔..."
                  value={lifeEssay}
                  onChange={(e) => setLifeEssay(e.target.value)}
                />
              </div>
              )
            )}

            {activeModule?.startsWith("custom-") && (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  {allModules.find((item) => item.id === activeModule)?.description || "自定义模块内容记录区"}
                </p>
                <textarea
                  value={customModuleContents[activeModule] ?? ""}
                  onChange={(e) =>
                    setCustomModuleContents((prev) => ({
                      ...prev,
                      [activeModule]: e.target.value,
                    }))
                  }
                  className="h-72 w-full rounded-2xl border border-white/30 bg-white/20 p-4 outline-none"
                  placeholder="在这里记录这个自定义模块的数据..."
                />
              </div>
            )}

            {activeModule === "store" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">在这里管理手册模块开关，保持你的实验流程简洁聚焦。</p>
                {allModules.map((module) => (
                  <div
                    key={module.id}
                    className="flex items-center justify-between rounded-2xl border border-white/30 bg-white/15 px-4 py-3"
                  >
                    <span>
                      {module.icon} {module.title}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleModule(module.id)}
                        disabled={module.id === "store"}
                        className="rounded-xl border border-white/30 bg-white/20 px-3 py-1 text-sm disabled:opacity-60"
                      >
                        {enabledModules[module.id] ? "已启用" : "已隐藏"}
                      </button>
                      {module.isCustom && (
                        <button
                          onClick={() => removeCustomModule(module.id)}
                          className="rounded-xl border border-red-200/40 bg-red-400/20 px-3 py-1 text-sm"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/30 bg-white/12 p-3">
                  <p className="mb-2 text-sm font-semibold">创建自定义模块</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={customModuleTitle}
                      onChange={(e) => setCustomModuleTitle(e.target.value)}
                      placeholder="模块名称（如：复习错题）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={customModuleIcon}
                      onChange={(e) => setCustomModuleIcon(e.target.value)}
                      placeholder="图标（如：🧩）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={customModuleDescription}
                      onChange={(e) => setCustomModuleDescription(e.target.value)}
                      placeholder="模块说明（可选）"
                      className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm outline-none sm:col-span-2"
                    />
                  </div>
                  <button onClick={createCustomModule} className="mt-2 rounded-xl border border-white/35 bg-white/25 px-3 py-1 text-sm">
                    添加模块
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function estimateTeaCalories(input: {
  cupSize: "S" | "M" | "L";
  sugarLevel: number;
  addTopping: boolean;
  iceLevel: string;
}) {
  const cupBase = input.cupSize === "S" ? 140 : input.cupSize === "M" ? 190 : 250;
  const sugarWeight = sugarFactor[Math.max(1, Math.min(10, input.sugarLevel))];
  const topping = input.addTopping ? 80 : 0;
  const iceAdjust =
    input.iceLevel === "热" ? -20 : input.iceLevel === "温" ? -10 : input.iceLevel === "去冰" ? 25 : input.iceLevel === "正常冰" ? 0 : 10;
  return Math.round(cupBase * sugarWeight + topping + iceAdjust);
}

function estimateMealCalories(text: string) {
  const input = text.trim().toLowerCase();
  if (!input) {
    return 0;
  }
  let total = 120;
  const map: Array<[string, number]> = [
    ["米饭", 180],
    ["面", 220],
    ["面包", 160],
    ["鸡蛋", 90],
    ["鸡胸", 180],
    ["牛肉", 240],
    ["猪肉", 280],
    ["鱼", 170],
    ["沙拉", 130],
    ["奶茶", 320],
    ["炸鸡", 420],
    ["汉堡", 450],
    ["水果", 90],
  ];
  map.forEach(([keyword, kcal]) => {
    if (input.includes(keyword)) {
      total += kcal;
    }
  });
  return Math.min(1600, Math.max(80, total));
}

function calcDaySpan(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 1;
  }
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function estimateCaffeineIntensity(input: { cupSize: "S" | "M" | "L"; teaTimestamp: string }) {
  const hour = new Date(input.teaTimestamp).getHours();
  const sizeBase = input.cupSize === "S" ? 4 : input.cupSize === "M" ? 6 : 8;
  const latePenalty = hour >= 20 ? 2 : hour >= 17 ? 1 : 0;
  return Math.min(10, sizeBase + latePenalty);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildPeriodInsight(records: PeriodEntry[]) {
  if (records.length === 0) {
    return {
      nextStartDateLabel: "暂无数据",
      phaseHint: "姨妈模块已启用：建议先记录最近一次开始日期。",
      isPms: false,
      studyIntensityLabel: "中",
    };
  }

  const sorted = [...records].sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));
  const latest = sorted[0];
  const avgCycle = 28;
  const latestStart = new Date(latest.startDate);
  const nextStart = addDays(latestStart, avgCycle);
  const today = new Date();
  const diffDays = Math.round((today.getTime() - latestStart.getTime()) / (1000 * 60 * 60 * 24));

  let phaseHint = "当前处于周期中段，适合安排常规学习和训练任务。";
  let isPms = false;
  let studyIntensityLabel = "中高";
  if (diffDays >= 0 && diffDays <= latest.durationDays) {
    phaseHint = "当前可能处于经期，建议降低强度、注意补铁和热敷休息。";
    studyIntensityLabel = "低";
  } else if (diffDays >= 21 && diffDays <= 27) {
    phaseHint = "当前接近经前期，建议减少高糖奶茶并保持早睡。";
    isPms = true;
    studyIntensityLabel = "中低";
  } else if (diffDays >= 6 && diffDays <= 13) {
    phaseHint = "当前可能处于卵泡期，精力通常较稳定，适合推进重点任务。";
    studyIntensityLabel = "高";
  }

  return {
    nextStartDateLabel: nextStart.toLocaleDateString(),
    phaseHint,
    isPms,
    studyIntensityLabel,
  };
}

function buildLifeOptimizationTips(input: {
  teaRecords: TeaEntry[];
  vitalRecords: VitalsEntry[];
  periodInsight: { phaseHint: string };
  predictionDelay: number;
}) {
  const { teaRecords, vitalRecords, periodInsight, predictionDelay } = input;
  const recentTea = teaRecords.slice(0, 10);
  const avgSugar =
    recentTea.length > 0 ? recentTea.reduce((sum, item) => sum + item.sugarLevel, 0) / recentTea.length : 0;
  const lateTeaCount = recentTea.filter((item) => new Date(item.teaTimestamp).getHours() >= 20).length;
  const avgWakeMins =
    vitalRecords.length > 0
      ? vitalRecords
          .slice(0, 10)
          .reduce((sum, item) => sum + toMinutes(item.wakeTime), 0) / Math.min(10, vitalRecords.length)
      : 0;

  const tips: string[] = [];

  if (avgSugar >= 7) {
    tips.push("过去记录中糖度偏高，建议默认降到 5-6 分糖。");
  } else {
    tips.push("糖度控制较稳，可继续保持当前甜度策略。");
  }

  if (lateTeaCount >= 3) {
    tips.push("晚间饮用次数偏多，建议把奶茶时间尽量提前到 19:30 前。");
  }

  if (predictionDelay >= 30) {
    tips.push("睡眠模型提示起床延迟风险较高，今晚优先选择无糖或小杯。");
  }

  if (avgWakeMins > 8 * 60) {
    tips.push("近期平均起床偏晚，建议设置固定起床锚点（如 07:30）连续执行 7 天。");
  }

  tips.push(`周期建议：${periodInsight.phaseHint}`);
  return tips.slice(0, 5);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return 0;
  }
  return h * 60 + m;
}

function filterPlansByView(items: PlanItem[], selectedDate: string, view: PlanScope) {
  const selected = new Date(selectedDate);
  if (Number.isNaN(selected.getTime())) {
    return [];
  }

  if (view === "day") {
    return items.filter((item) => item.date === selectedDate);
  }

  if (view === "week") {
    const weekStart = startOfWeek(selected);
    const weekEnd = addDays(weekStart, 6);
    return items.filter((item) => {
      const d = new Date(item.date);
      return d >= weekStart && d <= weekEnd;
    });
  }

  return items.filter((item) => {
    const d = new Date(item.date);
    return d.getFullYear() === selected.getFullYear() && d.getMonth() === selected.getMonth();
  });
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + mondayOffset);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildMonthMatrix(selectedDate: string) {
  const date = new Date(selectedDate);
  if (Number.isNaN(date.getTime())) {
    return [];
  }
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((firstWeekday + lastDay.getDate()) / 7) * 7;

  const cells: { dateKey: string; dayOfMonth: number; inCurrentMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const day = new Date(year, month, i - firstWeekday + 1);
    cells.push({
      dateKey: day.toISOString().slice(0, 10),
      dayOfMonth: day.getDate(),
      inCurrentMonth: day.getMonth() === month,
    });
  }
  return cells;
}

function shiftMonth(dateKey: string, diff: number) {
  const date = new Date(dateKey);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const shifted = new Date(date.getFullYear(), date.getMonth() + diff, 1);
  return shifted.toISOString().slice(0, 10);
}

function toDateKey(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toISOString().slice(0, 10);
}

function toYear(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return "未知";
  }
  return String(d.getFullYear());
}

function buildMemoryDayData(
  dateKey: string,
  data: {
    teaRecords: TeaEntry[];
    vitalRecords: VitalsEntry[];
    dietRecords: DietEntry[];
    periodRecords: PeriodEntry[];
    planItems: PlanItem[];
    shoppingItems: ShoppingItem[];
  },
) {
  return {
    teaCount: data.teaRecords.filter((item) => toDateKey(item.teaTimestamp) === dateKey).length,
    vitalsCount: data.vitalRecords.filter((item) => toDateKey(item.createdAt) === dateKey).length,
    dietCount: data.dietRecords.filter((item) => toDateKey(item.date) === dateKey).length,
    periodCount: data.periodRecords.filter((item) => toDateKey(item.startDate) === dateKey).length,
    planCount: data.planItems.filter((item) => toDateKey(item.date) === dateKey).length,
    shoppingCount: data.shoppingItems.filter((item) => toDateKey(item.createdAt) === dateKey).length,
  };
}

function buildMemoryDigestByDate(data: {
  teaRecords: TeaEntry[];
  vitalRecords: VitalsEntry[];
  dietRecords: DietEntry[];
  periodRecords: PeriodEntry[];
  planItems: PlanItem[];
  shoppingItems: ShoppingItem[];
}) {
  const counter: Record<string, { tea: number; diet: number; vitals: number; period: number; plan: number; shopping: number }> = {};
  const ensure = (k: string) => {
    if (!counter[k]) {
      counter[k] = { tea: 0, diet: 0, vitals: 0, period: 0, plan: 0, shopping: 0 };
    }
    return counter[k];
  };
  data.teaRecords.forEach((x) => ensure(toDateKey(x.teaTimestamp)).tea++);
  data.dietRecords.forEach((x) => ensure(toDateKey(x.date)).diet++);
  data.vitalRecords.forEach((x) => ensure(toDateKey(x.createdAt)).vitals++);
  data.periodRecords.forEach((x) => ensure(toDateKey(x.startDate)).period++);
  data.planItems.forEach((x) => ensure(toDateKey(x.date)).plan++);
  data.shoppingItems.forEach((x) => ensure(toDateKey(x.createdAt)).shopping++);

  const digest: Record<string, { icon: string; label: string }> = {};
  Object.keys(counter).forEach((day) => {
    const c = counter[day];
    const total = c.tea + c.diet + c.vitals + c.period + c.plan + c.shopping;
    let icon = "🧪";
    if (c.plan >= 3) {
      icon = "✅";
    } else if (c.tea >= 2) {
      icon = "🧋";
    } else if (c.shopping >= 2) {
      icon = "🛒";
    } else if (c.period > 0) {
      icon = "🌙";
    } else if (c.diet > 0) {
      icon = "🍱";
    }
    digest[day] = { icon, label: `${total}条记录` };
  });
  return digest;
}

function buildYearOverview(data: {
  teaRecords: TeaEntry[];
  vitalRecords: VitalsEntry[];
  dietRecords: DietEntry[];
  periodRecords: PeriodEntry[];
  planItems: PlanItem[];
  shoppingItems: ShoppingItem[];
  goals: GoalItem[];
  reminders: ReminderItem[];
}) {
  const map = new Map<
    string,
    {
      year: string;
      teaCount: number;
      vitalsCount: number;
      dietCount: number;
      periodCount: number;
      planCount: number;
      shoppingCount: number;
      goalDoneCount: number;
      reminderDoneCount: number;
    }
  >();

  const ensure = (year: string) => {
    if (!map.has(year)) {
      map.set(year, {
        year,
        teaCount: 0,
        vitalsCount: 0,
        dietCount: 0,
        periodCount: 0,
        planCount: 0,
        shoppingCount: 0,
        goalDoneCount: 0,
        reminderDoneCount: 0,
      });
    }
    return map.get(year)!;
  };

  data.teaRecords.forEach((item) => {
    ensure(toYear(item.teaTimestamp)).teaCount += 1;
  });
  data.vitalRecords.forEach((item) => {
    ensure(toYear(item.createdAt)).vitalsCount += 1;
  });
  data.dietRecords.forEach((item) => {
    ensure(toYear(item.date)).dietCount += 1;
  });
  data.periodRecords.forEach((item) => {
    ensure(toYear(item.startDate)).periodCount += 1;
  });
  data.planItems.forEach((item) => {
    ensure(toYear(item.date)).planCount += 1;
  });
  data.shoppingItems.forEach((item) => {
    ensure(toYear(item.createdAt)).shoppingCount += 1;
  });

  const currentYear = String(new Date().getFullYear());
  const currentBucket = ensure(currentYear);
  currentBucket.goalDoneCount = data.goals.filter((item) => item.done).length;
  currentBucket.reminderDoneCount = data.reminders.filter((item) => item.done).length;

  return [...map.values()].sort((a, b) => Number(b.year) - Number(a.year));
}

function parseTeaFromOcrText(text: string): {
  brand?: string;
  beverageName?: string;
  sugarLevel?: number;
  cupSize?: "S" | "M" | "L";
  iceLevel?: string;
} {
  const brands = ["霸王茶姬", "喜茶", "奈雪", "沪上阿姨", "古茗", "茶百道", "蜜雪冰城"];
  const brand = brands.find((item) => text.includes(item));
  const beverageCandidates = [
    "伯牙绝弦",
    "青青糯山",
    "桂馥兰香",
    "抹茶",
    "芝士奶盖",
    "杨枝甘露",
    "茉莉奶绿",
    "乌龙奶茶",
    "生椰",
    "葡萄",
    "柠檬",
  ];
  const beverageName = beverageCandidates.find((item) => text.includes(item));

  const sugarRules: Array<{ key: string; value: number }> = [
    { key: "无糖", value: 1 },
    { key: "三分糖", value: 3 },
    { key: "五分糖", value: 5 },
    { key: "七分糖", value: 7 },
    { key: "全糖", value: 10 },
  ];
  const sugarMatch = sugarRules.find((item) => text.includes(item.key));

  let cupSize: "S" | "M" | "L" | undefined;
  if (text.includes("大杯")) {
    cupSize = "L";
  } else if (text.includes("中杯")) {
    cupSize = "M";
  } else if (text.includes("小杯")) {
    cupSize = "S";
  }

  let iceLevel: string | undefined;
  if (text.includes("热")) {
    iceLevel = "热";
  } else if (text.includes("温")) {
    iceLevel = "温";
  } else if (text.includes("去冰")) {
    iceLevel = "去冰";
  } else if (text.includes("少冰")) {
    iceLevel = "少冰";
  } else if (text.includes("正常冰")) {
    iceLevel = "正常冰";
  }

  return {
    brand,
    beverageName,
    sugarLevel: sugarMatch?.value,
    cupSize,
    iceLevel,
  };
}

function parseMealFromOcrText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 1);
  const hit = lines.find((line) => line.includes("午餐") || line.includes("中餐"));
  if (hit) {
    return hit.replace(/午餐|中餐|[:：]/g, "").trim();
  }
  return lines.slice(0, 2).join("，").slice(0, 40);
}

function emotionLabel(value: string) {
  if (value === "positive") {
    return "正向";
  }
  if (value === "negative") {
    return "负向";
  }
  if (value === "mixed") {
    return "复杂/混合";
  }
  return "中性";
}

function calcSleepHours(wakeTime: string, sleepTime: string) {
  const wake = toMinutes(wakeTime);
  const sleep = toMinutes(sleepTime);
  if (wake === 0 && sleep === 0) {
    return 0;
  }
  const diff = wake >= sleep ? wake - sleep : 24 * 60 - sleep + wake;
  return Math.round((diff / 60) * 10) / 10;
}
