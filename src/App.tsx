import React, { useState, useEffect } from "react";
import {
  Users,
  Calendar,
  Clock,
  Activity,
  AlertCircle,
  Bell,
  Mail,
  RefreshCcw,
  ShieldAlert,
  Smartphone,
  Database,
  Grid,
  Sparkles,
  CheckCircle,
  HelpCircle,
  UserCheck,
  Plus,
  Trash2,
  ListFilter
} from "lucide-react";
import GoogleSheetView from "./components/GoogleSheetView";
import VolunteerDashboard from "./components/VolunteerDashboard";
import { User, Shift, SystemLog } from "./types";

export default function App() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sheet" | "directory" | "logs" | "my-shifts">("sheet");

  // State for invite acceptance
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [inviteFormData, setInviteFormData] = useState({ name: "", phone: "" });
  const [inviteProcessing, setInviteProcessing] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  // State for adding new user
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "volunteer">("volunteer");
  const [userSuccessMessage, setUserSuccessMessage] = useState("");
  const [userErrorMessage, setUserErrorMessage] = useState("");

  // State for team management
  const [teams, setTeams] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamSuccessMessage, setTeamSuccessMessage] = useState("");
  const [teamErrorMessage, setTeamErrorMessage] = useState("");

  // State for sending invites
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "volunteer">("volunteer");
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState("");
  const [inviteErrorMessage, setInviteErrorMessage] = useState("");

  // Statistics calculation
  const stats = {
    totalUsers: users.length,
    vacantShifts: shifts.filter(s => s.status === "vacant").length,
    exchangeRequests: shifts.filter(s => s.status === "pending_exchange").length,
    assignedShifts: shifts.filter(s => s.status === "assigned").length,
  };

  // Synchronize state from server
  const fetchData = async () => {
    try {
      const [usersRes, shiftsRes, logsRes, teamsRes, invitesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/shifts"),
        fetch("/api/system-logs"),
        fetch("/api/teams"),
        fetch("/api/invites")
      ]);

      if (usersRes.ok && shiftsRes.ok && logsRes.ok) {
        const usersData = await usersRes.json();
        const shiftsData = await shiftsRes.json();
        const logsData = await logsRes.json();
        const teamsData = teamsRes.ok ? await teamsRes.json() : [];
        const invitesData = invitesRes.ok ? await invitesRes.json() : [];

        setUsers(usersData);
        setShifts(shiftsData);
        setLogs(logsData);
        setTeams(teamsData);
        setInvites(invitesData);

        // Auto select first user (Super Admin) if not selected
        if (!currentUser && usersData.length > 0) {
          const superAdmin = usersData.find((u: User) => u.role === "superadmin");
          setCurrentUser(superAdmin || usersData[0]);
        } else if (currentUser) {
          // Keep current selected user synchronized
          const updatedUser = usersData.find((u: User) => u.uid === currentUser.uid);
          if (updatedUser) {
            setCurrentUser(updatedUser);
          }
        }

        // Set default team for invites
        if (teamsData.length > 0 && !inviteTeamId) {
          setInviteTeamId(teamsData[0].teamId);
        }
      }
    } catch (err) {
      console.error("Failed to sync server API configurations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh database simulation changes periodically
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Check for invite token in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) {
      setInviteToken(token);
      // Validate the invite token
      fetch(`/api/invites/validate/${token}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setInviteMessage(`Error: ${data.error}`);
          } else {
            setInviteData(data);
          }
        })
        .catch((err) => {
          setInviteMessage("Error validating invite");
          console.error(err);
        });
    }
  }, []);

  // Handle switching active user to represent Auth simulation
  const handleUserRoleSwitch = (uid: string) => {
    const targetUser = users.find(u => u.uid === uid);
    if (targetUser) {
      setCurrentUser(targetUser);
      // Set appropriate tab based on role
      if (targetUser.role === "volunteer") {
        setActiveTab("my-shifts");
      } else {
        setActiveTab("sheet");
      }
    }
  };

  // Trigger 24-Hour cron reminders on the server
  const trigger24hReminders = async () => {
    try {
      const response = await fetch("/api/trigger-24h-reminders", { method: "POST" });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Clear system emulator logs on the server
  const clearLogs = async () => {
    try {
      const response = await fetch("/api/system-logs/clear", { method: "POST" });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create user
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMessage("");
    setUserSuccessMessage("");

    if (!newUserName || !newUserEmail) {
      setUserErrorMessage("Name and email are strictly required.");
      return;
    }

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          phone: newUserPhone,
          role: newUserRole
        }),
      });

      if (response.ok) {
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPhone("");
        setUserSuccessMessage("Successfully registered user on Firestore emulator!");
        fetchData();
      } else {
        const err = await response.json();
        setUserErrorMessage(err.error || "Failed to add user.");
      }
    } catch (err) {
      console.error(err);
      setUserErrorMessage("Network error creating user profile.");
    }
  };

  // Delete user (Super Admin and Admins)
  const handleDeleteUser = async (uid: string) => {
    if (uid === "user-superadmin") {
      alert("The Root Super Admin account cannot be deleted.");
      return;
    }
    if (window.confirm("Are you sure you want to permanently delete this user from authentication and firestore?")) {
      try {
        const response = await fetch(`/api/users/${uid}`, { method: "DELETE" });
        if (response.ok) {
          fetchData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Change user role from dropdown (Super Admin only can assign/delete admin roles)
  const handleUpdateRole = async (uid: string, targetRole: "superadmin" | "admin" | "volunteer") => {
    try {
      const response = await fetch(`/api/users/${uid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create new team (Super Admin only)
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamErrorMessage("");
    setTeamSuccessMessage("");

    if (!newTeamName) {
      setTeamErrorMessage("Team name is required.");
      return;
    }

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName }),
      });

      if (response.ok) {
        const newTeam = await response.json();
        setNewTeamName("");
        setTeamSuccessMessage("Team created successfully!");
        setTeams([...teams, newTeam]);
        if (!inviteTeamId) {
          setInviteTeamId(newTeam.teamId);
        }
      } else {
        const err = await response.json();
        setTeamErrorMessage(err.error || "Failed to create team.");
      }
    } catch (err) {
      console.error(err);
      setTeamErrorMessage("Network error creating team.");
    }
  };

  // Send invite (Admin/Super Admin)
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteErrorMessage("");
    setInviteSuccessMessage("");

    if (!inviteEmail || !inviteTeamId || !inviteRole) {
      setInviteErrorMessage("Email, team, and role are required.");
      return;
    }

    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, teamId: inviteTeamId, role: inviteRole }),
      });

      if (response.ok) {
        const invite = await response.json();
        setInviteEmail("");
        setInviteSuccessMessage(`Invite sent to ${inviteEmail}! Link: ${invite.inviteLink}`);
        setInvites([...invites, invite]);
      } else {
        const err = await response.json();
        setInviteErrorMessage(err.error || "Failed to send invite.");
      }
    } catch (err) {
      console.error(err);
      setInviteErrorMessage("Network error sending invite.");
    }
  };

  // Accept invite (for public invite page)
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteProcessing(true);
    setInviteMessage("");

    if (!inviteFormData.name) {
      setInviteMessage("Name is required");
      setInviteProcessing(false);
      return;
    }

    try {
      const response = await fetch("/api/users/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          name: inviteFormData.name,
          phone: inviteFormData.phone
        }),
      });

      if (response.ok) {
        const newUser = await response.json();
        setInviteMessage("Successfully created account! Redirecting...");
        // Redirect to home page after 2 seconds
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        const err = await response.json();
        setInviteMessage(err.error || "Failed to accept invite");
      }
    } catch (err) {
      console.error(err);
      setInviteMessage("Network error accepting invite");
    } finally {
      setInviteProcessing(false);
    }
  };

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fcfcfc] text-[#1a1a1a]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCcw className="w-8 h-8 animate-spin text-[#4f46e5]" />
          <p className="text-sm font-medium font-display tracking-widest uppercase">Launching Firestore Scheduler...</p>
        </div>
      </div>
    );
  }

  // Show invite acceptance page if invite token is present
  if (inviteToken && inviteData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Join Volunteer Team</h1>
            <p className="text-sm text-slate-600">You've been invited to join</p>
            <p className="text-lg font-semibold text-indigo-600 mt-1">{inviteData.teamName}</p>
          </div>

          {inviteMessage && (
            <div className={`rounded-lg p-3 mb-4 text-sm ${
              inviteMessage.includes("Error") || inviteMessage.includes("Network")
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}>
              {inviteMessage}
            </div>
          )}

          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Your Full Name
              </label>
              <input
                type="text"
                value={inviteFormData.name}
                onChange={(e) => setInviteFormData({ ...inviteFormData, name: e.target.value })}
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-indigo-500 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={inviteFormData.phone}
                onChange={(e) => setInviteFormData({ ...inviteFormData, phone: e.target.value })}
                placeholder="e.g. +852 9123 4567"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-indigo-500 text-sm"
              />
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700 mb-1">Invite Details:</p>
              <p>Email: <span className="font-mono text-slate-800">{inviteData.email}</span></p>
              <p>Role: <span className="font-semibold text-indigo-600 capitalize">{inviteData.role}</span></p>
            </div>

            <button
              type="submit"
              disabled={inviteProcessing}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {inviteProcessing ? "Creating Account..." : "Accept Invite & Create Account"}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            By accepting this invite, you agree to join the volunteer scheduling system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#fcfcfc] text-[#1a1a1a] font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR - "Geometric Balance" Aesthetic */}
      <aside className="w-68 border-r border-[#e5e5e5] bg-white flex flex-col h-full shrink-0 select-none">
        {/* Sidebar Header Title & Meta */}
        <div className="p-6 border-b border-[#e5e5e5]">
          <h1 className="text-sm font-bold uppercase tracking-widest text-[#4f46e5] flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#4f46e5] rounded-full inline-block"></span>
            Scheduler HKT
          </h1>
          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-mono">Volunteer Management v2.1</p>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
            {currentUser.role === "volunteer" ? "MY VOLUNTEER MENU" : "SYSTEM ENGINE VIEWS"}
          </div>

          {currentUser.role === "volunteer" ? (
            <>
              {/* Volunteer Navigation */}
              <button
                onClick={() => setActiveTab("my-shifts")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "my-shifts"
                    ? "bg-[#f5f5f5] text-[#1a1a1a] border-l-4 border-[#4f46e5]"
                    : "text-gray-500 hover:bg-[#f9f9f9] hover:text-[#1a1a1a]"
                }`}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span>My Shifts & Tasks</span>
              </button>
            </>
          ) : (
            <>
              {/* Admin Navigation */}
              <button
                onClick={() => setActiveTab("sheet")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "sheet"
                    ? "bg-[#f5f5f5] text-[#1a1a1a] border-l-4 border-[#4f46e5]"
                    : "text-gray-500 hover:bg-[#f9f9f9] hover:text-[#1a1a1a]"
                }`}
              >
                <Grid className="w-4 h-4 shrink-0" />
                <span>The Sheet (Grid View)</span>
              </button>

              <button
                onClick={() => setActiveTab("directory")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "directory"
                    ? "bg-[#f5f5f5] text-[#1a1a1a] border-l-4 border-[#4f46e5]"
                    : "text-gray-500 hover:bg-[#f9f9f9] hover:text-[#1a1a1a]"
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Team Directory ({users.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("logs")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  activeTab === "logs"
                    ? "bg-[#f5f5f5] text-[#1a1a1a] border-l-4 border-[#4f46e5]"
                    : "text-gray-500 hover:bg-[#f9f9f9] hover:text-[#1a1a1a]"
                }`}
              >
                <Activity className="w-4 h-4 shrink-0" />
                <span>Emulator Logs Console</span>
              </button>
            </>
          )}

          {/* SIMULATION ZONE / ACTIVE USER PROFILE CHANGER */}
          <div className="pt-6">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5 px-2 flex items-center justify-between">
              <span>TEST SIMULATED AUTH</span>
              <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded">No Signup</span>
            </div>
            
            <div className="px-2 space-y-2">
              <label className="text-[10px] text-gray-500 block leading-tight">
                Switch active member profile to evaluate role-based restrictions immediately:
              </label>
              
              <select
                value={currentUser.uid}
                onChange={(e) => handleUserRoleSwitch(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-[#e5e5e5] rounded px-2.5 py-2 font-medium text-slate-800 focus:outline-[#4f46e5]"
              >
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    [{u.role.toUpperCase()}] - {u.name}
                  </option>
                ))}
              </select>

              <div className="mt-3 bg-indigo-50 border border-indigo-100 p-2.5 rounded-md">
                <span className="text-[10px] font-semibold text-indigo-900 block">Permissions Checklist:</span>
                <p className="text-[10px] text-indigo-700 leading-normal mt-1">
                  {currentUser.role === "superadmin" && "✓ Super Admin Mode active. Can assign/delete Admins, delete Volunteers, modify all shift cells."}
                  {currentUser.role === "admin" && "✓ Team Leader active. Can add/modify/override volunteer shifts, clear cell entries."}
                  {currentUser.role === "volunteer" && `✓ Volunteer mode: ${currentUser.name}. Can claim vacancies or request swaps on assigned rows.`}
                </p>
              </div>
            </div>
          </div>

          {/* SHABBAT RULES */}
          <div className="pt-6">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
              SHABBAT HONG KONG TIME HKT
            </div>
            <div className="px-2 space-y-1 text-[11px] text-gray-500 leading-relaxed">
              <p>📍 <strong>Coordinates:</strong> 22.396° N</p>
              <p>🕯️ <strong>Friday Slot:</strong> 1.5 Hours total, starts -30m prior to candles.</p>
              <p>✡️ <strong>Saturday Slot:</strong> 4.0 Hours total, fixed 9:00 AM - 1:00 PM HKT.</p>
            </div>
          </div>
        </nav>

        {/* LOGGED IN USER PROFILE FOOTER CARD */}
        <div className="p-4 border-t border-[#e5e5e5]">
          <div className="bg-[#f9f9f9] p-3.5 rounded-lg border border-[#e5e5e5]">
            <span className="text-[9px] text-[#4f46e5] font-bold uppercase tracking-wider block">Currently Acting As</span>
            <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{currentUser.name}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`w-2 h-2 rounded-full ${
                currentUser.role === "superadmin" 
                  ? "bg-purple-600" 
                  : currentUser.role === "admin" 
                  ? "bg-blue-600" 
                  : "bg-emerald-600"
              }`} />
              <span className="text-[10px] text-gray-500 font-mono capitalize">{currentUser.role}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN CONTAINER */}
      <main className="flex-1 flex flex-col h-full bg-[#f8f9fa] overflow-hidden">
        
        {/* HEADER - "Geometric Balance" Minimalist */}
        <header className="h-16 border-b border-[#e5e5e5] bg-white flex items-center justify-between px-8 flex-shrink-0 select-none">
          <div className="flex items-center space-x-6">
            <h2 className="text-base font-semibold font-display tracking-tight text-slate-800 flex items-center gap-2">
              <span>Volunteer Shift Board (HKT)</span>
              <span className="text-xs bg-slate-100 text-[#4f46e5] border border-slate-200 px-2 py-0.5 rounded font-mono">
                50 Team Users
              </span>
            </h2>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-gray-500 font-medium">Firebase Local Emulator Simulator</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={trigger24hReminders}
              className="bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs px-4 py-2 rounded font-medium shadow-2xs hover:cursor-pointer transition-colors flex items-center gap-1.5"
              title="Daily Cron function alerts volunteers who have shifts tomorrow"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Trigger 24H Reminder Cron</span>
            </button>
            <div className="h-8 w-[1px] bg-gray-200"></div>
            <span className="text-xs text-gray-500 font-medium font-mono">
              Hong Kong Time: <strong className="text-slate-800">GMT+8</strong>
            </span>
          </div>
        </header>

        {/* DYNAMIC BENTO HERO BLOCK (STATISTICS & SIMULATION CONTROLS) */}
        <section className="p-8 flex-1 overflow-hidden flex flex-col gap-6">
          
          {/* Bento Stats Row */}
          <div className="grid grid-cols-4 gap-4 select-none flex-shrink-0">
            <div className="bg-white border border-[#e5e5e5] rounded-lg px-4 py-3 shadow-2xs flex flex-col">
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Total Volunteers Loaded</div>
              <div className="text-2xl font-light text-slate-800 flex items-baseline gap-1.5 mt-auto">
                <span>{stats.totalUsers - 5}</span>
                <span className="text-xs text-slate-400 font-normal">/ 50 total users</span>
              </div>
            </div>

            <div className="bg-white border border-[#e5e5e5] rounded-lg px-4 py-3 shadow-2xs flex flex-col">
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 text-amber-600">Vacant Shifts Left</div>
              <div className="text-2xl font-light text-amber-500 mt-auto">{stats.vacantShifts}</div>
            </div>

            <div className="bg-white border border-[#e5e5e5] rounded-lg px-4 py-3 shadow-2xs flex flex-col">
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 text-indigo-600">Exchange Requests</div>
              <div className="text-2xl font-light text-[#4f46e5] mt-auto">{stats.exchangeRequests}</div>
            </div>

            <div className="bg-white border border-[#e5e5e5] rounded-lg px-4 py-3 shadow-2xs flex flex-col">
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 text-emerald-600">FCM Cloud Push Agent</div>
              <div className="text-2xl font-light text-emerald-500 mt-auto flex items-center gap-1.5">
                <span>Online</span>
                <Smartphone className="w-4 h-4 text-emerald-500 animate-bounce" />
              </div>
            </div>
          </div>

          {/* MAIN COLUMN SPACE (Tab Switcher) */}
          <div className="flex-1 bg-white border border-[#e5e5e5] rounded-lg shadow-2xs flex flex-col overflow-hidden">
            
            {/* VIEW TAB SELECTION CONTROLS */}
            <div className="bg-slate-50 border-b border-[#e5e5e5] h-12 px-6 flex items-center justify-between select-none">
              <div className="flex space-x-2">
                {currentUser.role === "volunteer" ? (
                  <div className="text-xs font-medium text-slate-600">
                    My Volunteer Dashboard
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTab("sheet")}
                      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        activeTab === "sheet"
                          ? "bg-slate-800 text-white"
                          : "text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Shifts Grid
                    </button>
                    <button
                      onClick={() => setActiveTab("directory")}
                      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        activeTab === "directory"
                          ? "bg-slate-800 text-white"
                          : "text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Team Member Directory
                    </button>
                    <button
                      onClick={() => setActiveTab("logs")}
                      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        activeTab === "logs"
                          ? "bg-slate-800 text-white"
                          : "text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Logs Emulator ({logs.length})
                    </button>
                  </>
                )}
              </div>

              {/* Status label based on Active view */}
              <div className="text-[11px] font-medium text-slate-500 font-mono">
                {currentUser.role === "volunteer" ? (
                  <span>Role: <strong className="text-slate-700">Volunteer</strong></span>
                ) : (
                  <>
                    Active tab context: <strong className="text-slate-700 capitalize">{activeTab}</strong>
                  </>
                )}
              </div>
            </div>

            {/* TAB CONTAINER BODY */}
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/20">

              {/* TAB 1: SPREADSHEET SHEET VIEW */}
              {activeTab === "sheet" && (
                <div className="flex-1 flex flex-col overflow-hidden p-1.5">
                  <GoogleSheetView 
                    shifts={shifts}
                    users={users}
                    currentUser={currentUser}
                    onUpdate={fetchData}
                  />
                </div>
              )}

              {/* TAB 2: TEAM DIRECTORY VIEW */}
              {activeTab === "directory" && (
                <div className="flex-1 overflow-auto custom-scrollbar p-6 flex flex-col gap-6">

                  {/* Team Management Panel (Super Admin Only) */}
                  {currentUser.role === "superadmin" && (
                    <div className="bg-white rounded-lg border border-[#e5e5e5] p-5">
                      <h3 className="text-sm font-semibold text-slate-800 mb-2 font-display flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#4f46e5]" />
                        <span>Create New Team</span>
                      </h3>
                      <p className="text-xs text-slate-500 mb-4 leading-normal">
                        Create a new team for managing volunteer shifts and invites.
                      </p>

                      <form onSubmit={handleCreateTeam} className="flex gap-3">
                        <input
                          type="text"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          placeholder="e.g. Hong Kong Shabbat Community"
                          className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                          required
                        />
                        <button
                          type="submit"
                          className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-4 py-2 font-semibold rounded hover:cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Team</span>
                        </button>
                      </form>

                      {teamSuccessMessage && (
                        <p className="text-xs text-green-600 bg-green-50 rounded p-2 mt-3 font-medium">✓ {teamSuccessMessage}</p>
                      )}
                      {teamErrorMessage && (
                        <p className="text-xs text-rose-600 bg-rose-50 rounded p-2 mt-3 font-medium">⚠ {teamErrorMessage}</p>
                      )}
                    </div>
                  )}

                  {/* Send Invite Panel (Admin & Super Admin) */}
                  {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
                    <div className="bg-white rounded-lg border border-[#e5e5e5] p-5">
                      <h3 className="text-sm font-semibold text-slate-800 mb-2 font-display flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-[#4f46e5]" />
                        <span>Send Invite to Volunteer</span>
                      </h3>
                      <p className="text-xs text-slate-500 mb-4 leading-normal">
                        Send an invite link to a new volunteer or team member to join the system.
                      </p>

                      <form onSubmit={handleSendInvite} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="volunteer@example.com"
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Team
                          </label>
                          <select
                            value={inviteTeamId}
                            onChange={(e) => setInviteTeamId(e.target.value)}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                            required
                          >
                            <option value="">Select Team</option>
                            {teams.length === 0 ? (
                              <option disabled>No teams available</option>
                            ) : (
                              teams.map((team) => (
                                <option key={team.teamId} value={team.teamId}>
                                  {team.name}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Role
                          </label>
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as "admin" | "volunteer")}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                          >
                            <option value="volunteer">Volunteer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div>
                          <button
                            type="submit"
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-2 font-semibold rounded hover:cursor-pointer transition-colors flex items-center justify-center gap-1"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Send Invite</span>
                          </button>
                        </div>
                      </form>

                      {inviteSuccessMessage && (
                        <p className="text-xs text-green-600 bg-green-50 rounded p-2 mt-3 font-medium">✓ {inviteSuccessMessage}</p>
                      )}
                      {inviteErrorMessage && (
                        <p className="text-xs text-rose-600 bg-rose-50 rounded p-2 mt-3 font-medium">⚠ {inviteErrorMessage}</p>
                      )}
                    </div>
                  )}

                  {/* Register New Volunteer Panel */}
                  <div className="bg-white rounded-lg border border-[#e5e5e5] p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 font-display flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-[#4f46e5]" />
                      <span>Administrative Services: Register New Team Member</span>
                    </h3>
                    <p className="text-xs text-slate-500 mb-4 leading-normal">
                      Provide information based on Synagogue protocol. Newly added users are synchronized to Auth and Firestore immediately.
                    </p>

                    <form onSubmit={handleCreateUserSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="e.g. Benjamin Levy"
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Email address
                        </label>
                        <input
                          type="email"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="e.g. benjamin@synagogue.org"
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Phone Number (Col E Backup)
                        </label>
                        <input
                          type="text"
                          value={newUserPhone}
                          onChange={(e) => setNewUserPhone(e.target.value)}
                          placeholder="e.g. +852 9123 4567"
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Assigned Role on Firestore
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value as "admin" | "volunteer")}
                            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-[#4f46e5]"
                          >
                            <option value="admin">Admin / Team Leader</option>
                            <option value="volunteer">Volunteer Specialist</option>
                          </select>
                          
                          <button
                            type="submit"
                            className="bg-slate-800 hover:bg-slate-900 border border-slate-800 text-white text-xs px-4 py-2 font-semibold rounded hover:cursor-pointer transition-colors shrink-0 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {userSuccessMessage && (
                      <p className="text-xs text-green-600 bg-green-50 rounded p-2 mt-3 font-medium">✓ {userSuccessMessage}</p>
                    )}
                    {userErrorMessage && (
                      <p className="text-xs text-rose-600 bg-rose-50 rounded p-2 mt-3 font-medium">⚠ {userErrorMessage}</p>
                    )}
                  </div>

                  {/* Users Directory Table */}
                  <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#e5e5e5] flex justify-between items-center bg-slate-50/50">
                      <div>
                        <h4 className="font-display font-semibold text-slate-800 text-xs uppercase tracking-wider">
                          Active Database Users Directory
                        </h4>
                        <p className="text-[10px] text-slate-500 uppercase mt-0.5 font-mono">
                          Viewing all registered security monitors & staff slots ({users.length} total users)
                        </p>
                      </div>
                    </div>

                    <table className="w-full font-sans text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase font-mono text-left">
                          <th className="px-6 py-3">Team Name</th>
                          <th className="px-6 py-3">Email Address</th>
                          <th className="px-6 py-3">Cell Contact</th>
                          <th className="px-6 py-3 text-center">Security Level (Role)</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.uid} className="border-b border-slate-100 hover:bg-slate-50/50 text-slate-700">
                            <td className="px-6 py-3.5 font-medium">{u.name} {u.uid === currentUser.uid && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-normal ml-1.5">Acting</span>}</td>
                            <td className="px-6 py-3.5 font-mono text-xs">{u.email}</td>
                            <td className="px-6 py-3.5 font-mono text-xs">{u.phone}</td>
                            <td className="px-6 py-3.5 text-center">
                              {currentUser.role === "superadmin" ? (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleUpdateRole(u.uid, e.target.value as any)}
                                  className="mx-auto text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700 font-medium"
                                >
                                  <option value="superadmin">Super Admin</option>
                                  <option value="admin">Admin</option>
                                  <option value="volunteer">Volunteer</option>
                                </select>
                              ) : (
                                <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                                  u.role === "superadmin" 
                                    ? "bg-purple-100 text-purple-800" 
                                    : u.role === "admin" 
                                    ? "bg-blue-100 text-blue-800" 
                                    : "bg-emerald-100 text-emerald-800"
                                }`}>
                                  {u.role}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              {/* Only Super Admins / Admins can delete users */}
                              {(currentUser.role === "superadmin" || currentUser.role === "admin") ? (
                                <button
                                  onClick={() => handleDeleteUser(u.uid)}
                                  disabled={u.uid === "user-superadmin"}
                                  className="text-rose-500 hover:text-rose-700 disabled:opacity-40 p-1 rounded hover:bg-rose-50 transition-colors"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4 inline-block" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Locked</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {/* TAB 3: EMULATOR LOGS */}
              {activeTab === "logs" && (
                <div className="flex-1 overflow-auto custom-scrollbar p-6 flex flex-col gap-6">
                  
                  {/* Console Header */}
                  <div className="bg-slate-900 text-white rounded-lg p-5 border border-slate-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <h4 className="font-display font-bold text-sm tracking-wide">Firebase Firestore Emulator & GCM Broadcast Console</h4>
                      </div>
                      <p className="text-slate-400 text-xs mt-1">
                        Live stream of RFC-5545 calendar invitations (.ics files), daily 24H cron jobs, and background FCM pushes.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={clearLogs}
                        className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 px-3 py-1.5 rounded font-mono font-semibold"
                      >
                        Flush Simulator Logs
                      </button>
                    </div>
                  </div>

                  {/* Terminal Logger List */}
                  <div className="bg-slate-950 font-mono text-xs text-slate-300 rounded-lg p-5 border border-slate-900 shadow-inner min-h-[400px] flex flex-col">
                    <div className="flex items-center gap-1.5 border-b border-slate-800 pb-3 mb-3 text-slate-500 select-none">
                      <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
                      <span className="w-3 h-3 bg-yellow-500 rounded-full inline-block"></span>
                      <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
                      <span className="ml-2">hkt-firebase-cloud-functions: emulator session feed</span>
                    </div>

                    {logs.length === 0 ? (
                      <p className="text-slate-500 italic py-12 text-center select-none">No emulator logs recorded. Trigger a shift assignment or run the daily reminder to inspect GCM events.</p>
                    ) : (
                      <div className="space-y-3.5 flex-1 select-text">
                        {logs.map((log) => (
                          <div key={log.id} className="border-b border-slate-900/60 pb-3 last:border-0">
                            <div className="flex items-start md:items-center justify-between gap-2 text-[11px] mb-1">
                              <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString("en-HK", { hour12: false }) + " HKT"}</span>
                              <span className={`px-1.5 py-0.5 rounded uppercase font-bold text-[9px] ${
                                log.type === "fcm" 
                                  ? "bg-purple-950 text-purple-300 border border-purple-800/60" 
                                  : log.type === "email" 
                                  ? "bg-blue-950 text-blue-300 border border-blue-800/60" 
                                  : "bg-slate-800 text-slate-300"
                              }`}>
                                {log.type === "fcm" ? "FCM BROADCAST" : log.type === "email" ? "SMTP RFC-5545 CAL" : "FIRESTORE STATE"}
                              </span>
                            </div>

                            <p className="text-slate-200 mt-1">{log.message}</p>

                            {/* Detailed diagnostics panel expand */}
                            {log.details && (
                              <pre className="bg-slate-900 text-slate-400 p-2.5 rounded text-[10px] mt-2 overflow-x-auto whitespace-pre-wrap max-h-44 custom-scrollbar">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB: VOLUNTEER DASHBOARD */}
              {activeTab === "my-shifts" && currentUser.role === "volunteer" && (
                <VolunteerDashboard
                  currentUser={currentUser}
                  shifts={shifts}
                  users={users}
                  onUpdate={fetchData}
                />
              )}

            </div>

          </div>

        </section>

        {/* SYSTEM STATUS FOOTER */}
        <footer className="h-12 bg-white border-t border-[#e5e5e5] px-8 flex items-center justify-between text-[11px] text-gray-400 select-none">
          <div className="flex space-x-6 font-medium">
            <span className="text-slate-500 font-semibold font-display">System Epoch: June 2026</span>
            <span>|</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span>
              Hebcal REST API Status: Active
            </span>
            <span>|</span>
            <span>Schedules Cache Horizon: 3-Months Vacant Rollout</span>
          </div>
          <div>
            FCM Cloud Messaging Agent: <span className="text-green-500 font-bold uppercase font-mono text-[10px]">Active and Operational</span>
          </div>
        </footer>

      </main>

    </div>
  );
}
