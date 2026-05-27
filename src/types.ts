export interface Team {
  teamId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  googleServiceAccountEmail?: string;
}

export interface Invite {
  inviteId: string;
  teamId: string;
  email: string;
  token: string;
  role: "admin" | "volunteer";
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: "superadmin" | "admin" | "volunteer";
  teamId?: string;
  googleCalendarId?: string;
  googleCalendarSyncEnabled?: boolean;
}

export interface Shift {
  shiftId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM HKT
  endTime: string; // HH:MM HKT
  type: "Friday" | "Saturday";
  assignedUserId: string | null;
  status: "vacant" | "assigned" | "pending_exchange";
}

export interface SystemLog {
  id: string;
  timestamp: string;
  type: "fcm" | "email" | "system" | "error";
  message: string;
  details?: Record<string, any>;
}
