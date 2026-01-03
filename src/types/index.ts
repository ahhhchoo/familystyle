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
  familyId: string;
  title: string;
  createdAt: TimestampOrDate;
  isActive: boolean;
  frequency: GoalFrequency; // 'daily' or 'weekly'
  weeklyTarget?: number; // Required if frequency is 'weekly' (e.g., 3 times per week)
}

export interface DailyCheckIn {
  id: string;
  goalId: string;
  userId: string;
  familyId: string;
  date: string; // YYYY-MM-DD format
  completed: boolean;
  completedAt: TimestampOrDate;
}

export interface FamilyMemberStatus {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isComplete: boolean;
  completedAt: TimestampOrDate;
  goalsCompleted: number;
  totalGoals: number;
}
