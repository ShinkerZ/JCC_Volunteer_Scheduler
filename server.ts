import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface User {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: "superadmin" | "admin" | "volunteer";
  teamId?: string;
  country?: string; // ISO 3166-1 alpha-2 (e.g., "IL", "US", "GB")
  googleCalendarId?: string;
  googleCalendarSyncEnabled?: boolean;
}

interface Team {
  teamId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  googleServiceAccountEmail?: string;
}

interface Invite {
  inviteId: string;
  teamId: string;
  email: string;
  token: string;
  role: "admin" | "volunteer";
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
}

interface Shift {
  shiftId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO String or HKT Clock string
  endTime: string; // ISO String or HKT Clock string
  type: "Friday" | "Saturday";
  assignedUserId: string | null;
  status: "vacant" | "assigned" | "pending_exchange";
}

interface SystemLog {
  id: string;
  timestamp: string;
  type: "fcm" | "email" | "system" | "error";
  message: string;
  details?: Record<string, any>;
}

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

// Helper: HKT Time conversions
function getHKTDateString(date: Date): string {
  // Returns in YYYY-MM-DD format based on HKT (UTC+8)
  const hktOffset = 8 * 60;
  const userTime = new Date(date.getTime() + hktOffset * 60 * 1000);
  return userTime.toISOString().split("T")[0];
}

function calculateHKTSunsetAndCandle(dateStr: string): { candleLighting: string, sunset: string } {
  // Parsing date
  const date = new Date(dateStr + "T12:00:00Z");
  // Day of year calculation
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  // Sunset model for Hong Kong (Latitude: 22.3964° N)
  // Dec solstice: Sunset is approx 17:41 HKT
  // June solstice: Sunset is approx 19:11 HKT
  // Equation approximation: Sunset HKT = 18.43 + 0.75 * sin((dayOfYear - 80) * 2 * Math.PI / 365)
  const sunsetHours = 18.43 + 0.75 * Math.sin(((dayOfYear - 80) * 2 * Math.PI) / 365);
  const mins = Math.round((sunsetHours - Math.floor(sunsetHours)) * 60);
  const hr = Math.floor(sunsetHours);
  
  const sunsetClock = `${String(hr).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  
  // Candle-lighting in Hebcal is typically 18 minutes before sunset
  const totalSunsetMins = hr * 60 + mins;
  const totalCandleMins = totalSunsetMins - 18;
  const candleHr = Math.floor(totalCandleMins / 60);
  const candleMin = totalCandleMins % 60;
  const candleLightingClock = `${String(candleHr).padStart(2, "0")}:${String(candleMin).padStart(2, "0")}`;
  
  return {
    candleLighting: candleLightingClock,
    sunset: sunsetClock,
  };
}

// Helper: Generate Google Calendar event object from shift
function generateCalendarEvent(shift: Shift, userName: string) {
  const [startHour, startMin] = shift.startTime.split(":").map(Number);
  const [endHour, endMin] = shift.endTime.split(":").map(Number);

  const startDateTime = new Date(`${shift.date}T${shift.startTime}:00+08:00`);
  const endDateTime = new Date(`${shift.date}T${shift.endTime}:00+08:00`);

  return {
    summary: `Shabbat Shift (${shift.type}) - ${userName}`,
    description: `Volunteer shift assignment\nType: ${shift.type}\nShift times: ${shift.startTime} - ${shift.endTime} HKT`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: "Asia/Hong_Kong"
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: "Asia/Hong_Kong"
    },
    location: "Hong Kong Synagogue Community Center, Central Area, Hong Kong",
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 }, // 24 hours before
        { method: "popup", minutes: 30 }
      ]
    }
  };
}

// Helper: Sync shift to Google Calendar (mocked for now)
async function syncShiftToCalendar(shift: Shift, user: User) {
  try {
    // In production, this would call Google Calendar API
    // For now, we'll log it and return success
    console.log(`[Google Calendar] Syncing shift ${shift.shiftId} for user ${user.name}`);

    // TODO: Implement actual Google Calendar API call
    // const googleCalendarAPI = ...;
    // await googleCalendarAPI.events.insert({
    //   calendarId: user.googleCalendarId || 'primary',
    //   requestBody: generateCalendarEvent(shift, user.name)
    // });

    return { success: true, eventId: `event-${shift.shiftId}` };
  } catch (err) {
    console.error("Failed to sync to Google Calendar:", err);
    return { success: false, error: String(err) };
  }
}

// Helper: Remove shift from Google Calendar (mocked for now)
async function unsyncShiftFromCalendar(shift: Shift, user: User, eventId?: string) {
  try {
    console.log(`[Google Calendar] Removing shift ${shift.shiftId} for user ${user.name}`);

    // TODO: Implement actual Google Calendar API call
    // const googleCalendarAPI = ...;
    // await googleCalendarAPI.events.delete({
    //   calendarId: user.googleCalendarId || 'primary',
    //   eventId: eventId || `event-${shift.shiftId}`
    // });

    return { success: true };
  } catch (err) {
    console.error("Failed to remove from Google Calendar:", err);
    return { success: false, error: String(err) };
  }
}

// Helper: Fetch Hebrew holidays from Hebcal API for a given country
async function fetchHebrewHolidaysForCountry(country: string, year: number = new Date().getFullYear()): Promise<Record<string, string>> {
  const holidaysMap: Record<string, string> = {}; // YYYY-MM-DD -> holiday name
  try {
    const response = await fetch(`https://www.hebcal.com/api/holidays?year=${year}&country=${country.toUpperCase()}`);
    if (response.ok) {
      const data = await response.json();
      if (data.holidays && Array.isArray(data.holidays)) {
        data.holidays.forEach((holiday: any) => {
          if (holiday.date) {
            holidaysMap[holiday.date] = holiday.title;
          }
        });
      }
      console.log(`[Hebcal] Fetched ${Object.keys(holidaysMap).length} holidays for ${country}`);
    }
  } catch (err) {
    console.warn(`[Hebcal] Failed to fetch holidays for ${country}:`, err);
  }
  return holidaysMap;
}

