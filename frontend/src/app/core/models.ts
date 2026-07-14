export type TaskStatus = 'backlog' | 'today' | 'in_progress' | 'done';
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly' | null;
export type MenuCourse = 'appetiser' | 'side' | 'entree' | 'dessert' | 'special';

export interface Step {
  id: string;
  taskId: string;
  title: string;
  complete: boolean;
  sortOrder: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  categoryId: string | null;
  sourceId: string | null;
  requestorId: string | null;
  requestorName: string | null;
  dueDate: string | null;
  recurrence: Recurrence;
  recurredFrom: string | null;
  status: TaskStatus;
  capturedAt: string;
  lastActedAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  updatedAt: string;
  deletedAt: string | null;
  steps: Step[];
}

export interface Category {
  id: string;
  name: string;
  colourHex: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Source {
  id: string;
  name: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Requestor {
  id: string;
  name: string;
  useCount: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MenuItem {
  id: string;
  course: MenuCourse;
  label: string;
  durationMinutes: number | null;
  sortOrder: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FocusSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  digestEnabled: boolean;
  digestTime: string;
  starterOffered: boolean;
  focusMinutes: number;
  breakMinutes: number;
  keepScreenOn: boolean;
  driveBackupEnabled: boolean;
  driveBackupReady: boolean;
  lastDriveBackupAt: string | null;
}

export interface WeekStats {
  captured: number;
  completed: number;
  focusSessions: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface InsightsSummary {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  daysUsedOfLast14: number;
  activeDays: string[];
  flowMedianSeconds: number | null;
  sources: NamedCount[];
  categories: NamedCount[];
  simmeringCount: number;
  oldestSimmeringDays: number | null;
}

export interface Delta {
  serverTime: string;
  tasks: Task[];
  steps: Step[];
  categories: Category[];
  sources: Source[];
  requestors: Requestor[];
  menuItems: MenuItem[];
  focusSessions: FocusSession[];
}

export interface TaskPatchResult {
  task: Task;
  nextInstance: Task | null;
}

export const MENU_COURSES: { key: MenuCourse; label: string; hint: string }[] = [
  { key: 'appetiser', label: 'Appetisers', hint: '2-5 min' },
  { key: 'side', label: 'Sides', hint: 'ongoing' },
  { key: 'entree', label: 'Entrées', hint: '10-30 min' },
  { key: 'dessert', label: 'Desserts', hint: 'hard limit' },
  { key: 'special', label: 'Specials', hint: 'open-ended' }
];

export const STARTER_SOURCES = ['Email', 'In Person', 'Slack', 'Phone', 'WhatsApp'];

export const STARTER_MENU: { course: MenuCourse; label: string; durationMinutes: number | null }[] = [
  { course: 'appetiser', label: 'Step outside', durationMinutes: 3 },
  { course: 'side', label: 'Instrumental playlist', durationMinutes: null },
  { course: 'entree', label: 'Short walk outside', durationMinutes: 15 },
  { course: 'dessert', label: 'Social media', durationMinutes: 10 },
  { course: 'special', label: 'Gym session', durationMinutes: null }
];
