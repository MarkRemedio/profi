"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useNavCompact } from "./use-nav-position";
import { useOrgLogo } from "./use-org-logo";
import {
  NAV_MODULES,
  SETTINGS_ICON,
  isLinkActive,
  isModuleActive,
  settingsSection,
  type NavModule,
  type NavSection,
} from "./nav-tree";

/**
 * The menu as a floating bar along the bottom.
 *
 * Every section the reader can open is in the bar — the same set the sidebar
 * shows, from the same gate, so a plan or a role that hides a module hides it
 * here too. There is no overflow button: an accounting product is used by
 * people who go to the same three places all day and then need Taxes once a
 * quarter, and burying the quarterly one behind "More" is how it stops being
 * found at all.
 *
 * Wide workspaces overflow, and the bar scrolls sideways rather than shrinking
 * its targets below the size of a fingertip. The current section is scrolled
 * into view on navigation, so you can always see where you are.
 *
 * Minimising drops the labels, not the destinations. Collapsing to a single
 * button would trade one row of screen for two taps on every navigation, which
 * is the wrong way round.
 */

export function BottomNav({
  canSeeMenu,
  userRole,
  organization,
  onSwitchToSidebar,
}: {
  /** The same gate the sidebar uses, passed in rather than recomputed. */
  canSeeMenu: (moduleKey: string) => boolean;
  userRole?: string | null;
  /** Name and logo for the brand block. Absent while impersonating, which
   *  passes only the feature list. */
  organization?: { name?: string; logoUrl?: string | null } | null;
  /** Offered inside the sheet, so somebody who dislikes this can get back. */
  onSwitchToSidebar: () => void;
}) {
  const pathname = usePathname();
  const [compact, setCompact] = useNavCompact();
  /* Same store the sidebar reads. Without it this mark kept the logo the
     page was loaded with, so a change made in Settings showed in the card
     and nowhere else until a reload. */
  const orgLogo = useOrgLogo(organization?.logoUrl);

  /* Which sheet is open, and the path it was opened on. Storing the path is
     what closes the sheet on navigation: it is open only while you are still on
     the page you opened it from, so following a link inside it closes it
     without an effect that resets state afterwards. Left open, it would sit
     over the page it just sent you to and read as a tap that did nothing. */
  const [opened, setOpened] = useState<{ key: string; path: string } | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  /* Whether there is anything left to scroll to, each way. Drives the arrows:
     a scroller with no visible bar and no arrows gives a phone user no reason
     to think anything is off screen, and Taxes might as well not exist. */
  const [edges, setEdges] = useState({ left: false, right: false });

  const openKey = opened && opened.path === pathname ? opened.key : null;
  const setOpenKey = (key: string | null) =>
    setOpened(key ? { key, path: pathname } : null);

  const visible = NAV_MODULES.filter((module) => canSeeMenu(module.key));
  const settings = settingsSection(userRole);

  /* Where the customer's own mark points. Taken from the settings group rather
     than written out here, so the brand block and the settings sheet always
     agree — including the label, which reads "Profile & Access" for an owner
     and "My Profile Settings" for everybody else. Found by href rather than by
     position, so reordering that list cannot quietly point this elsewhere. */
  const profileLink =
    settings.links.find((link) => link.href === "/settings/profile-access") ?? settings.links[0];

  /* Escape closes, as it does for every other overlay in the app. */
  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      // setOpened rather than setOpenKey: the latter closes over `pathname`,
      // which would put it in this effect's dependencies and re-bind the
      // listener on every navigation for no benefit.
      if (event.key === "Escape") setOpened(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  /* Track the scroll edges. The initial measurement comes from ResizeObserver
     rather than from this effect's body: it fires once as soon as it observes,
     which keeps the first reading out of the render pass. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const update = () => {
      // A few pixels of slack, because scrollLeft is fractional on zoomed or
      // high-DPI displays and an exact comparison leaves an arrow that never
      // quite goes away.
      const slack = 4;
      setEdges({
        left: scroller.scrollLeft > slack,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - slack,
      });
    };

    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [compact, visible.length]);

  /* Publish the bar's real height so anything else pinned to the bottom of the
     screen can sit above it. The Aurelius bubble was landing underneath it,
     which is not something a fixed offset would have survived — the bar is a
     different height with labels than without, and taller again on a phone with
     a home indicator. Measured rather than guessed. */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        "--wawprofi-nav-inset",
        `${Math.round(nav.getBoundingClientRect().height)}px`
      );
    };

    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      // Cleared on unmount, so switching back to the sidebar does not leave
      // every floating element pushed up by a bar that is no longer there.
      document.documentElement.style.removeProperty("--wawprofi-nav-inset");
    };
  }, []);

  const scrollBy = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // Not a full width: leaving a couple of items visible keeps the reader
    // oriented rather than replacing the whole strip each press.
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.7, behavior: "smooth" });
  };

  /* Bring the current section into view when the bar is wider than the screen.
     block: "nearest" is load-bearing — the default would also scroll the page
     vertically to reach a bar that is already fixed to the bottom of it. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname, compact]);

  const openModule =
    openKey && openKey !== "settings"
      ? visible.find((module) => module.key === openKey) ?? null
      : null;
  const openSettings = openKey === "settings";

  return (
    <>
      <AnimatePresence>
        {openKey && (
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpenKey(null)}
            /* z-[45], not z-40. The top bar is also z-40, so which of the two
               painted on top came down to DOM order — and it came out the wrong
               way: the search field and the account controls stayed sharp and
               fully lit while the rest of the page dimmed behind the sheet,
               which reads as those controls still being usable.

               Sits between the top bar and the sheet itself, which is z-50
               along with the bar it opens from. */
            className="fixed inset-0 z-[45] cursor-default bg-slate-900/25 backdrop-blur-[3px]"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openKey && (
          <motion.div
            key={openKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            /* Sits above the bar, at whichever height the bar currently is.
               max-h keeps a long section — Payroll has eleven links — scrolling
               inside the sheet rather than growing past the top of the screen. */
            className={cn(
              "fixed inset-x-2 z-50 mx-auto flex max-h-[min(60vh,32rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.28)]",
              compact
                ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
                : "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]"
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {openModule ? openModule.label : "Settings"}
              </span>
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              <SectionList
                sections={openModule ? openModule.sections : [{ links: settings.links }]}
                pathname={pathname}
              />

              {openSettings && (
                /* The way back. Somebody who tries the bottom menu and dislikes
                   it must not have to hunt through Workspace Settings to undo
                   it, so the escape hatch lives in the menu itself. */
                <button
                  type="button"
                  onClick={onSwitchToSidebar}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  Move the menu back to the side
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed and floating, inset from the edges so the page behind it reads
          as a page rather than as something the bar is sitting on. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-3">
        <motion.nav
          ref={navRef}
          layout
          /* Slides up on arrival rather than appearing whole. Switching layout
             swaps one menu for another, and a bar that simply exists in the
             frame after a click reads as a redraw; one that comes in from
             where it lives reads as a menu moving. Same easing and duration as
             the Aurelius bubble it displaces, so they travel together. */
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto flex max-w-full items-stretch rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.3)] backdrop-blur"
        >
          {/* Whose product this is, and whose workspace. In side mode this
              lives at the top of the sidebar; with the sidebar gone there is
              nowhere else for it, and a customer who uploaded a logo would
              never see it again.

              Outside the scroller so it stays put while the destinations move
              under it, and hidden on a phone — the bar is already scrolling
              there, and eighty pixels of branding makes navigating worse for
              something the top bar can carry instead. */}
          {/* Two marks, two destinations. They used to share one link to the
              marketing site, which meant a customer clicking their own company
              name — the most personal thing in the bar — was sent out of the
              product. Ours goes home; theirs goes to their own profile. */}
          <div className="mr-1 hidden shrink-0 items-center gap-2 border-r border-slate-100 pl-1 pr-2.5 sm:flex">
            <Link
              href="/"
              title="WAWPROFI"
              className="shrink-0 transition-opacity hover:opacity-80"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-extrabold text-white shadow-sm">
                W
              </span>
            </Link>

            {organization?.name && (
              <Link
                href={profileLink.href}
                title={profileLink.label}
                className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
              >
                {/* Their mark, drawn exactly as the sidebar draws it:
                    transparent where there is a logo, a chip around the initial
                    where there is not. */}
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg text-xs font-bold",
                    orgLogo
                      ? "bg-transparent"
                      : "border border-slate-200 bg-slate-100 text-slate-700"
                  )}
                >
                  {orgLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={orgLogo}
                      alt=""
                      className="size-full object-contain"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    organization.name.charAt(0).toUpperCase()
                  )}
                </span>

                {/* The name only where there is genuinely room. Below lg it
                    would push the first destination off screen on every
                    workspace with a long trading name. Dropped in compact mode
                    too, which exists to buy back exactly this kind of width. */}
                {!compact && (
                  <span className="hidden max-w-[9rem] truncate text-xs font-bold text-slate-700 lg:block">
                    {organization.name}
                  </span>
                )}
              </Link>
            )}
          </div>

          <div className="relative flex min-w-0 items-stretch">
          <div
            ref={scrollerRef}
            className="no-scrollbar flex min-w-0 items-stretch gap-1 overflow-x-auto scroll-smooth"
          >
            {visible.map((module) => (
              <BarItem
                key={module.key}
                module={module}
                pathname={pathname}
                compact={compact}
                isSheetOpen={openKey === module.key}
                onOpen={() => setOpenKey(openKey === module.key ? null : module.key)}
                activeRef={activeRef}
              />
            ))}

            {/* Settings sits with the destinations rather than behind an
                overflow button, mirroring the sidebar's own footer group. It is
                not a licensed feature, so it is rendered outside the map and
                past the gate. */}
            <BarButton
              icon={SETTINGS_ICON}
              label="Settings"
              compact={compact}
              active={
                openKey === "settings" ||
                pathname.startsWith("/settings") ||
                pathname.startsWith("/help")
              }
              expanded={openKey === "settings"}
              onClick={() => setOpenKey(openKey === "settings" ? null : "settings")}
            />
          </div>

          {/* Overlaid on the ends rather than placed beside them: on a phone
              the bar is already tight, and two permanent arrow columns would
              cost a whole destination. Each appears only when there is
              something that way, so they double as the signal that the strip
              scrolls at all — the scrollbar is hidden, and without them a
              phone user has no reason to think Taxes exists. */}
          <AnimatePresence>
            {edges.left && (
              <ScrollArrow key="left" side="left" onClick={() => scrollBy(-1)} />
            )}
            {edges.right && (
              <ScrollArrow key="right" side="right" onClick={() => scrollBy(1)} />
            )}
          </AnimatePresence>
          </div>

          {/* Outside the scroller, so it stays reachable however far the
              destinations have scrolled. It does not go anywhere — it changes
              the shape of the thing you are pressing. */}
          <button
            type="button"
            onClick={() => {
              setOpenKey(null);
              setCompact(!compact);
            }}
            aria-label={compact ? "Show menu labels" : "Hide menu labels"}
            title={compact ? "Show labels" : "Hide labels"}
            className="ml-1 flex shrink-0 items-center justify-center rounded-xl border-l border-slate-100 px-2.5 text-slate-400 transition hover:text-slate-700"
          >
            <ChevronUp className={cn("size-4 transition-transform", compact ? "" : "rotate-180")} />
          </button>
        </motion.nav>
      </div>
    </>
  );
}

