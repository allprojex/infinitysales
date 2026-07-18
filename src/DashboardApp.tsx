import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PermissionsProvider, usePermissions } from "@/lib/permissions-context";
import { protectedRouteRedirect } from "@/lib/auth-routing";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const Setup2FA = lazy(() => import("@/pages/2fa-setup"));
const Verify2FA = lazy(() => import("@/pages/2fa-verify"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Sales = lazy(() => import("@/pages/sales"));
const Customers = lazy(() => import("@/pages/customers"));
const Products = lazy(() => import("@/pages/products"));
const Reports = lazy(() => import("@/pages/reports"));
const AuditLogs = lazy(() => import("@/pages/audit-logs"));
const Backup = lazy(() => import("@/pages/backup"));
const Settings = lazy(() => import("@/pages/settings"));
const Adjustments = lazy(() => import("@/pages/adjustments"));
const Quotations = lazy(() => import("@/pages/quotations"));
const Purchases = lazy(() => import("@/pages/purchases"));
const SalesReturns = lazy(() => import("@/pages/sales-returns"));
const PurchaseReturns = lazy(() => import("@/pages/purchase-returns"));
const HRMHub = lazy(() => import("@/pages/hrm"));
const ProductTransfer = lazy(() => import("@/pages/product-transfer"));
const Accounting = lazy(() => import("@/pages/accounting"));
const People = lazy(() => import("@/pages/people"));
const Projects = lazy(() => import("@/pages/projects"));
const Tasks = lazy(() => import("@/pages/tasks"));
const AdminSettings = lazy(() => import("@/pages/admin-settings"));
const POS = lazy(() => import("@/pages/pos"));
const Warehouses = lazy(() => import("@/pages/warehouses"));
const Suppliers = lazy(() => import("@/pages/suppliers"));
const SerialNumbers = lazy(() => import("@/pages/serial-numbers"));
const Analytics = lazy(() => import("@/pages/analytics"));
const RecycleBin = lazy(() => import("@/pages/recycle-bin"));
const DutyRoster = lazy(() => import("@/pages/duty-roster"));
const AIInsights = lazy(() => import("@/pages/ai-insights"));
const GeneratedReports = lazy(() => import("@/pages/generated-reports"));
const Loyalty = lazy(() => import("@/pages/loyalty"));
const Expenses = lazy(() => import("@/pages/expenses"));
const Promotions = lazy(() => import("@/pages/promotions"));
const StockTake = lazy(() => import("@/pages/stock-take"));
const Notifications = lazy(() => import("@/pages/notifications"));
const PriceLists = lazy(() => import("@/pages/price-lists"));
const CashManagement = lazy(() => import("@/pages/cash-management"));
const CustomerCredits = lazy(() => import("@/pages/customer-credits"));
const Branches = lazy(() => import("@/pages/branches"));
const BankReconciliation = lazy(() => import("@/pages/bank-reconciliation"));
const SupplierInvoices = lazy(() => import("@/pages/supplier-invoices"));
const ReorderRules = lazy(() => import("@/pages/reorder-rules"));
const VATReport = lazy(() => import("@/pages/vat-report"));
const Payroll = lazy(() => import("@/pages/payroll"));
const Leave = lazy(() => import("@/pages/leave"));
const Attendance = lazy(() => import("@/pages/attendance"));
const Departments = lazy(() => import("@/pages/departments"));
const ESLDashboard = lazy(() => import("@/pages/esl"));
const LabelPrinter = lazy(() => import("@/pages/label-printer"));
const SecurityCentre = lazy(() => import("@/pages/security-centre"));
const ImportPortal = lazy(() => import("@/pages/import-portal"));
const ProductCategories = lazy(() => import("@/pages/product-categories"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">Loading...</div>
  );
}

function PrivateRoute({
  component: Component,
  adminOnly = false,
  adminOrManager = false,
  permKey,
  defaultAllow = true,
}: {
  component: React.ComponentType;
  adminOnly?: boolean;
  adminOrManager?: boolean;
  permKey?: string;
  defaultAllow?: boolean;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const [_, setLocation] = useLocation();

  const permissionsLoading = Boolean(permKey && permsLoading);
  const permissionDenied = Boolean(
    permKey && !permissionsLoading && !canAccess(permKey, defaultAllow),
  );
  const redirectTo = protectedRouteRedirect({
    isLoading,
    permissionsLoading,
    isAuthenticated,
    role: user?.role,
    adminOnly,
    adminOrManager,
    permissionDenied,
  });

  useEffect(() => {
    if (redirectTo) setLocation(redirectTo);
  }, [redirectTo, setLocation]);

  if (isLoading || permissionsLoading) return <PageLoader />;
  if (redirectTo) return null;

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/login" component={() => <Login initialMode="user" />} />
          <Route path="/admin/login" component={() => <Login initialMode="admin" />} />
          <Route path="/register" component={Register} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/2fa-setup" component={Setup2FA} />
          <Route path="/2fa-verify" component={Verify2FA} />

          {/* Protected Routes */}
          <Route path="/" component={() => <PrivateRoute component={Dashboard} />} />
          <Route path="/dashboard" component={() => <PrivateRoute component={Dashboard} />} />
          <Route
            path="/sales"
            component={() => <PrivateRoute component={Sales} permKey="perm_user_sales" />}
          />
          <Route
            path="/customers"
            component={() => <PrivateRoute component={Customers} permKey="perm_user_customers" />}
          />
          <Route
            path="/products"
            component={() => <PrivateRoute component={Products} permKey="perm_user_inventory" />}
          />
          <Route
            path="/reports"
            component={() => <PrivateRoute component={Reports} permKey="perm_user_reports" />}
          />
          <Route
            path="/settings"
            component={() => <PrivateRoute component={Settings} permKey="perm_user_settings" />}
          />
          <Route
            path="/adjustments"
            component={() => <PrivateRoute component={Adjustments} permKey="perm_user_inventory" />}
          />
          <Route
            path="/quotations"
            component={() => <PrivateRoute component={Quotations} permKey="perm_user_sales" />}
          />
          <Route
            path="/purchases"
            component={() => <PrivateRoute component={Purchases} permKey="perm_user_purchases" />}
          />
          <Route
            path="/sales-returns"
            component={() => <PrivateRoute component={SalesReturns} permKey="perm_user_sales" />}
          />
          <Route
            path="/purchase-returns"
            component={() => (
              <PrivateRoute component={PurchaseReturns} permKey="perm_user_purchases" />
            )}
          />
          <Route
            path="/hrm"
            component={() => (
              <PrivateRoute component={HRMHub} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />
          <Route
            path="/product-transfer"
            component={() => (
              <PrivateRoute
                component={ProductTransfer}
                permKey="perm_user_product_transfers"
                defaultAllow={false}
              />
            )}
          />
          <Route
            path="/accounting"
            component={() => <PrivateRoute component={Accounting} permKey="perm_user_accounting" />}
          />
          <Route
            path="/people"
            component={() => <PrivateRoute component={People} permKey="perm_user_customers" />}
          />
          <Route
            path="/projects"
            component={() => <PrivateRoute component={Projects} permKey="module_projects" />}
          />
          <Route
            path="/tasks"
            component={() => <PrivateRoute component={Tasks} permKey="module_tasks" />}
          />
          <Route
            path="/pos"
            component={() => <PrivateRoute component={POS} permKey="perm_user_pos" />}
          />
          <Route
            path="/warehouses"
            component={() => <PrivateRoute component={Warehouses} permKey="perm_user_inventory" />}
          />
          <Route
            path="/suppliers"
            component={() => <PrivateRoute component={Suppliers} permKey="perm_user_purchases" />}
          />
          <Route
            path="/serial-numbers"
            component={() => (
              <PrivateRoute component={SerialNumbers} permKey="perm_user_inventory" />
            )}
          />
          <Route
            path="/analytics"
            component={() => <PrivateRoute component={Analytics} permKey="perm_user_reports" />}
          />
          <Route
            path="/duty-roster"
            component={() => (
              <PrivateRoute component={DutyRoster} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />
          <Route
            path="/ai-insights"
            component={() => <PrivateRoute component={AIInsights} permKey="perm_user_reports" />}
          />

          <Route
            path="/generated-reports"
            component={() => <PrivateRoute component={GeneratedReports} adminOnly={true} />}
          />
          <Route path="/loyalty" component={() => <PrivateRoute component={Loyalty} />} />
          <Route
            path="/expenses"
            component={() => <PrivateRoute component={Expenses} permKey="perm_user_accounting" />}
          />
          <Route
            path="/promotions"
            component={() => <PrivateRoute component={Promotions} permKey="perm_user_sales" />}
          />
          <Route
            path="/stock-take"
            component={() => <PrivateRoute component={StockTake} permKey="perm_user_inventory" />}
          />
          <Route
            path="/notifications"
            component={() => <PrivateRoute component={Notifications} />}
          />
          <Route
            path="/price-lists"
            component={() => <PrivateRoute component={PriceLists} permKey="perm_user_sales" />}
          />
          <Route
            path="/cash-management"
            component={() => (
              <PrivateRoute component={CashManagement} permKey="perm_user_accounting" />
            )}
          />
          <Route
            path="/customer-credits"
            component={() => (
              <PrivateRoute component={CustomerCredits} permKey="perm_user_accounting" />
            )}
          />
          <Route
            path="/branches"
            component={() => <PrivateRoute component={Branches} permKey="perm_user_inventory" />}
          />
          <Route
            path="/bank-reconciliation"
            component={() => (
              <PrivateRoute component={BankReconciliation} permKey="perm_user_accounting" />
            )}
          />
          <Route
            path="/supplier-invoices"
            component={() => (
              <PrivateRoute component={SupplierInvoices} permKey="perm_user_purchases" />
            )}
          />
          <Route
            path="/reorder-rules"
            component={() => (
              <PrivateRoute component={ReorderRules} permKey="perm_user_purchases" />
            )}
          />
          <Route
            path="/vat-report"
            component={() => <PrivateRoute component={VATReport} permKey="perm_user_reports" />}
          />
          <Route
            path="/payroll"
            component={() => (
              <PrivateRoute component={Payroll} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />
          <Route
            path="/leave"
            component={() => (
              <PrivateRoute component={Leave} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />
          <Route
            path="/attendance"
            component={() => (
              <PrivateRoute component={Attendance} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />
          <Route
            path="/departments"
            component={() => (
              <PrivateRoute component={Departments} permKey="perm_user_hrm" defaultAllow={false} />
            )}
          />

          <Route
            path="/import-portal"
            component={() => <PrivateRoute component={ImportPortal} adminOrManager={true} />}
          />
          <Route
            path="/hardware/esl"
            component={() => (
              <PrivateRoute component={ESLDashboard} permKey="perm_user_inventory" />
            )}
          />
          <Route
            path="/hardware/label-printer"
            component={() => (
              <PrivateRoute component={LabelPrinter} permKey="perm_user_inventory" />
            )}
          />

          {/* Admin Routes */}
          <Route
            path="/admin/security"
            component={() => <PrivateRoute component={SecurityCentre} adminOnly={true} />}
          />
          <Route
            path="/admin/product-categories"
            component={() => <PrivateRoute component={ProductCategories} adminOnly={true} />}
          />
          <Route
            path="/admin/settings"
            component={() => <PrivateRoute component={AdminSettings} adminOnly={true} />}
          />
          <Route
            path="/admin/audit-logs"
            component={() => <PrivateRoute component={AuditLogs} adminOnly={true} />}
          />
          <Route
            path="/admin/backup"
            component={() => <PrivateRoute component={Backup} adminOnly={true} />}
          />
          <Route
            path="/admin/recycle-bin"
            component={() => <PrivateRoute component={RecycleBin} adminOnly={true} />}
          />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <PermissionsProvider>
                <Router />
              </PermissionsProvider>
            </AuthProvider>
          </WouterRouter>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
