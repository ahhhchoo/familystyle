// Firestore Timestamp type
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export type TimestampOrDate = Date | FirestoreTimestamp | null;

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  customPhotoURL?: string | null; // Custom uploaded profile picture
  familyId: string | null;
  createdAt: TimestampOrDate;
}

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  members: string[]; // Array of user UIDs
  createdAt: TimestampOrDate;
  createdBy: string; // UID of creator
}

export type GoalFrequency = 'daily' | 'weekly';

export interface Goal {
  id: string;
  userId: string;
  userName?: string; // Human-readable user name (for easier debugging in Firebase console)
  familyId: string;
  title: string;
  createdAt: TimestampOrDate;
  isActive: boolean;
  frequency: GoalFrequency; // 'daily' or 'weekly'
  weeklyTarget?: number; // Required if frequency is 'weekly' (e.g., 3 times per week)
  order?: number; // Display order (lower = higher in list)
}

export interface DailyCheckIn {
  id: string;
  goalId: string;
  goalTitle?: string; // Human-readable goal name (for easier debugging in Firebase console)
  userId: string;
  userName?: string; // Human-readable user name (for easier debugging in Firebase console)
  familyId: string;
  date: string; // YYYY-MM-DD format
  completed: boolean;
  completedAt: TimestampOrDate;
}

export interface FamilyMemberStatus {
  uid: string;
  displayName: string;
  photoURL: string | null;
  customPhotoURL?: string | null;
  isComplete: boolean;
  completedAt: TimestampOrDate;
  goalsCompleted: number;
  totalGoals: number;
}

export interface MonthlyWager {
  id: string;
  familyId: string;
  month: string; // YYYY-MM format (e.g., "2026-01")
  monthDisplay?: string; // Human-readable month (e.g., "January 2026") for easier debugging
  reward: string; // The reward text (e.g., "Omakase")
  assignedUserId: string; // User who picks the reward for this month
  assignedUserName?: string; // Human-readable user name for easier debugging
  completionRate: number; // Calculated completion rate for the month (0-100)
  createdAt: TimestampOrDate;
  updatedAt: TimestampOrDate;
}
