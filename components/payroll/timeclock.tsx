"use client";

import { useState } from "react";
import {
  Clock,
  Play,
  Square,
  Coffee,
  Calendar,
  Timer,
  History,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const currentSession = {
  employee: "Alice Johnson",
  role: "Store Manager",
  department: "Retail",
  clockedIn: "2024-01-15 08:30",
  duration: "6h 15m",
  status: "active",
  breaks: 2,
};

const recentActivity = [
  { time: "08:30", action: "Clocked In", type: "start", location: "Main Entrance" },
  { time: "10:45", action: "Break Started", type: "break", location: "Staff Room" },
  { time: "11:00", action: "Break Ended", type: "resume", location: "Staff Room" },
  { time: "13:00", action: "Lunch Started", type: "break", location: "Cafeteria" },
  { time: "14:00", action: "Lunch Ended", type: "resume", location: "Cafeteria" },
];

const weeklyStats = {
  hoursWorked: "38h 30m",
  overtime: "2h 30m",
  expected: "40h 00m",
  remaining: "1h 30m",
};

export function PayrollTimeClock() {
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [isOnBreak, setIsOnBreak] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time Clock</h1>
          <p className="text-sm text-slate-500">Clock in/out and track your work hours</p>
        </div>
        <Badge className={isClockedIn ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
          {isClockedIn ? (isOnBreak ? "On Break" : "On Duty") : "Off Duty"}
        </Badge>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Hours This Week</p>
          <p className="text-2xl font-bold text-slate-900">{weeklyStats.hoursWorked}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Overtime</p>
          <p className="text-2xl font-bold text-amber-600">{weeklyStats.overtime}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Expected</p>
          <p className="text-2xl font-bold text-blue-600">{weeklyStats.expected}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Remaining</p>
          <p className="text-2xl font-bold text-purple-600">{weeklyStats.remaining}</p>
        </div>
      </div>

      {/* Current Status Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="h-10 w-10 text-blue-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{currentSession.employee}</h2>
        <p className="text-slate-500 mb-1">{currentSession.role}</p>
        <p className="text-sm text-slate-400 mb-6">{currentSession.department}</p>

        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Today</p>
            <p className="text-xl font-bold text-slate-900">{currentSession.duration}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Started</p>
            <p className="text-xl font-bold text-slate-900">08:30</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Breaks</p>
            <p className="text-xl font-bold text-slate-900">{currentSession.breaks}</p>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          {!isOnBreak ? (
            <Button 
              variant="outline" 
              size="lg" 
              className="gap-2"
              onClick={() => { setIsOnBreak(true); toast.success("Break started"); }}
              disabled={!isClockedIn}
            >
              <Coffee className="h-5 w-5" />
              Start Break
            </Button>
          ) : (
            <Button 
              size="lg" 
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => { setIsOnBreak(false); toast.success("Break ended"); }}
            >
              <Play className="h-5 w-5" />
              End Break
            </Button>
          )}
          
          <Button 
            variant={isClockedIn ? "destructive" : "default"}
            size="lg" 
            className={cn("gap-2 px-8", !isClockedIn && "bg-blue-600 hover:bg-blue-700")}
            onClick={() => { setIsClockedIn(!isClockedIn); toast.success(isClockedIn ? "Clocked out" : "Clocked in"); }}
          >
            {isClockedIn ? (
              <><Square className="h-5 w-5" /> Clock Out</>
            ) : (
              <><Play className="h-5 w-5" /> Clock In</>
            )}
          </Button>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <History className="h-5 w-5" />
          Today's Activity
        </h3>
        <div className="space-y-3">
          {recentActivity.map((activity, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                activity.type === "start" && "bg-green-100",
                activity.type === "break" && "bg-amber-100",
                activity.type === "resume" && "bg-blue-100"
              )}>
                {activity.type === "start" && <Clock className="h-5 w-5 text-green-600" />}
                {activity.type === "break" && <Coffee className="h-5 w-5 text-amber-600" />}
                {activity.type === "resume" && <Play className="h-5 w-5 text-blue-600" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-900">{activity.action}</p>
                <p className="text-xs text-slate-500">{activity.location}</p>
              </div>
              <p className="text-sm text-slate-500 font-mono">{activity.time}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