/**
 * An affordance for a strip that scrolls sideways.
 *
 * The gradient is the important half: the arrow says you can move, the fade
 * says there is something under it to move to. A hard-edged button over a
 * hard-edged item just looks like the item is broken.
 */
function ScrollArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      aria-label={side === "left" ? "Scroll menu left" : "Scroll menu right"}
      className={cn(
        "absolute inset-y-0 z-10 flex w-9 items-center text-slate-500 transition-colors hover:text-orange-500",
        side === "left"
          ? "left-0 justify-start bg-gradient-to-r from-white via-white/95 to-transparent pl-0.5"
          : "right-0 justify-end bg-gradient-to-l from-white via-white/95 to-transparent pr-0.5"
      )}
    >
      <span className="grid size-7 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <Icon className="size-4" />
      </span>
    </motion.button>
  );
}

/** One section in the bar. */
function BarItem({
  module,
  pathname,
  compact,
  isSheetOpen,
  onOpen,
  activeRef,
}: {
  module: NavModule;
  pathname: string;
  compact: boolean;
  isSheetOpen: boolean;
  onOpen: () => void;
  activeRef: React.MutableRefObject<HTMLAnchorElement | HTMLButtonElement | null>;
}) {
  const active = isModuleActive(module, pathname);

  // A section with no children is a page, so it navigates. One with children
  // opens its sheet — a bar that sometimes navigates and sometimes expands,
  // with no way to tell which, is worse than one that always does the same.
  if (module.sections.length === 0) {
    return (
      <Link
        href={module.href}
        ref={active ? (activeRef as React.Ref<HTMLAnchorElement>) : undefined}
        title={compact ? module.label : undefined}
        className={barItemClass(active || isSheetOpen, compact)}
      >
        <module.icon className="size-5 shrink-0" />
        {!compact && <span className="whitespace-nowrap">{module.label}</span>}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      ref={active ? (activeRef as React.Ref<HTMLButtonElement>) : undefined}
      aria-expanded={isSheetOpen}
      title={compact ? module.label : undefined}
      className={barItemClass(active || isSheetOpen, compact)}
    >
      <module.icon className="size-5 shrink-0" />
      {!compact && <span className="whitespace-nowrap">{module.label}</span>}
    </button>
  );
}

/** A bar entry that is not a feature module. */
function BarButton({
  icon: Icon,
  label,
  compact,
  active,
  expanded,
  onClick,
}: {
  icon: typeof SETTINGS_ICON;
  label: string;
  compact: boolean;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      title={compact ? label : undefined}
      className={barItemClass(active, compact)}
    >
      <Icon className="size-5 shrink-0" />
      {!compact && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

/**
 * Sizing for one bar entry.
 *
 * Expanded entries have a fixed minimum width but can grow for longer labels.
 * The bar already scrolls, so preserving the complete destination name is more
 * useful than clipping it to make every entry identical. The compact size is
 * 44px, which is the minimum target both Apple and Android publish — the point
 * of hiding labels is to fit more sections on screen, not to make them harder
 * to hit.
 */
function barItemClass(active: boolean, compact: boolean) {
  return cn(
    "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition",
    compact ? "size-11" : "min-w-[4.5rem] px-2 py-2",
    active
      ? "bg-orange-50 text-orange-500"
      : "text-slate-500 hover:bg-slate-100 hover:text-orange-500"
  );
}

/** A section's own links, headings and all. */
function SectionList({ sections, pathname }: { sections: NavSection[]; pathname: string }) {
  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div key={section.heading ?? index}>
          {section.heading && (
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {section.heading}
            </p>
          )}
          {/* Two columns where there is room. A phone gets one, because a
              two-column list at phone width truncates every label. */}
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {section.links.map((link) => {
              const active = isLinkActive(link, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-semibold transition",
                    active
                      ? "bg-orange-50 text-orange-500"
                      : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
                  )}
                >
                  <link.icon className="size-4 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
