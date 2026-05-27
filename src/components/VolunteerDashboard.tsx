import React, { useState, useEffect } from "react";
import { Clock, Calendar, Plus, AlertCircle, CheckCircle, Download, Repeat2, Settings } from "lucide-react";
import { User, Shift } from "../types";
import MyShifts from "./MyShifts";
import AvailableShifts from "./AvailableShifts";

interface VolunteerDashboardProps {
  currentUser: User;
  shifts: Shift[];
  users: User[];
  onUpdate: () => void;
}

export default function VolunteerDashboard({
  currentUser,
  shifts,
  users,
  onUpdate
}: VolunteerDashboardProps) {
  const [activeSection, setActiveSection] = useState<"my-shifts" | "available" | "settings">("my-shifts");
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(currentUser.googleCalendarSyncEnabled || false);

  // Filter shifts for this volunteer's team
  const teamShifts = shifts.filter(s => {
    // For now, all shifts are available to the team
    // In future, could add explicit team field to shifts
    return true;
  });

  const myShifts = teamShifts.filter(s => s.assignedUserId === currentUser.uid);
  const availableShifts = teamShifts.filter(s => s.status === "vacant");
  const pendingExchangeShifts = teamShifts.filter(s => s.status === "pending_exchange" && s.assignedUserId !== currentUser.uid);

  const stats = {
    assigned: myShifts.length,
    available: availableShifts.length,
    pendingSwaps: myShifts.filter(s => s.status === "pending_exchange").length
  };

  const handleToggleCalendarSync = async () => {
    try {
      const response = await fetch(`/api/users/${currentUser.uid}/google-calendar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncEnabled: !calendarSyncEnabled })
      });
      if (response.ok) {
        setCalendarSyncEnabled(!calendarSyncEnabled);
        onUpdate();
      }
    } catch (err) {
      console.error("Failed to update calendar settings:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3 px-6 pt-4 pb-3 flex-shrink-0">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex flex-col">
          <div className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider mb-1">My Shifts</div>
          <div className="text-2xl font-light text-emerald-700">{stats.assigned}</div>
          <p className="text-xs text-emerald-600 mt-1">Assigned to you</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-col">
          <div className="text-[10px] text-blue-600 uppercase font-bold tracking-wider mb-1">Available</div>
          <div className="text-2xl font-light text-blue-700">{stats.available}</div>
          <p className="text-xs text-blue-600 mt-1">You can claim</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col">
          <div className="text-[10px] text-amber-600 uppercase font-bold tracking-wider mb-1">Pending Swaps</div>
          <div className="text-2xl font-light text-amber-700">{stats.pendingSwaps}</div>
          <p className="text-xs text-amber-600 mt-1">Awaiting exchange</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex gap-4 flex-shrink-0">
        <button
          onClick={() => setActiveSection("my-shifts")}
          className={`pb-2 border-b-2 transition-colors text-sm font-medium ${
            activeSection === "my-shifts"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-1.5" />
          My Shifts
        </button>
        <button
          onClick={() => setActiveSection("available")}
          className={`pb-2 border-b-2 transition-colors text-sm font-medium ${
            activeSection === "available"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Plus className="w-4 h-4 inline mr-1.5" />
          Available Shifts
        </button>
        <button
          onClick={() => setActiveSection("settings")}
          className={`pb-2 border-b-2 transition-colors text-sm font-medium ${
            activeSection === "settings"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Settings className="w-4 h-4 inline mr-1.5" />
          Settings
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeSection === "my-shifts" && (
          <MyShifts
            shifts={myShifts}
            currentUser={currentUser}
            users={users}
            onUpdate={onUpdate}
          />
        )}

        {activeSection === "available" && (
          <AvailableShifts
            shifts={availableShifts}
            currentUser={currentUser}
            onUpdate={onUpdate}
          />
        )}

        {activeSection === "settings" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold mb-6 text-slate-800">Volunteer Settings</h3>

              {/* Profile Section */}
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">Profile Information</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Name</label>
                    <p className="text-slate-800 font-medium mt-1">{currentUser.name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
                    <p className="text-slate-800 font-medium mt-1">{currentUser.email}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</label>
                    <p className="text-slate-800 font-medium mt-1">{currentUser.phone}</p>
                  </div>
                  {currentUser.teamId && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Team ID</label>
                      <p className="text-slate-800 font-medium mt-1 font-mono text-sm">{currentUser.teamId}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Google Calendar Settings */}
              <div className="border-t border-slate-200 pt-8">
                <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">Calendar Integration</h4>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="font-medium text-slate-800">Google Calendar Sync</p>
                        <p className="text-xs text-slate-600 mt-1">Automatically add shifts to your Google Calendar</p>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleCalendarSync}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        calendarSyncEnabled
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {calendarSyncEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                  {calendarSyncEnabled && (
                    <p className="text-xs text-green-600 mt-3 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Shifts will be synced to your Google Calendar when assigned
                    </p>
                  )}
                </div>
              </div>

              {/* Help Section */}
              <div className="border-t border-slate-200 pt-8 mt-8">
                <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">Need Help?</h4>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-900">
                    View available shifts in the <strong>Available Shifts</strong> tab to claim shifts. Request a swap from your assigned shifts in the <strong>My Shifts</strong> tab.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
