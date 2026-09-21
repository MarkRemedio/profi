"use client";

import { useState } from "react";
import { PanelLeft } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavLayoutChooser } from "@/components/accounting/nav-layout-preview";
import { useNavPosition, type NavPosition } from "@/components/accounting/use-nav-position";

/**
 * Where the menu lives — down the side, or floating along the bottom.
 *
 * Personal rather than workspace-wide, like the notification settings beside it
 * and the sidebar's own collapsed state: two people sharing a workspace should
 * not be able to move each other's menu. That is also why it saves on click
 * with no Save button — it is stored in this browser, there is nothing to
 * submit, and the result is visible behind the card the instant it changes.
 *
 * In its own file because it is shown to everybody, including the members who
 * get the locked version of Workspace Settings. Moving your own menu is not an
 * administrative act, and an employee who cannot reach this setting is being
 * denied a preference rather than a permission — the same reasoning that keeps
 * the notification settings out of the permission gate.
 */
export function MenuLayoutCard() {
  const [position, setPosition] = useNavPosition();
  const [expanded, setExpanded] = useState<NavPosition | null>(null);

  return (
    <Card id="menu-layout">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PanelLeft className="size-5 text-blue-600" />
          <CardTitle className="text-base">Menu layout</CardTitle>
        </div>
        <CardDescription>
          Where the menu sits. This is your own setting — colleagues on this workspace keep theirs
        </CardDescription>
      </CardHeader>

      <CardContent>
        <NavLayoutChooser
          value={position}
          onChange={setPosition}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />

        <p className="m-0 mt-4 text-xs leading-relaxed text-slate-500">
          Saved to your account, so it follows you to any device you sign in on. The bottom menu
          carries the same sections as the sidebar, and shows only the ones your role and plan
          allow. Minimising hides the labels rather than the sections, and you can move the menu
          back to the side from inside it.
        </p>
      </CardContent>
    </Card>
  );
}
