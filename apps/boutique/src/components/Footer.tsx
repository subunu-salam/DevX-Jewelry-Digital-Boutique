import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-sand">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        <div>
          <div className="font-serif text-2xl font-semibold">Aurelia</div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            A digital showroom of fine jewellery — discover, save and reserve across our Dubai and Abu Dhabi boutiques.
          </p>
        </div>
        <div>
          <h4 className="eyebrow mb-4">Explore</h4>
          <ul className="space-y-2 text-sm text-foreground/75">
            <li><Link to="/catalog" className="hover:text-brand">All Collections</Link></li>
            <li><Link to="/catalog?filter=new" className="hover:text-brand">New Arrivals</Link></li>
            <li><Link to="/gold-rate" className="hover:text-brand">Live Gold Rate</Link></li>
            <li><Link to="/offers" className="hover:text-brand">Offers</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow mb-4">Boutiques</h4>
          <ul className="space-y-2 text-sm text-foreground/75">
            <li>Gold Souk, Deira · Dubai</li>
            <li>The Dubai Mall · Downtown</li>
            <li>The Galleria · Abu Dhabi</li>
            <li><Link to="/appointments" className="hover:text-brand">Book an appointment →</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow mb-4">Client Care</h4>
          <ul className="space-y-2 text-sm text-foreground/75">
            <li>Lifetime service &amp; buy-back</li>
            <li>Certified diamonds (IGI)</li>
            <li>WhatsApp: +971 4 226 0001</li>
            <li><Link to="/account" className="hover:text-brand">My account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row lg:px-10">
          <span>© {new Date().getFullYear()} Aurelia Fine Jewellery. All rights reserved.</span>
          <span>Powered by <span className="font-medium text-brand-deep">DevX Boutique OS</span></span>
        </div>
      </div>
    </footer>
  );
}
