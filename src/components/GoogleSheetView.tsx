import React, { useState } from "react";
import { 
  Calendar, 
  Clock, 
  UserPlus, 
  UserMinus, 
  RefreshCcw, 
  ArrowLeftRight, 
  Download, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  
} from "lucide-react";
import { Shift, User } from "../types";

interface GoogleSheetViewProps {
  shifts: Shift[];
  users: User[];
  currentUser: User;
  onUpdate: () => void;
}

export default function GoogleSheetView({ 
  shifts, 
  users, 
  currentUser, 
  onUpdate 
}: GoogleSheetViewProps) {
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // State for Admin edit dialog
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [modalAssignedUser, setModalAssignedUser] = useState<string>("");
  const [modalStartTime, setModalStartTime] = useState("");
  const [modalEndTime, setModalEndTime] = useState("");

  const volunteers = users.filter(u => u.role === "volunteer");
  const selectedShift = shifts.find(s => s.shiftId === selectedShiftId);

  // Filter & Sort shifts
  const sortedShifts = [...shifts].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const filteredShifts = sortedShifts.filter(shift => {
    const assignedUser = users.find(u => u.uid === shift.assignedUserId);
    const userName = assignedUser ? assignedUser.name.toLowerCase() : "vacant";
    const dateMatches = shift.date.includes(searchTerm) || shift.type.toLowerCase().includes(searchTerm.toLowerCase());
    const userMatches = userName.includes(searchTerm.toLowerCase());
    const matchesSearch = dateMatches || userMatches;

    const matchesStatus = statusFilter === "all" || shift.status === statusFilter;
    const matchesType = typeFilter === "all" || shift.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Handle cell click selection
  const handleCellClick = (shiftId: string) => {
    setSelectedShiftId(shiftId);
  };

  const formatDate = (isoDate: string) => {
    const dt = new Date(isoDate);
    if (isNaN(dt.getTime())) return isoDate;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Open Edit Dialog for Admins
  const openEditModal = (shift: Shift) => {
    setEditingShift(shift);
    setModalAssignedUser(shift.assignedUserId || "");
    setModalStartTime(shift.startTime);
    setModalEndTime(shift.endTime);
    setIsEditModalOpen(true);
  };

  // Submit Admin manual overrides or override names
  const handleAdminSave = async () => {
    if (!editingShift) return;

    try {
      const response = await fetch(`/api/shifts/${editingShift.shiftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: modalAssignedUser || null,
          startTime: modalStartTime,
          endTime: modalEndTime,
        }),
      });

      if (response.ok) {
        setIsEditModalOpen(false);
        setEditingShift(null);
        onUpdate();
      } else {
        alert("Failed to update shift. Please try again.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Volunteer claims vacant shift
  const handleClaimShift = async (shiftId: string) => {
    try {
      const response = await fetch(`/api/shifts/${shiftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: currentUser.uid }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        const errData = await response.json();
        alert(errData.error || "Failed to claim shift.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Volunteer requests exchange
  const handleRequestExchange = async (shiftId: string) => {
    try {
      const response = await fetch(`/api/shifts/${shiftId}/request-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: currentUser.uid }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert("Failed to request shift exchange.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Volunteer claims a shift that is pending exchange (swapping it)
  const handleApproveExchange = async (shiftId: string) => {
    try {
      const response = await fetch(`/api/shifts/${shiftId}/approve-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimUserUid: currentUser.uid }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert("Failed to take over exchange shift.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Highlight classes for rows & active selected cells
  const getCellClasses = (shiftId: string, col: string) => {
    const isSelected = selectedShiftId === shiftId && selectedColumn === col;
    const base = "px-4 py-2 text-sm text-gray-700 border-r border-b border-gray-200 transition-all cursor-cell select-none h-12 align-middle truncate relative";
    return isSelected ? `${base} bg-blue-50/70 ring-2 ring-blue-500 ring-inset z-10 font-medium` : `${base} hover:bg-slate-50/40`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[700px]">
      
      {/* 1. Header Toolbar of The Sheet */}
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-md">
            <Calendar className="w-4 h-4" />
          </span>
          <div>
            <h3 className="font-display font-semibold text-slate-800 flex items-center gap-1.5">
              <span>Shifts Grid</span>
              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-normal">HKT (UTC+8)</span>
            </h3>
            <p className="text-xs text-slate-500">Google Sheet style scheduling grid with real-time solar tracking</p>
          </div>
        </div>

        {/* Filters and search options */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search date or user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 w-44 bg-white border border-slate-200 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-400 font-sans"
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1">
            <span className="p-0.5 text-slate-400">
              <Filter className="w-3 h-3" />
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-[11px] text-slate-600 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="vacant">Vacant Slots</option>
              <option value="assigned">Assigned</option>
              <option value="pending_exchange">Pending Swap</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-[11px] text-slate-600 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Days</option>
              <option value="Friday">Friday Shabbat</option>
              <option value="Saturday">Saturday</option>
            </select>
          </div>
        </div>
      </div>

      {/* Simplified header — functions toolbar removed */}

      {/* 3. Shift Cell Grid (Scrollable spreadsheet) */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-100">
        <table className="w-full border-collapse bg-white table-fixed min-w-[800px]">
          {/* Column identifiers (A, B, C, D, E...) */}
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold select-none sticky top-0 z-20">
              <th className="w-[18%] border-r border-b border-slate-200 text-left px-4 h-8 select-none font-normal">
                Date (HKT)
              </th>
              <th className="w-[18%] border-r border-b border-slate-200 text-left px-4 h-8 select-none font-normal">
                Shift Time
              </th>
              <th className="w-[16%] border-r border-b border-slate-200 text-left px-4 h-8 select-none font-normal">
                Type
              </th>
              <th className="w-[28%] border-r border-b border-slate-200 text-left px-4 h-8 select-none font-normal">
                Assigned Volunteer
              </th>
              <th className="w-[20%] border-r border-b border-slate-200 text-left px-4 h-8 select-none font-normal">
                Status
              </th>
            </tr>
          </thead>
          
          {/* Main Rows */}
          <tbody>
            {filteredShifts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 font-sans">
                  <span className="block text-base font-medium text-slate-500 mb-1">No Shifts Found</span>
                  <span className="text-xs">Adjust search keys or type filters.</span>
                </td>
              </tr>
            ) : (
              filteredShifts.map((shift, idx) => {
                const assignedUser = users.find(u => u.uid === shift.assignedUserId);
                
                return (
                  <tr key={shift.shiftId} className="group border-b border-slate-100 hover:bg-slate-50/50">

                    {/* Col A: Date */}
                    <td 
                      onClick={() => handleCellClick(shift.shiftId)}
                      className={getCellClasses(shift.shiftId, "A")}
                    >
                      <div className="flex items-center gap-1.5 font-sans">
                        <span className="font-mono text-xs">{formatDate(shift.date)}</span>
                      </div>
                    </td>

                    {/* Col B: Shift Time */}
                    <td 
                      onClick={() => handleCellClick(shift.shiftId)}
                      className={getCellClasses(shift.shiftId, "B")}
                    >
                      <div className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{shift.startTime} - {shift.endTime}</span>
                      </div>
                    </td>

                    {/* Col C: Type */}
                    <td 
                      onClick={() => handleCellClick(shift.shiftId)}
                      className={getCellClasses(shift.shiftId, "C")}
                    >
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-mono font-medium ${
                        shift.type === "Friday" 
                          ? "bg-amber-50 text-amber-800 border border-amber-200/50" 
                          : "bg-blue-50 text-blue-800 border border-blue-200/50"
                      }`}>
                        {shift.type}
                      </span>
                    </td>

                    {/* Col D: Assigned Volunteer */}
                    <td 
                      onClick={() => handleCellClick(shift.shiftId)}
                      className={getCellClasses(shift.shiftId, "D")}
                    >
                      {assignedUser ? (
                        <div className="flex items-center gap-1 w-full truncate">
                          <span className="font-medium text-slate-700 truncate">{assignedUser.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[13px] tracking-wide">-- Vacant Slot --</span>
                      )}
                    </td>

                    {/* Col E: Status cell */}
                    <td 
                      onClick={() => handleCellClick(shift.shiftId)}
                      className={getCellClasses(shift.shiftId, "E")}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                          shift.status === "assigned"
                            ? "bg-green-50 text-green-700 border border-green-200/50"
                            : shift.status === "pending_exchange"
                            ? "bg-rose-50 text-rose-700 border border-rose-200/50 animate-pulse"
                            : "bg-slate-50 text-slate-500 border border-slate-200/50"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            shift.status === "assigned"
                              ? "bg-green-500"
                              : shift.status === "pending_exchange"
                              ? "bg-rose-500"
                              : "bg-slate-300"
                          }`} />
                          {shift.status === "assigned" && "Assigned"}
                          {shift.status === "pending_exchange" && "Swap Requested"}
                          {shift.status === "vacant" && "Vacant"}
                        </span>

                        {/* Direct Download .ics Calendar trigger */}
                        {shift.assignedUserId && (
                          <a
                            href={`/api/download-ics/${shift.shiftId}`}
                            title="Download calendar .ics file"
                            className="bg-slate-100 hover:bg-slate-200 border border-slate-200 p-1 rounded text-slate-500 transition-colors shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Action Summary Footer Panel (Interactions) */}
      <div className="bg-slate-50 border-t border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div>
          {selectedShift ? (
            <div className="text-sm text-slate-600">
              Selected: <strong className="text-slate-800 font-mono">{formatDate(selectedShift.date)} ({selectedShift.type})</strong> -{" "}
              {selectedShift.assignedUserId ? (
                <span>Assigned to <strong className="text-slate-800">{users.find(u => u.uid === selectedShift.assignedUserId)?.name}</strong></span>
              ) : (
                <span className="text-emerald-700 font-semibold">Vacant and claimable</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Select any row in the spreadsheet to interact. Column D manages shift claim, trade request and overrides.</span>
            </div>
          )}
        </div>

        {/* Dynamic Context Actions depending on user role and row state */}
        <div className="flex items-center gap-2">
          {selectedShift && (
            <>
              {/* ADMIN ACTIONS: Manual override and cell editing */}
              {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
                <button
                  onClick={() => openEditModal(selectedShift)}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-md hover:cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Override Cells</span>
                </button>
              )}

              {/* VOLUNTEER ACTIONS */}
              {currentUser.role === "volunteer" && (
                <>
                  {/* Vacant -> Claim */}
                  {selectedShift.status === "vacant" && (
                    <button
                      onClick={() => handleClaimShift(selectedShift.shiftId)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-md hover:cursor-pointer transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Claim Vacant Shift</span>
                    </button>
                  )}

                  {/* My assigned shift -> Release / Swap Request */}
                  {selectedShift.assignedUserId === currentUser.uid && selectedShift.status === "assigned" && (
                    <button
                      onClick={() => handleRequestExchange(selectedShift.shiftId)}
                      className="bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold px-4 py-2 rounded-md hover:cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Request Shift Exchange</span>
                    </button>
                  )}

                  {/* Other's pending swap shift -> claim swap */}
                  {selectedShift.status === "pending_exchange" && selectedShift.assignedUserId !== currentUser.uid && (
                    <button
                      onClick={() => handleApproveExchange(selectedShift.shiftId)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-md hover:cursor-pointer transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 animate-spin-slow" />
                      <span>Approve & Swap Shift</span>
                    </button>
                  )}

                  {selectedShift.assignedUserId === currentUser.uid && selectedShift.status === "pending_exchange" && (
                    <span className="text-xs text-rose-600 font-medium">Group alert broadcasted. Awaiting trade...</span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 5. Google Sheets Style Override Modal (Admin only) */}
      {isEditModalOpen && editingShift && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-display font-bold text-slate-800">
                Sheets Cell Override: Row {filteredShifts.findIndex(s => s.shiftId === editingShift.shiftId) + 1}
              </h4>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Active Shift Date
                </label>
                <div className="bg-slate-100 px-3 py-2 rounded-md text-slate-800 text-sm font-mono flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{formatDate(editingShift.date)} ({editingShift.type})</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Assigned Volunteer (Col D)
                </label>
                <select
                  value={modalAssignedUser}
                  onChange={(e) => setModalAssignedUser(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-md text-sm px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">-- VACANT --</option>
                  {volunteers.map((v) => (
                    <option key={v.uid} value={v.uid}>
                      {v.name} ({v.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Start HKT (Col B)
                  </label>
                  <input
                    type="text"
                    value={modalStartTime}
                    onChange={(e) => setModalStartTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md text-sm px-3 py-2 text-slate-700 font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                    placeholder="HH:MM"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    End HKT (Col B)
                  </label>
                  <input
                    type="text"
                    value={modalEndTime}
                    onChange={(e) => setModalEndTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md text-sm px-3 py-2 text-slate-700 font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                    placeholder="HH:MM"
                    required
                  />
                </div>
              </div>

              {editingShift.type === "Friday" && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded p-2.5 leading-relaxed">
                  💡 <strong>HK Shabbat Candle-lighting Rule:</strong> Friday shifts should be exactly 1.5 hours in duration, beginning 30 minutes before sunset. Ensure manual inputs stay aligned to maintain operations.
                </p>
              )}
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="bg-transparent hover:bg-slate-100 text-slate-600 text-xs font-semibold px-4 py-2 rounded-md cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminSave}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-md cursor-pointer transition-colors"
              >
                Apply Overrides
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
