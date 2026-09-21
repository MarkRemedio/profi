import {
  ArrowRightLeft,
  BookOpen,
  CircleHelp,
  MessageSquare,
  PlayCircle,
  UserCog,
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Globe,
  HardHat,
  Heart,
  LayoutDashboard,
  LineChart,
  Package,
  Quote,
  Receipt,
  ReceiptText,
  RotateCcw,
  RotateCw,
  Scale,
  ScanBarcode,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Truck,
  TrendingUp,
  UserCircle,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

/**
 * Every destination in the product, once.
 *
 * These lists used to live inside seven near-identical sidebar components, as
 * hardcoded JSX. That was tolerable while the sidebar was the only menu. It
 * stopped being tolerable the moment a second menu had to offer the same
 * destinations: two hand-maintained copies of thirty-odd links drift the first
 * time somebody adds a page, and the drift is invisible until a customer who
 * happens to use the other menu cannot find something.
 *
 * Data rather than markup, because the two menus draw the same destinations
 * very differently — a nested tree down the side, a sheet up from the bottom —
 * and sharing a component would mean one that is bad at both.
 *
 * `key` matches the workspace feature flags read by canSeeMenu, so a module a
 * plan does not include disappears from both menus at once.
 */

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Active only on an exact path match — for a landing page whose href is a
   *  prefix of all its siblings, which would otherwise always look active. */
  exact?: boolean;
};

export type NavSection = {
  /** Shown above the group. Omitted for the first, unlabelled run of links. */
  heading?: string;
  links: NavLink[];
};

export type NavModule = {
  /** Feature flag key, as read by canSeeMenu. */
  key: string;
  label: string;
  /** Where the module's own label navigates to. */
  href: string;
  icon: LucideIcon;
  /** Which sidebar heading it falls under. */
  group: "main" | "finance";
  /** Empty for a module that is a single page rather than a section. */
  sections: NavSection[];
};

