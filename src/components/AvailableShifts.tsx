import React, { useState, useMemo } from "react";
import { Plus, Filter, AlertCircle } from "lucide-react";
import { Shift, User } from "../types";

interface AvailableShiftsProps {
  shifts: Shift[];
  currentUser: User;
  onUpdate: () => void;
}

export default function AvailableShifts({
  shifts,
  currentUser,
  onUpdate
}: AvailableShiftsProps) {
  const [filterType, setFilterType] = useState<"all" | "Friday" | "Saturday">("all");
  const [claimingShift, setClaimingShift] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredShifts = useMemo(() => {
    let result = [...shifts];

    // Filter by type
    if (filterType !== "all") {
      result = result.filter((s) => s.type === filterType);
    }

    // Only future shifts
    const today = new Date().toISOString().split("T")[0];
    result = result.filter((s) => s.date >= today);

    // Sort by date
    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [shifts, filterType]);

  const handleClaimShift = async (shiftId: string) => {
    setClaimingShift(shiftId);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/shifts/${shiftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: currentUser.uid })
      });

      if (response.ok) {
        setSuccessMessage("Shift claimed successfully! Check your My Shifts tab.");
        onUpdate();
        // Clear message after 3 seconds
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        const err = await response.json();
        setErrorMessage(err.error || "Failed to claim shift");
      }
    } catch (err) {
      setErrorMessage("Network error claiming shift");
    } finally {
      setClaimingShift(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">Filter by type:</span>
        </div>
        <div className="flex gap-2">
          {["all", "Friday", "Saturday"].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type as "all" | "Friday" | "Saturday")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === type
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {type === "all" ? "All Days" : type === "Friday" ? "Friday Shabbat" : "Saturday Shabbat"}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <span className="text-lg">✓</span>
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {errorMessage}
        </div>
      )}

      {/* Shifts Grid */}
      {filteredShifts.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-600 mb-2">No available shifts</h3>
          <p className="text-slate-500">
            {filterType === "all"
              ? "No vacant shifts available right now. Check back later!"
              : `No vacant ${filterType} shifts available. Try a different filter.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredShifts.map((shift) => {
            const shiftDate = new Date(shift.date);
            const dayOfWeek = shiftDate.toLocaleDateString("en-US", { weekday: "long" });
            const dateStr = shiftDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

            return (
              <div
                key={shift.shiftId}
                className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Type Badge */}
                <div className="mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded inline-block">
                    {shift.type} Shabbat
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 mb-4">
                  <p className="text-sm font-semibold text-slate-800 mb-1">
                    {dayOfWeek}
                  </p>
                  <p className="text-2xl font-light text-slate-600 mb-3">
                    {dateStr}
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium uppercase">Time (HKT):</span>
                      <span className="font-medium text-slate-700">
                        {shift.startTime} - {shift.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium uppercase">Duration:</span>
                      <span className="font-medium text-slate-700">
                        {shift.type === "Friday" ? "1.5 hours" : "4 hours"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Claim Button */}
                <button
                  onClick={() => handleClaimShift(shift.shiftId)}
                  disabled={claimingShift === shift.shiftId}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {claimingShift === shift.shiftId ? "Claiming..." : "Claim Shift"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
