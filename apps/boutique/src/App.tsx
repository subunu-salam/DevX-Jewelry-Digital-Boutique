import { Route, Routes } from "react-router-dom";
import MobileShell from "./components/MobileShell";
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

export default function App() {
  return (
    <MobileShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/gold-rate" element={<GoldRate />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/account" element={<Account />} />
        <Route path="/ai" element={<AIStudio />} />
        <Route path="/ai/visual-search" element={<VisualSearch />} />
        <Route path="/ai/catalog-studio" element={<CatalogStudio />} />
        <Route path="/ai/intelligence" element={<Intelligence />} />
      </Routes>
    </MobileShell>
  );
}