export const NAV_MODULES: NavModule[] = [
  {
    key: "dashboard",
    label: "Overall Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    group: "main",
    sections: [],
  },
  {
    key: "sales",
    label: "Sales",
    href: "/sales",
    icon: ReceiptText,
    group: "main",
    sections: [
      {
        links: [
          { href: "/sales", label: "Dashboard", icon: LineChart, exact: true },
          { href: "/sales/invoices", label: "Invoices", icon: FileText },
          { href: "/sales/receipts", label: "Sales Receipts", icon: Receipt },
          { href: "/sales/quotes", label: "Quotes", icon: Quote },
          { href: "/sales/customers", label: "Customers", icon: Users },
          { href: "/sales/adjustments", label: "Credit Notes", icon: Scale },
          { href: "/sales/refund-receipts", label: "Refund Receipts", icon: RotateCcw },
          { href: "/sales/statements", label: "Customer Statements", icon: FileText },
        ],
      },
      {
        heading: "Settings",
        links: [{ href: "/sales/settings", label: "Sales Settings", icon: Settings }],
      },
    ],
  },
  {
    key: "purchases",
    label: "Purchases",
    href: "/purchases",
    icon: ShoppingCart,
    group: "main",
    sections: [
      {
        links: [
          { href: "/purchases", label: "Dashboard", icon: LineChart, exact: true },
          { href: "/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
          { href: "/purchases/bills", label: "Bills", icon: Receipt },
          { href: "/purchases/expense-claims", label: "Expense Claims", icon: CreditCard },
          { href: "/purchases/suppliers", label: "Suppliers", icon: Truck },
        ],
      },
      {
        heading: "Settings",
        links: [{ href: "/purchases/settings", label: "Purchase Settings", icon: Settings }],
      },
    ],
  },
  {
    key: "banking",
    label: "Banking",
    href: "/banking",
    icon: Building2,
    group: "main",
    sections: [
      {
        links: [
          { href: "/banking", label: "Dashboard", icon: Building2, exact: true },
          { href: "/banking/transactions", label: "Transactions", icon: Receipt },
          { href: "/banking/statements", label: "Bank Statements", icon: FileText },
        ],
      },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll",
    icon: Users,
    group: "finance",
    sections: [
      {
        links: [
          { href: "/payroll", label: "Dashboard", icon: LineChart, exact: true },
          { href: "/payroll/run-payroll", label: "Run Payroll", icon: RotateCw },
          { href: "/payroll/employees", label: "Employees", icon: Users },
          { href: "/payroll/benefits", label: "Benefits", icon: Heart },
          { href: "/payroll/reports", label: "Reports", icon: FileText },
        ],
      },
      {
        heading: "Employee Portal",
        links: [
          { href: "/payroll/timeclock", label: "Time Clock", icon: CreditCard },
          { href: "/payroll/payslips", label: "Payslips", icon: FileText },
          { href: "/payroll/timeoff", label: "Time Off", icon: Calendar },
          { href: "/payroll/myprofile", label: "My Profile", icon: UserCircle },
        ],
      },
      {
        heading: "Settings",
        links: [
          { href: "/payroll/timesheets", label: "Timesheets & Reports", icon: TrendingUp },
          { href: "/payroll/settings", label: "Payroll Settings", icon: Settings },
        ],
      },
    ],
  },
  {
    key: "pos",
    label: "POS",
    href: "/pos/terminal",
    icon: ShoppingBag,
    group: "finance",
    sections: [
      {
        heading: "Operations",
        links: [
          { href: "/pos/terminal", label: "Terminal", icon: ScanBarcode, exact: true },
          { href: "/pos/transactions", label: "Transactions", icon: CreditCard },
          { href: "/pos/refunds", label: "Returns & Refunds", icon: RotateCcw },
        ],
      },
      {
        heading: "Inventory",
        links: [
          { href: "/pos/inventory", label: "Products", icon: Package },
          { href: "/pos/stock", label: "Stock Levels", icon: Tag },
        ],
      },
      {
        heading: "Analytics",
        links: [
          { href: "/pos/reports", label: "Sales Reports", icon: TrendingUp },
          { href: "/pos/reconciliation", label: "End of Day", icon: Wallet },
        ],
      },
      {
        // Hardware Hub (/pos/hardware) and App Integrations (/pos/integrations)
        // are deliberately absent. They are hidden pages; listing them here
        // would put them back in front of customers through the new menu even
        // though the sidebar stopped showing them.
        heading: "POS Settings",
        links: [{ href: "/pos/customers", label: "Customers CRM", icon: Users }],
      },
    ],
  },
  {
    key: "taxes",
    label: "Taxes",
    href: "/taxes",
    icon: WalletCards,
    group: "finance",
    sections: [
      {
        links: [
          { href: "/taxes", label: "Dashboard", icon: Building2, exact: true },
          { href: "/taxes/ec-sales", label: "EC Sales Tax", icon: Globe },
          { href: "/taxes/forex", label: "Forex Gains/Losses", icon: ArrowRightLeft },
          { href: "/taxes/corporation", label: "Corporation Tax", icon: Building2 },
          { href: "/taxes/vat", label: "VAT Details", icon: Receipt },
          { href: "/taxes/self-employed", label: "Self-Employed (MTD)", icon: UserCircle },
          { href: "/taxes/cis", label: "CIS (Construction)", icon: HardHat },
          { href: "/taxes/capital-gains", label: "Capital Gains", icon: TrendingUp },
        ],
      },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    href: "/accounting/chart-of-accounts",
    icon: BarChart3,
    group: "finance",
    sections: [
      {
        links: [
          {
            href: "/accounting/chart-of-accounts",
            label: "Chart of Accounts",
            icon: FileText,
          },
          { href: "/accounting/journals", label: "Manual Journals", icon: Receipt },
        ],
      },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    icon: Download,
    group: "finance",
    sections: [],
  },
];

/**
 * The settings group, which sits apart from the modules above.
 *
 * Not in NAV_MODULES because it is not a licensed feature and never appears in
 * a plan's feature list — running it through the same gate would mean another
 * special case beside the dashboard's. It is also the only group whose first
 * label changes with the reader's role.
 */
export function settingsSection(userRole?: string | null): NavSection {
  return {
    heading: "Settings",
    links: [
      {
        href: "/settings/profile-access",
        label:
          String(userRole ?? "").toUpperCase() === "OWNER"
            ? "Profile & Access"
            : "My Profile Settings",
        icon: UserCog,
      },
      { href: "/settings/workspace", label: "Workspace Settings", icon: Settings },
      { href: "/help/knowledge-base", label: "Knowledge Base", icon: BookOpen },
      // Anchors onto the marketing page's tour section, as the sidebar does.
      { href: "/#feature-experience", label: "Video Tutorials", icon: PlayCircle },
      { href: "/help/contact", label: "Contact Support", icon: MessageSquare },
    ],
  };
}

/** The icon the settings group is drawn with in a menu bar. */
export const SETTINGS_ICON = CircleHelp;

/** Flattened, for a sheet or for search. */
export function moduleLinks(module: NavModule): NavLink[] {
  return module.sections.flatMap((section) => section.links);
}

/** Whether a module owns the current path. */
export function isModuleActive(module: NavModule, pathname: string): boolean {
  if (module.href === "/dashboard") return pathname === "/dashboard";
  // The module's own prefix, not its href: POS lands on /pos/terminal but owns
  // everything under /pos.
  const prefix = `/${module.key}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether a single link is the current page. */
export function isLinkActive(link: NavLink, pathname: string): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
