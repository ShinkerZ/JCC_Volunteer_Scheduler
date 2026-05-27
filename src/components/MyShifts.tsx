import React, { useState } from "react";
import { Download, Repeat2, AlertCircle } from "lucide-react";
import { User, Shift } from "../types";

interface MyShiftsProps {
  shifts: Shift[];
  currentUser: User;
  users: User[];
  onUpdate: () => void;
}

export default function MyShifts({
  shifts,
  currentUser,
  users,
  onUpdate
}: MyShiftsProps) {
  const [requestingExchange, setRequestingExchange] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleRequestExchange = async (shiftId: string) => {
    setRequestingExchange(shiftId);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/shifts/${shiftId}/request-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: currentUser.uid })
      });

      if (response.ok) {
        setSuccessMessage("Exchange request submitted successfully!");
        onUpdate();
      } else {
        const err = await response.json();
        setErrorMessage(err.error || "Failed to request exchange");
      }
    } catch (err) {
      setErrorMessage("Network error requesting exchange");
    } finally {
      setRequestingExchange(null);
    }
  };

  const handleDownloadICS = (shiftId: string) => {
    const link = document.createElement("a");
    link.href = `/api/download-ics/${shiftId}`;
    link.download = `shabbat-shift-${shiftId}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (shifts.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-600 mb-2">No shifts assigned</h3>
        <p className="text-slate-500">You don't have any shifts assigned yet. Check the Available Shifts tab to claim one.</p>
      </div>
    );
  }

  // Sort shifts by date
  const sortedShifts = [...shifts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4">
        {sortedShifts.map((shift) => {
          const isUpcoming = new Date(shift.date) > new Date();
          const isToday = shift.date === new Date().toISOString().split("T")[0];
          const isRequestingExchange = shift.status === "pending_exchange";

          return (
            <div
              key={shift.shiftId}
              className={`bg-white rounded-lg border-l-4 border-slate-200 p-4 hover:shadow-md transition-shadow ${
                isToday ? "border-l-amber-500 bg-amber-50" : ""
              } ${isRequestingExchange ? "border-l-yellow-500 bg-yellow-50" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      {shift.type}
                    </span>
                    {isToday && (
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        Today
                      </span>
                    )}
                    {isRequestingExchange && (
                      <span className="text-xs font-bold uppercase tracking-wider text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                        Swap Requested
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Date</p>
                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {new Date(shift.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric"
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Time (HKT)</p>
                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {shift.startTime} - {shift.endTime}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Duration</p>
                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {shift.type === "Friday" ? "1.5 hrs" : "4 hrs"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleDownloadICS(shift.shiftId)}
                    title="Download calendar file"
                    className="p-2 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {isUpcoming && !isRequestingExchange && (
                    <button
                      onClick={() => handleRequestExchange(shift.shiftId)}
                      disabled={requestingExchange === shift.shiftId}
                      title="Request to swap this shift"
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <Repeat2 className="w-3.5 h-3.5" />
                      {requestingExchange === shift.shiftId ? "Requesting..." : "Request Swap"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
