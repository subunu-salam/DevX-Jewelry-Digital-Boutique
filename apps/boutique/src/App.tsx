import { Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import ProductDetail from "./pages/ProductDetail";
import GoldRate from "./pages/GoldRate";
import Cart from "./pages/Cart";
import Appointments from "./pages/Appointments";
import Offers from "./pages/Offers";
import Account from "./pages/Account";
import AIStudio from "./pages/AIStudio";
import VisualSearch from "./pages/VisualSearch";
import CatalogStudio from "./pages/CatalogStudio";
import Intelligence from "./pages/Intelligence";
import TryOn from "./pages/TryOn";

/** Pages not yet redesigned keep a comfortable reading width on desktop. */
const Narrow = ({ children }: { children: React.ReactNode }) => <div className="mx-auto w-full max-w-3xl md:px-8">{children}</div>;

export default function App() {
  const location = useLocation();
  return (
    <AppShell>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/gold-rate" element={<Narrow><GoldRate /></Narrow>} />
        <Route path="/cart" element={<Narrow><Cart /></Narrow>} />
        <Route path="/appointments" element={<Narrow><Appointments /></Narrow>} />
        <Route path="/offers" element={<Narrow><Offers /></Narrow>} />
        <Route path="/account" element={<Narrow><Account /></Narrow>} />
        <Route path="/ai" element={<Narrow><AIStudio /></Narrow>} />
        <Route path="/ai/visual-search" element={<Narrow><VisualSearch /></Narrow>} />
        <Route path="/ai/catalog-studio" element={<Narrow><CatalogStudio /></Narrow>} />
        <Route path="/ai/intelligence" element={<Narrow><Intelligence /></Narrow>} />
        <Route path="/try-on" element={<TryOn />} />
        <Route path="/try-on/:slug" element={<TryOn />} />
      </Routes>
    </AppShell>
  );
}
