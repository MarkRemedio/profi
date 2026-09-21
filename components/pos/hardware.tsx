"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Printer,
  ScanBarcode,
  CreditCard,
  Wifi,
  CheckCircle2,
  XCircle,
  Settings,
  RotateCw,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const initialDevices = [
  { id: "1", name: "Thermal Receipt Printer", type: "printer", model: "EPSON TM-T20 III", status: "connected", ip: "192.168.1.101", port: "9100" },
  { id: "2", name: "Handheld Barcode Scanner", type: "scanner", model: "Honeywell Voyager 1200g", status: "connected", ip: "USB Interface HID", port: "-" },
  { id: "3", name: "Integrated EMV Card Terminal", type: "terminal", model: "Ingenico iCT220 Secure", status: "connected", ip: "192.168.1.102", port: "443" },
  { id: "4", name: "Heavy Duty Cash Drawer", type: "drawer", model: "APG Vasario Series", status: "connected", ip: "USB Relay Trigger", port: "-" },
  { id: "5", name: "Secondary Customer Display", type: "display", model: "POS-X XP-8200 Pole", status: "disconnected", ip: "192.168.1.103", port: "8080" },
];

const deviceIcons = {
  printer: Printer,
  scanner: ScanBarcode,
  terminal: CreditCard,
  drawer: Plug,
  display: Plug,
};

export function POSHardware() {
  const [devices, setDevices] = useState(initialDevices);
  const [autoConnect, setAutoConnect] = useState(true);
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  
  // Edit Dialog States
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [editIp, setEditIp] = useState("");
  const [editPort, setEditPort] = useState("");

  // Load configuration states from LocalStorage safely on client execution
  useEffect(() => {
    const cachedConfig = localStorage.getItem("pos_hardware_autoconnect");
    if (cachedConfig !== null) setAutoConnect(JSON.parse(cachedConfig));
  }, []);

  const handleToggleAutoConnect = (checked: boolean) => {
    setAutoConnect(checked);
    localStorage.setItem("pos_hardware_autoconnect", JSON.stringify(checked));
    toast.success(checked ? "Startup auto-ping arrays activated." : "Startup auto-ping arrays bypassed.");
  };

  // 🚀 REAL-TIME IP PING LOOP SIMULATION
  const handlePingTest = (deviceId: string, name: string) => {
    setTestingDevice(deviceId);
    setTimeout(() => {
      setTestingDevice(null);
      
      // Dynamic random fail state logic loop to mimic physical networking drops
      const shouldPass = Math.random() > 0.15; 
      if (shouldPass) {
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: "connected" } : d));
        toast.success(`Communication test loop resolved successfully for [${name}].`);
      } else {
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: "disconnected" } : d));
        toast.error(`Hardware link handshake failure detected on targeted network socket for [${name}].`);
      }
    }, 1500);
  };

  const handleSaveChanges = () => {
    setDevices(prev => prev.map(d => d.id === editingDevice.id ? { ...d, ip: editIp, port: editPort } : d));
    toast.success(`Port assignment settings saved for ${editingDevice.name}.`);
    setEditingDevice(null);
  };

  // Derive running micro panel macro counts
  const deviceMetrics = useMemo(() => {
    const connected = devices.filter(d => d.status === "connected").length;
    const disconnected = devices.filter(d => d.status === "disconnected").length;
    return { connected, disconnected };
  }, [devices]);

  return (
    <div className="space-y-6">
      {/* Header Context Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hardware Peripheral Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Map bus interfaces, verify physical connectivity links, and execute driver test diagnostic arrays</p>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 h-11 shrink-0 w-full sm:w-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Auto-ping On Boot</span>
          <Switch checked={autoConnect} onCheckedChange={handleToggleAutoConnect} />
        </div>
      </div>

      {/* Metrics Top Section Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Online Peripherals</p>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">{deviceMetrics.connected}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Offline Criticals</p>
              <p className="text-2xl font-black text-rose-600 mt-0.5">{deviceMetrics.disconnected}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Wifi className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Local Bus Status</p>
              <p className="text-2xl font-black text-blue-600 mt-0.5">LAN Node Online</p>
            </div>
          </div>
        </div>
      </div>

      {/* Peripheral Table Deck Board */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm">System Bus Peripheral Map</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {devices.map((device) => {
            const Icon = deviceIcons[device.type as keyof typeof deviceIcons] || Plug;
            const isOnline = device.status === "connected";
            
            return (
              <div key={device.id} className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60 transition group">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center border transition-colors shrink-0 shadow-2xs",
                    isOnline ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-200/60 text-slate-400"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{device.name}</p>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">{device.model} • <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px] text-slate-500 font-bold">{device.ip}</span></p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-50 pt-3 sm:border-t-0 sm:pt-0">
                  <div className="sm:text-right">
                    <Badge className={cn(
                      "shadow-2xs rounded-lg px-2.5 py-0.5 text-[10px] border font-bold capitalize tracking-wide",
                      isOnline ? "bg-emerald-50 text-emerald-700 border-emerald-200/40" : "bg-rose-50 text-rose-700 border-rose-200/40"
                    )}>
                      {device.status}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="outline" 
                      className="h-9 font-semibold text-xs border-slate-200 rounded-lg bg-white min-w-[70px] hover:bg-slate-5"
                      disabled={testingDevice === device.id}
                      onClick={() => handlePingTest(device.id, device.name)}
                    >
                      {testingDevice === device.id ? (
                        <RotateCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                      ) : (
                        "Test Link"
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      onClick={() => {
                        setEditingDevice(device);
                        setEditIp(device.ip);
                        setEditPort(device.port);
                      }}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Settings Dialog Modals */}
      <Dialog open={editingDevice !== null} onOpenChange={(open) => !open && setEditingDevice(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-bold text-lg text-slate-900">Configure Hardware Driver</DialogTitle>
            <DialogDescription>Modify communication strings for <span className="font-bold text-slate-800">{editingDevice?.name}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3 font-medium">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">IP Target / Bus Channel String</label>
              <Input className="h-11 rounded-xl" value={editIp} onChange={(e) => setEditIp(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Network Port Matrix</label>
              <Input className="h-11 rounded-xl" value={editPort} onChange={(e) => setEditPort(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2.5 pt-2 border-t border-slate-100 mt-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold border-slate-200 text-slate-500" onClick={() => setEditingDevice(null)}>Cancel</Button>
            <Button className="flex-1 h-11 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSaveChanges}>Commit Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}