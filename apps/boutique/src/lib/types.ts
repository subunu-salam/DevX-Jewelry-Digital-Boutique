export interface Availability {
  branchId: string;
  branchName: string;
  quantity: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  priceMode: "FIXED" | "INQUIRY";
  basePrice: number;
  discount: number;
  metal: string;
  karat: number;
  metalColor: string;
  grossWeight: number;
  netWeight: number;
  gender: string;
  occasion?: string | null;
  category?: { name: string; slug: string } | null;
  collection?: { name: string; slug: string } | null;
  image: string | null;
  featured: boolean;
  isNew: boolean;
  tags: string[];
  availability: Availability[];
  // full detail
  description?: string;
  stoneType?: string | null;
  stoneCount?: number;
  totalCarat?: number;
  dimensions?: string | null;
  certNumber?: string | null;
  certIssuer?: string | null;
  warranty?: string | null;
  media?: { url: string; kind: string }[];
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  heroImage?: string | null;
  featured: boolean;
}

export interface Offer {
  id: string;
  title: string;
  description?: string | null;
  image?: string | null;
  discount: number;
  code?: string | null;
  validUntil?: string | null;
}

export interface Storefront {
  tenant: { name: string; currency: string; logoUrl: string | null };
  branches: Branch[];
  categories: Category[];
  collections: Collection[];
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  savedProductIds: string[];
  marketingConsent: boolean;
}

export interface GoldRate {
  karat: number;
  pricePerGram: number | null;
  source: string | null;
  observedAt: string | null;
}