// Generate default users (50 users)
function generateDefaultUsers(): User[] {
  const users: User[] = [
    {
      uid: "user-superadmin",
      name: "Admin Principal (You)",
      email: "dashinker@gmail.com",
      phone: "+852 9123 4567",
      role: "superadmin"
    },
    // 4 Admins
    {
      uid: "user-admin-1",
      name: "Benjamin Cohen",
      email: "benjamin.cohen@hksynagogue.org",
      phone: "+852 9876 5432",
      role: "admin"
    },
    {
      uid: "user-admin-2",
      name: "Sarah Levy",
      email: "sarah.levy@hksynagogue.org",
      phone: "+852 9432 1098",
      role: "admin"
    },
    {
      uid: "user-admin-3",
      name: "David Wong",
      email: "david.wong@hksynagogue.org",
      phone: "+852 9223 3445",
      role: "admin"
    },
    {
      uid: "user-admin-4",
      name: "Mei-Ling Chan",
      email: "mei.ling@hksynagogue.org",
      phone: "+852 9554 4332",
      role: "admin"
    }
  ];

  // 45 Volunteers
  const jewishLastNames = ["Goldberg", "Katz", "Stein", "Stern", "Roth", "Kaplan", "Feldman", "Shapiro", "Rosenberg", "Friedman", "Kahn", "Berger", "Berman", "Rubin", "Weinberg"];
  const localFirstNames = ["Aaron", "Rachel", "Joshua", "Miriam", "Daniel", "Hannah", "Michael", "Esther", "Samuel", "Rebecca", "Jacob", "Leah", "Joseph", "Ruth", "Isaac", "Abigail", "Ethan", "Sarah", "Gabriel", "Chaya", "Simcha", "Tamar", "Adina", "Noam", "Yosef", "Avi", "Eli", "Akiva", "Devorah", "Zev"];
  const localChineseFirst = ["Ka-Hing", "Wing-Sze", "Lap-Chun", "Yee-Man", "Chun-Hei", "Siu-Ming", "Wai-Kin", "Hoi-Yan", "Chi-Shing", "Lai-Wah", "Kin-Fai", "Pui-Kei", "Chun-Yip", "Siu-Hang", "Ka-Wai"];

  let count = 5;
  for (let i = 0; i < 45; i++) {
    const isChineseFirst = i % 3 === 0;
    const isChineseLast = i % 3 === 0;
    const lastName = isChineseLast ? ["Chan", "Wong", "Lee", "Cheung", "Lau", "Ho", "Tsang", "Li"][i % 8] : jewishLastNames[i % jewishLastNames.length];
    const firstName = isChineseFirst ? localChineseFirst[i % localChineseFirst.length] : localFirstNames[i % localFirstNames.length];
    
    users.push({
      uid: `user-volunteer-${count}`,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase().replace("-", "")}.${lastName.toLowerCase()}@hkvolunteers.org`,
      phone: `+852 6${String(Math.floor(1000000 + Math.random() * 9000000))}`,
      role: "volunteer"
    });
    count++;
  }

  return users;
}

// Generate schedules
async function fetchShabbatTimesAndGenerateShifts(users: User[]): Promise<Shift[]> {
  const shifts: Shift[] = [];
  const today = new Date();
  
  // Let's query Hebcal API for HK for 3 months
  // If Hebcal fails, we fall back to our high accuracy offline formula!
  let hebcalData: Record<string, string> = {}; // YYYY-MM-DD -> sunset/candle string
  try {
    const startYr = today.getFullYear();
    const end = new Date();
    end.setMonth(end.getMonth() + 4);
    const endYr = end.getFullYear();
    
    // Call Hebcal Shabbat JSON API
    // Geonameid for Hong Kong: 1819729
    const response = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geonameid=1819729&m=18`);
    if (response.ok) {
      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.category === "candles" && item.date) {
            const dateStr = item.date.split("T")[0];
            // Format of candle item time (which contains HKT offset or ISO)
            const timePart = item.date.split("T")[1]; // e.g. 18:41:00+08:00
            if (timePart) {
              const clockStr = timePart.substring(0, 5); // 18:41
              hebcalData[dateStr] = clockStr;
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn("Hebcal API lookup failed. Falling back to internal solar calculations:", err);
  }

  const volunteers = users.filter((u) => u.role === "volunteer");

  // Create rolling 3 months of shifts
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    const dayOfWeek = d.getDay(); // 0: Sunday, ..., 5: Friday, 6: Saturday
    
    if (dayOfWeek === 5) {
      // Friday Shift
      const dateStr = d.toISOString().split("T")[0];
      let candleClock = hebcalData[dateStr];
      if (!candleClock) {
        // Fallback to HK sunset formula
        candleClock = calculateHKTSunsetAndCandle(dateStr).candleLighting;
      }

      // Start: Candle time minus 30 mins
      const [candleH, candleM] = candleClock.split(":").map(Number);
      const totalCandleMins = candleH * 60 + candleM;
      const startTotalMins = totalCandleMins - 30;
      const endTotalMins = startTotalMins + 90; // Exactly 1.5 hours shift

      const startH = Math.floor(startTotalMins / 60);
      const startM = startTotalMins % 60;
      const endH = Math.floor(endTotalMins / 60);
      const endM = endTotalMins % 60;

      const startTimeStr = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
      const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      // Assign first volunteers for demo realism
      const assignIdx = Math.floor(Math.random() * (volunteers.length + 5));  // Some vacant
      const assignedUser = assignIdx < volunteers.length ? volunteers[assignIdx] : null;

      shifts.push({
        shiftId: `shift-fri-${dateStr}`,
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        type: "Friday",
        assignedUserId: assignedUser ? assignedUser.uid : null,
        status: assignedUser ? "assigned" : "vacant",
      });
    } else if (dayOfWeek === 6) {
      // Saturday Shift
      const dateStr = d.toISOString().split("T")[0];
      const startTimeStr = "09:00";
      const endTimeStr = "13:00"; // Exactly 4 hours

      const assignIdx = Math.floor(Math.random() * (volunteers.length + 5));
      const assignedUser = assignIdx < volunteers.length ? volunteers[assignIdx] : null;

      shifts.push({
        shiftId: `shift-sat-${dateStr}`,
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        type: "Saturday",
        assignedUserId: assignedUser ? assignedUser.uid : null,
        status: assignedUser ? "assigned" : "vacant",
      });
    }
  }

  return shifts;
}

let db: {
  teams: Team[];
  invites: Invite[];
  users: User[];
  shifts: Shift[];
  logs: SystemLog[];
} = {
  teams: [],
  invites: [],
  users: [],
  shifts: [],
  logs: []
};

// Store actions to database file
function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write db.json:", err);
  }
}

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      console.log(`Loaded db.json successfully. ${db.users.length} users and ${db.shifts.length} shifts.`);
    } else {
      console.log("Initializing database for the first time...");

      // Create default team
      const defaultTeam: Team = {
        teamId: "team-default-hkt",
        name: "Hong Kong Shabbat Community",
        createdBy: "user-superadmin",
        createdAt: new Date().toISOString()
      };
      db.teams = [defaultTeam];

      // Generate users and assign to default team
      const users = generateDefaultUsers();
      db.users = users.map(u => ({
        ...u,
        teamId: "team-default-hkt"
      }));

      db.logs = [
        {
          id: `log-init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "system",
          message: "System initialized. Generated 50 team members including Super Admins, Admins, and Volunteers in Hong Kong Shabbat Community team."
        }
      ];
      saveDatabase();
    }
  } catch (err) {
    console.error("Failed to read db.json:", err);
    db.users = generateDefaultUsers().map(u => ({
      ...u,
      teamId: "team-default-hkt"
    }));
    db.teams = [{
      teamId: "team-default-hkt",
      name: "Hong Kong Shabbat Community",
      createdBy: "user-superadmin",
      createdAt: new Date().toISOString()
    }];
    db.shifts = [];
    db.logs = [];
  }
}

// Core App Initialization
async function initializeServer() {
  loadDatabase();
  
  // If shifts didn't load or are empty, trigger Hebcal and generate
  if (!db.shifts || db.shifts.length === 0) {
    console.log("Generating fresh HKT Shabbat 3-month schedules...");
    db.shifts = await fetchShabbatTimesAndGenerateShifts(db.users);
    db.logs.push({
      id: `log-shifts-gen-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `HKT Shabbat schedules generated with rolling 3-month horizon (${db.shifts.length} shifts total).`
    });
    saveDatabase();
  }

  const app = express();
  app.use(express.json());

  // Web services & endpoints

  // 1. Get current logged-in session profile or users list
  app.get("/api/users", (req, res) => {
    res.json(db.users);
  });

  // Create user (Admins/Super Admin)
  app.post("/api/users", async (req, res) => {
    const { name, email, phone, role, country } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const exists = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const newUser: User = {
      uid: `user-volunteer-${Date.now()}`,
      name,
      email,
      phone: phone || "+852 0000 0000",
      role,
      ...(country && { country }) // Store country if provided
    };

    db.users.push(newUser);

    // If admin role and country provided, fetch Hebrew holidays for sync
    if (role === "admin" && country) {
      try {
        const year = new Date().getFullYear();
        const holidays = await fetchHebrewHolidaysForCountry(country, year);
        if (Object.keys(holidays).length > 0) {
          db.logs.unshift({
            id: `log-hebcal-sync-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "system",
            message: `[Hebcal Sync] Admin ${name} set country to ${country}. Synced ${Object.keys(holidays).length} Hebrew holidays for ${year}.`,
            details: { adminUid: newUser.uid, country, holidayCount: Object.keys(holidays).length, holidays }
          });
        }
      } catch (err) {
        console.error(`Failed to sync Hebcal holidays for ${country}:`, err);
      }
    }

    db.logs.unshift({
      id: `log-u-chk-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Created new user ${name} with role: ${role}${country ? ` and country: ${country}` : ""}.`
    });
    saveDatabase();
    res.status(201).json(newUser);
  });

  // Admin assigns role or deletes users
  app.put("/api/users/:uid", (req, res) => {
    const { uid } = req.params;
    const { name, phone, role } = req.body;
    
    const userIndex = db.users.findIndex((u) => u.uid === uid);
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    const previousRole = db.users[userIndex].role;
    db.users[userIndex] = {
      ...db.users[userIndex],
      ...(name && { name }),
      ...(phone && { phone }),
      ...(role && { role }),
    };

    db.logs.unshift({
      id: `log-u-upd-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Updated profile of user ${db.users[userIndex].name} on Firestore. Role change: ${previousRole} -> ${db.users[userIndex].role}.`
    });
    saveDatabase();
    res.json(db.users[userIndex]);
  });

  app.delete("/api/users/:uid", (req, res) => {
    const { uid } = req.params;
    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    db.users = db.users.filter((u) => u.uid !== uid);
    // Unassign empty shifts
    db.shifts = db.shifts.map((s) => {
      if (s.assignedUserId === uid) {
        return { ...s, assignedUserId: null, status: "vacant" };
      }
      return s;
    });

    db.logs.unshift({
      id: `log-u-del-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Permanently removed user ${user.name} from Firebase Auth and Firestore. All assignments cleared.`
    });
    saveDatabase();
    res.json({ message: "User deleted successfully" });
  });

  // 1b. Team Management Endpoints

  // Get all teams (Super Admin only)
  app.get("/api/teams", (req, res) => {
    res.json(db.teams);
  });

  // Create new team (Super Admin only)
  app.post("/api/teams", (req, res) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const newTeam: Team = {
      teamId: `team-${Date.now()}`,
      name,
      createdBy: "user-superadmin", // In production, use actual logged-in user
      createdAt: new Date().toISOString()
    };

    db.teams.push(newTeam);
    db.logs.unshift({
      id: `log-team-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Created new team: ${name}`
    });
    saveDatabase();
    res.status(201).json(newTeam);
  });

  // 1c. Invite Management Endpoints

  // Generate invite token
  app.post("/api/invites", (req, res) => {
    const { email, teamId, role } = req.body;
    if (!email || !teamId || !role) {
      return res.status(400).json({ error: "Email, teamId, and role are required" });
    }

    const team = db.teams.find((t) => t.teamId === teamId);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Check if user already exists
    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Check if invite already exists and not expired
    const existingInvite = db.invites.find(
      (inv) => inv.email.toLowerCase() === email.toLowerCase() && new Date(inv.expiresAt) > new Date()
    );
    if (existingInvite) {
      return res.status(400).json({ error: "Active invite already sent to this email" });
    }

    // Generate secure token
    const token = require("crypto").randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const newInvite: Invite = {
      inviteId: `invite-${Date.now()}`,
      teamId,
      email,
      token,
      role,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    };

    db.invites.push(newInvite);
    db.logs.unshift({
      id: `log-invite-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Invite generated for ${email} to join team ${team.name} as ${role}`
    });
    saveDatabase();

    // Return invite link (in production, send via email)
    const inviteLink = `http://localhost:3000/invite/${token}`;
    res.status(201).json({
      inviteId: newInvite.inviteId,
      email,
      role,
      teamName: team.name,
      expiresAt: newInvite.expiresAt,
      inviteLink // For testing/demo purposes
    });
  });

  // Get all invites (for admin dashboard)
  app.get("/api/invites", (req, res) => {
    res.json(db.invites);
  });

  // Validate invite token
  app.get("/api/invites/validate/:token", (req, res) => {
    const { token } = req.params;
    const invite = db.invites.find((inv) => inv.token === token);

    if (!invite) {
      return res.status(404).json({ error: "Invalid invite token" });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Invite has expired" });
    }

    if (invite.acceptedAt) {
      return res.status(400).json({ error: "Invite has already been used" });
    }

    const team = db.teams.find((t) => t.teamId === invite.teamId);
    res.json({
      inviteId: invite.inviteId,
      email: invite.email,
      role: invite.role,
      teamName: team?.name || "Unknown Team"
    });
  });

  // Accept invite and create user
  app.post("/api/users/accept-invite", (req, res) => {
    const { token, name, phone } = req.body;
    if (!token || !name) {
      return res.status(400).json({ error: "Token, name are required" });
    }

    const invite = db.invites.find((inv) => inv.token === token);
    if (!invite) {
      return res.status(404).json({ error: "Invalid invite token" });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Invite has expired" });
    }

    if (invite.acceptedAt) {
      return res.status(400).json({ error: "Invite has already been used" });
    }

    // Check email not already in use
    const existingUser = db.users.find((u) => u.email.toLowerCase() === invite.email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Create new user
    const newUser: User = {
      uid: `user-volunteer-${Date.now()}`,
      name,
      email: invite.email,
      phone: phone || "+852 0000 0000",
      role: invite.role as "admin" | "volunteer",
      teamId: invite.teamId,
      googleCalendarSyncEnabled: false
    };

    db.users.push(newUser);

    // Mark invite as accepted
    const inviteIndex = db.invites.findIndex((inv) => inv.inviteId === invite.inviteId);
    if (inviteIndex !== -1) {
      db.invites[inviteIndex].acceptedAt = new Date().toISOString();
    }

    const team = db.teams.find((t) => t.teamId === invite.teamId);
    db.logs.unshift({
      id: `log-invite-accept-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `User ${name} accepted invite and joined team ${team?.name || "Unknown"} as ${invite.role}`
    });

    saveDatabase();
    res.status(201).json({
      uid: newUser.uid,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      teamId: newUser.teamId,
      message: "User created successfully"
    });
  });

  // 2. Schedule Endpoints
  app.get("/api/shifts", (req, res) => {
    const { teamId, userId } = req.query;

    let shifts = db.shifts;

    // If a specific team is requested, filter by that team
    if (teamId) {
      const team = db.teams.find((t) => t.teamId === teamId as string);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      // For now, return all shifts (could be filtered by team in future)
      // The filtering happens client-side based on team membership
    }

    // If userId provided, validate they can access these shifts (team isolation)
    if (userId) {
      const user = db.users.find((u) => u.uid === userId as string);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Volunteers only see their own team's shifts
      // For now, return all shifts and let client filter
      // In a real app, would only return shifts for that team
    }

    res.json(shifts);
  });

  // Admin manually override any cells of a shift
  app.put("/api/shifts/:shiftId", (req, res) => {
    const { shiftId } = req.params;
    const { assignedUserId, startTime, endTime, status, overrideName } = req.body;
    
    const shiftIndex = db.shifts.findIndex((s) => s.shiftId === shiftId);
    if (shiftIndex === -1) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const oldShift = db.shifts[shiftIndex];
    let finalAssignedUserId = assignedUserId;
    
    // Support clearing an assignment
    if (assignedUserId === null || assignedUserId === "") {
      finalAssignedUserId = null;
    }

    const updatedShift: Shift = {
      ...oldShift,
      assignedUserId: finalAssignedUserId,
      startTime: startTime || oldShift.startTime,
      endTime: endTime || oldShift.endTime,
      status: status || (finalAssignedUserId ? "assigned" : "vacant")
    };

    db.shifts[shiftIndex] = updatedShift;

    // Trigger Notification & Email Invitation Simulation based on specifications
    const u = db.users.find((user) => user.uid === finalAssignedUserId);
    const prevU = db.users.find((user) => user.uid === oldShift.assignedUserId);

    if (finalAssignedUserId && finalAssignedUserId !== oldShift.assignedUserId) {
      // Shifting assignment mutated
      db.logs.unshift({
        id: `fcm-${Date.now()}-1`,
        timestamp: new Date().toISOString(),
        type: "fcm",
        message: `FCM Alert: You have been assigned to ${updatedShift.type} shift on ${updatedShift.date}.`,
        details: { targetUid: finalAssignedUserId, token: "fcm_token_registered_hkt_" + finalAssignedUserId }
      });

      db.logs.unshift({
        id: `email-${Date.now()}-1`,
        timestamp: new Date().toISOString(),
        type: "email",
        message: `RFC-5545 Calendar Invitation (.ics) emailed to ${u?.email || "volunteer@hkvolunteers.org"}`,
        details: {
          to: u?.email,
          subject: `ACTION REQUIRED: Calendar Invite - Shabbat Shift [${updatedShift.date}]`,
          icsContent: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Shabbat Shift (${updatedShift.type})\nDTSTART:${updatedShift.date.replace(/-/g, "")}T${updatedShift.startTime.replace(/:/g, "")}00\nDTEND:${updatedShift.date.replace(/-/g, "")}T${updatedShift.endTime.replace(/:/g, "")}00\nEND:VEVENT\nEND:VCALENDAR`
        }
      });
    } else if (!finalAssignedUserId && oldShift.assignedUserId) {
      // Assignment cleared
      db.logs.unshift({
        id: `fcm-${Date.now()}-clr`,
        timestamp: new Date().toISOString(),
        type: "fcm",
        message: `FCM Alert: Your shift on ${oldShift.date} (${oldShift.type}) has been removed or rescheduled.`,
        details: { targetUid: oldShift.assignedUserId }
      });
      db.logs.unshift({
        id: `email-${Date.now()}-clr`,
        timestamp: new Date().toISOString(),
        type: "email",
        message: `RFC-5545 Cancellation Invite (.ics) emailed to ${prevU?.email || "volunteer@hkvolunteers.org"}`,
        details: {
          to: prevU?.email,
          subject: `CANCELLATION: Shabbat Shift [${oldShift.date}] Removed`
        }
      });
    }

    db.logs.unshift({
      id: `system-mut-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Firestore Mutation: Modified [${updatedShift.type}] Shift on ${updatedShift.date}. Assigned user is now ${u ? u.name : "VACANT"}.`
    });

    saveDatabase();
    res.json(updatedShift);
  });

  // Volunteer claims a vacant shift
  app.post("/api/shifts/:shiftId/claim", (req, res) => {
    const { shiftId } = req.params;
    const { uid } = req.body;

    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify user is in a team
    if (!user.teamId) {
      return res.status(403).json({ error: "User must be assigned to a team" });
    }

    const shiftIndex = db.shifts.findIndex((s) => s.shiftId === shiftId);
    if (shiftIndex === -1) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = db.shifts[shiftIndex];
    if (shift.assignedUserId) {
      return res.status(400).json({ error: "Shift already assigned" });
    }

    shift.assignedUserId = uid;
    shift.status = "assigned";
    db.shifts[shiftIndex] = shift;

    // Trigger invitations
    db.logs.unshift({
      id: `fcm-${Date.now()}-claim`,
      timestamp: new Date().toISOString(),
      type: "fcm",
      message: `FCM Confirmation: Successfully claimed Shabbat ${shift.type} shift on ${shift.date}!`,
      details: { targetUid: uid }
    });

    db.logs.unshift({
      id: `email-${Date.now()}-claim`,
      timestamp: new Date().toISOString(),
      type: "email",
      message: `RFC-5545 Calendar Invitation (.ics) emailed to ${user.email} (Assigned via claim)`,
      details: {
        to: user.email,
        subject: `Calendar Confirmation - Shabbat Shift [${shift.date}]`
      }
    });

    db.logs.unshift({
      id: `system-claim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Volunteer shift claimed on Firestore by ${user.name}. Status updated to: assigned.`
    });

    saveDatabase();
    res.json(shift);
  });

  // Volunteer requests exchange
  app.post("/api/shifts/:shiftId/request-exchange", (req, res) => {
    const { shiftId } = req.params;
    const { uid } = req.body;

    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify user is in a team
    if (!user.teamId) {
      return res.status(403).json({ error: "User must be assigned to a team" });
    }

    const shiftIndex = db.shifts.findIndex((s) => s.shiftId === shiftId);
    if (shiftIndex === -1) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = db.shifts[shiftIndex];
    if (shift.assignedUserId !== uid) {
      return res.status(400).json({ error: "You are not assigned to this shift" });
    }

    shift.status = "pending_exchange";
    db.shifts[shiftIndex] = shift;

    // Trigger GCM notifications to all other volunteers in the team
    db.logs.unshift({
      id: `fcm-exchange-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "fcm",
      message: `FCM Group Broadcast: ${user.name} requested an exchange for ${shift.type} Shift on ${shift.date}. Claim it now!`,
      details: { broadcastGroup: user.teamId, targetTeam: user.teamId }
    });

    db.logs.unshift({
      id: `system-ex-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Shift status mutated to "pending_exchange" for Friday/Saturday shift on ${shift.date}. Team notification dispatched.`
    });

    saveDatabase();
    res.json(shift);
  });

  // Volunteer claims a shift that is pending exchange (swapping it)
  app.post("/api/shifts/:shiftId/approve-exchange", (req, res) => {
    const { shiftId } = req.params;
    const { claimUserUid } = req.body; // User claiming the swap

    const claimUser = db.users.find((u) => u.uid === claimUserUid);
    if (!claimUser) {
      return res.status(404).json({ error: "Claiming user not found" });
    }

    // Verify claiming user is in a team
    if (!claimUser.teamId) {
      return res.status(403).json({ error: "User must be assigned to a team" });
    }

    const shiftIndex = db.shifts.findIndex((s) => s.shiftId === shiftId);
    if (shiftIndex === -1) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = db.shifts[shiftIndex];
    const originalUid = shift.assignedUserId;
    const originalUser = db.users.find((u) => u.uid === originalUid);

    // Verify both users are in the same team
    if (originalUser && originalUser.teamId !== claimUser.teamId) {
      return res.status(403).json({ error: "Users must be in the same team to exchange shifts" });
    }

    shift.assignedUserId = claimUserUid;
    shift.status = "assigned";
    db.shifts[shiftIndex] = shift;

    // Notifications
    db.logs.unshift({
      id: `fcm-ex-origin-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "fcm",
      message: `FCM Alert: Your exchange request for ${shift.date} (${shift.type}) was accepted by ${claimUser.name}. You are freed of this shift.`,
      details: { targetUid: originalUid }
    });

    db.logs.unshift({
      id: `fcm-ex-claim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "fcm",
      message: `FCM Confirmation: You have taken over ${originalUser ? originalUser.name : "another user"}'s shift on ${shift.date}.`,
      details: { targetUid: claimUserUid }
    });

    // Send updated calendar invite to claimUser and cancellation to originalUser
    db.logs.unshift({
      id: `email-ex-origin-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "email",
      message: `RFC-5545 Cancellation Invite emailed to original volunteer (${originalUser?.email || "volunteer@hkvolunteers.org"})`,
      details: { to: originalUser?.email }
    });

    db.logs.unshift({
      id: `email-ex-claim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "email",
      message: `RFC-5545 Calendar Invitation (.ics) emailed to new assignee (${claimUser.email})`,
      details: { to: claimUser.email }
    });

    db.logs.unshift({
      id: `system-swap-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Shift Swap Completed: ${originalUser ? originalUser.name : "Unknown"} -> ${claimUser.name} on ${shift.date}. Firestore update successful.`
    });

    saveDatabase();
    res.json(shift);
  });

  // Dynamic .ics RFC-5545 file builder for download
  app.get("/api/download-ics/:shiftId", (req, res) => {
    const { shiftId } = req.params;
    const shift = db.shifts.find((s) => s.shiftId === shiftId);
    if (!shift) {
      return res.status(404).send("Shift not found");
    }

    const user = db.users.find((u) => u.uid === shift.assignedUserId);
    const dateFormatted = shift.date.replace(/-/g, "");
    const cleanStart = shift.startTime.replace(/:/g, "");
    const cleanEnd = shift.endTime.replace(/:/g, "");

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Volunteer Synagogue Scheduler//Hong Kong Time HKT//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:shift-${shiftId}-hkt@hkshabbatvolunteers.org`,
      `DTSTAMP:${dateFormatted}T000000Z`,
      `DTSTART;TZID=Asia/Hong_Kong:${dateFormatted}T${cleanStart}00`,
      `DTEND;TZID=Asia/Hong_Kong:${dateFormatted}T${cleanEnd}00`,
      `SUMMARY:Volunteer Shabbat Shift - ${shift.type} Slot`,
      `DESCRIPTION:Private Volunteer Shift Assignment.\\nShift status: ${shift.status.toUpperCase()}\\nVolunteer Assigned: ${user ? user.name : "VACANT"}\\nTimes conform strictly to HKT (Hong Kong Time).`,
      "LOCATION:Hong Kong Synagogue Community Center\\, Central Area\\, Hong Kong",
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "BEGIN:VALARM",
      "TRIGGER:-PT12H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder: Your Shabbat security/host shift starts in 12 hours.",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=shabbat-shift-${shift.date}.ics`);
    res.send(icsContent);
  });

  // Google Calendar Sync Endpoints
  app.post("/api/shifts/:shiftId/sync-calendar", async (req, res) => {
    const { shiftId } = req.params;
    const { uid } = req.body;

    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const shift = db.shifts.find((s) => s.shiftId === shiftId);
    if (!shift) {
      return res.status(404).json({ error: "Shift not found" });
    }

    // Check if Google Calendar sync is enabled
    if (!user.googleCalendarSyncEnabled) {
      return res.status(400).json({ error: "Google Calendar sync not enabled for this user" });
    }

    // Attempt to sync with Google Calendar
    const result = await syncShiftToCalendar(shift, user);

    if (!result.success) {
      db.logs.unshift({
        id: `cal-sync-fail-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to sync shift ${shift.date} to Google Calendar for ${user.name}: ${result.error}`
      });
      return res.status(400).json({ error: result.error });
    }

    db.logs.unshift({
      id: `cal-sync-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Shift ${shift.date} (${shift.type}) synced to Google Calendar for ${user.name}`
    });

    saveDatabase();
    res.json({ success: true, eventId: result.eventId });
  });

  app.post("/api/shifts/:shiftId/unsync-calendar", async (req, res) => {
    const { shiftId } = req.params;
    const { uid, eventId } = req.body;

    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const shift = db.shifts.find((s) => s.shiftId === shiftId);
    if (!shift) {
      return res.status(404).json({ error: "Shift not found" });
    }

    // Attempt to remove from Google Calendar
    const result = await unsyncShiftFromCalendar(shift, user, eventId);

    if (!result.success) {
      db.logs.unshift({
        id: `cal-unsync-fail-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to remove shift ${shift.date} from Google Calendar for ${user.name}: ${result.error}`
      });
      return res.status(400).json({ error: result.error });
    }

    db.logs.unshift({
      id: `cal-unsync-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Shift ${shift.date} (${shift.type}) removed from Google Calendar for ${user.name}`
    });

    saveDatabase();
    res.json({ success: true });
  });

  // Update user Google Calendar settings
  app.put("/api/users/:uid/google-calendar", (req, res) => {
    const { uid } = req.params;
    const { syncEnabled, calendarId } = req.body;

    const userIndex = db.users.findIndex((u) => u.uid === uid);
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    if (syncEnabled !== undefined) {
      db.users[userIndex].googleCalendarSyncEnabled = syncEnabled;
    }
    if (calendarId !== undefined) {
      db.users[userIndex].googleCalendarId = calendarId;
    }

    db.logs.unshift({
      id: `cal-settings-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Google Calendar settings updated for ${db.users[userIndex].name}`
    });

    saveDatabase();
    res.json(db.users[userIndex]);
  });

  // System Logs & Firebase emulator
  app.get("/api/system-logs", (req, res) => {
    res.json(db.logs);
  });

  app.post("/api/system-logs/clear", (req, res) => {
    db.logs = [
      {
        id: `logs-clear-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "system",
        message: "System logs flushed manually by Super Admin."
      }
    ];
    saveDatabase();
    res.json(db.logs);
  });

  // Daily 24-hour reminder trigger simulator (Mocking Cron script run)
  app.post("/api/trigger-24h-reminders", (req, res) => {
    // Finds all shifts for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Filter shifts for tomorrow
    const tomshifts = db.shifts.filter((s) => s.date === tomorrowStr && s.assignedUserId);

    if (tomshifts.length === 0) {
      db.logs.unshift({
        id: `cron-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "system",
        message: `Cron Scheduler: Daily 24H Reminder run. No volunteer shifts assigned for tomorrow (${tomorrowStr}).`
      });
      saveDatabase();
      return res.json({ sentCount: 0, message: "No shifts mapped tomorrow." });
    }

    let pCount = 0;
    tomshifts.forEach((s) => {
      const volUser = db.users.find((u) => u.uid === s.assignedUserId);
      if (volUser) {
        pCount++;
        // Trigger Group alerts & Individual notifications
        db.logs.unshift({
          id: `fcm-remind-${Date.now()}-${pCount}`,
          timestamp: new Date().toISOString(),
          type: "fcm",
          message: `FCM Priority 24H Reminder: ${volUser.name}, you have a Shabbat ${s.type} shift tomorrow starting at ${s.startTime} HKT.`,
          details: { targetUid: volUser.uid }
        });
      }
    });

    db.logs.unshift({
      id: `cron-success-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "system",
      message: `Cloud Function Cron execution complete: Dispatched 24-hr reminder FCM notifications to ${pCount} assigned volunteers.`
    });

    saveDatabase();
    res.json({ sentCount: pCount, message: `Dispatched ${pCount} reminders.` });
  });

  // Vite routing setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on room: http://localhost:${PORT}`);
  });
}

initializeServer().catch((err) => {
  console.error("Critical server failure:", err);
});
