import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Catalog from "./pages/Catalog";
import Inquiries from "./pages/Inquiries";
import Appointments from "./pages/Appointments";
import Customers from "./pages/Customers";
import Quotes from "./pages/Quotes";
import Invoices from "./pages/Invoices";
import Suppliers from "./pages/Suppliers";
import Offers from "./pages/Offers";
import GoldRate from "./pages/GoldRate";
import Branches from "./pages/Branches";
import Team from "./pages/Team";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
      <Route path="/inquiries" element={<Protected><Inquiries /></Protected>} />
      <Route path="/appointments" element={<Protected><Appointments /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/quotes" element={<Protected><Quotes /></Protected>} />
      <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
      <Route path="/suppliers" element={<Protected><Suppliers /></Protected>} />
      <Route path="/offers" element={<Protected><Offers /></Protected>} />
      <Route path="/gold" element={<Protected><GoldRate /></Protected>} />
      <Route path="/branches" element={<Protected><Branches /></Protected>} />
      <Route path="/team" element={<Protected><Team /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
