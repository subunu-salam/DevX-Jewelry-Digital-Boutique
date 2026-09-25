import { PrismaClient, Role, PriceMode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1100&q=80`;

// Curated real Unsplash jewellery photography
const PHOTOS = {
  ring1: IMG("photo-1605100804763-247f67b3557e"),
  ring2: IMG("photo-1515562141207-7a88fb7ce338"),
  ring3: IMG("photo-1535632066927-ab7c9ab60908"),
  ring4: IMG("photo-1591209627656-92c7b9b65be5"),
  necklace1: IMG("photo-1611652022419-a9419f74343d"),
  necklace2: IMG("photo-1596944924616-7b38e7cfac36"),
  necklace3: IMG("photo-1506630448388-4e683c67ddb0"),
  earring1: IMG("photo-1602752250015-52934bc45613"),
  earring2: IMG("photo-1610694955371-d4a3e0ce4b52"),
  bracelet1: IMG("photo-1620656798579-1984d9e87df7"),
  bracelet2: IMG("photo-1611591437281-460bfbe1220a"),
  bangle1: IMG("photo-1599643478518-a784e5dc4c8f"),
  pendant1: IMG("photo-1573408301185-9146fe634ad0"),
  pendant2: IMG("photo-1599459183200-59c7687a0275"),
  hero: IMG("photo-1617038220319-276d3cfab638"),
};

async function main() {
  console.log("⟳ Resetting database…");
  // Clean in FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.inquiryItem.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productMedia.deleteMany();
  await prisma.product.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.category.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.goldPriceObservation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

  const password = await bcrypt.hash("Password123!", 10);

  // ── Tenant ──
  const tenant = await prisma.tenant.create({
    data: { name: "Aurelia Fine Jewellery", slug: "aurelia", currency: "AED", makingCharge: 12, logoUrl: null },
  });
  console.log(`✓ Tenant: ${tenant.name}`);

  // ── Branches ──
  const [souk, mall, abudhabi] = await Promise.all([
    prisma.branch.create({ data: { tenantId: tenant.id, name: "Gold Souk Boutique", city: "Dubai", address: "Gold Souk, Deira, Dubai", phone: "+971 4 226 0001", hours: "10:00 – 22:00", lat: 25.2716, lng: 55.2969 } }),
    prisma.branch.create({ data: { tenantId: tenant.id, name: "Dubai Mall Flagship", city: "Dubai", address: "The Dubai Mall, Downtown Dubai", phone: "+971 4 339 0002", hours: "10:00 – 24:00", lat: 25.1972, lng: 55.2796 } }),
    prisma.branch.create({ data: { tenantId: tenant.id, name: "Al Maryah Salon", city: "Abu Dhabi", address: "The Galleria, Al Maryah Island", phone: "+971 2 610 0003", hours: "10:00 – 22:00", lat: 24.4995, lng: 54.3901 } }),
  ]);
  const branches = [souk, mall, abudhabi];
  console.log(`✓ ${branches.length} branches`);

  // ── Users (CRM logins) ──
  const staff = [
    { name: "Layla Haddad", email: "owner@aurelia.ae", role: Role.OWNER, branchId: null },
    { name: "Omar Farouk", email: "admin@aurelia.ae", role: Role.COMPANY_ADMIN, branchId: null },
    { name: "Nadia Rahman", email: "manager@aurelia.ae", role: Role.BRANCH_MANAGER, branchId: mall.id },
    { name: "Yusuf Ali", email: "sales@aurelia.ae", role: Role.SALES_STAFF, branchId: souk.id },
    { name: "Fatima Noor", email: "inventory@aurelia.ae", role: Role.INVENTORY_STAFF, branchId: abudhabi.id },
    { name: "Sana Iqbal", email: "analyst@aurelia.ae", role: Role.ANALYST, branchId: null },
  ];
  const users = [];
  for (const s of staff) {
    users.push(await prisma.user.create({ data: { tenantId: tenant.id, name: s.name, email: s.email, passwordHash: password, role: s.role, branchId: s.branchId } }));
  }
  console.log(`✓ ${users.length} staff users`);

  // ── Categories ──
  const catData = [
    { name: "Rings", slug: "rings", icon: "circle" },
    { name: "Necklaces", slug: "necklaces", icon: "gem" },
    { name: "Earrings", slug: "earrings", icon: "sparkles" },
    { name: "Bracelets", slug: "bracelets", icon: "link" },
    { name: "Bangles", slug: "bangles", icon: "circle-dot" },
    { name: "Pendants", slug: "pendants", icon: "diamond" },
  ];
  const cats: Record<string, string> = {};
  let sort = 0;
  for (const c of catData) {
    const created = await prisma.category.create({ data: { tenantId: tenant.id, ...c, sort: sort++ } });
    cats[c.slug] = created.id;
  }

  // ── Collections ──
  const colData = [
    { name: "Bridal Couture", slug: "bridal", description: "Heirloom pieces for the wedding day.", heroImage: PHOTOS.ring1, featured: true },
    { name: "Heritage", slug: "heritage", description: "22K craftsmanship rooted in tradition.", heroImage: PHOTOS.necklace1, featured: true },
    { name: "Everyday Luxe", slug: "everyday", description: "Light, wearable luxury for every day.", heroImage: PHOTOS.bracelet1, featured: true },
    { name: "Solitaire", slug: "solitaire", description: "Certified diamonds, set to perfection.", heroImage: PHOTOS.ring2, featured: true },
  ];
  const cols: Record<string, string> = {};
  for (const c of colData) {
    const created = await prisma.collection.create({ data: { tenantId: tenant.id, ...c } });
    cols[c.slug] = created.id;
  }
  console.log(`✓ ${catData.length} categories, ${colData.length} collections`);

  // ── Products ──
  type P = {
    sku: string; name: string; cat: string; col: string; karat: number; metalColor: string;
    gross: number; net: number; price: number; mode?: PriceMode; gender: string; occasion: string;
    stoneType?: string; stoneCount?: number; carat?: number; image: string; featured?: boolean; isNew?: boolean;
    desc: string; tags: string[];
  };
  const products: P[] = [
    { sku: "AR-2201", name: "Solitaire Halo Ring", cat: "rings", col: "solitaire", karat: 18, metalColor: "White", gross: 4.2, net: 3.8, price: 18500, gender: "Women", occasion: "Engagement", stoneType: "Diamond", stoneCount: 33, carat: 1.2, image: PHOTOS.ring1, featured: true, isNew: true, desc: "A brilliant-cut centre stone framed by a halo of pavé diamonds in 18K white gold.", tags: ["diamond", "engagement", "halo", "bridal"] },
    { sku: "AR-2202", name: "Emerald Cut Trilogy Ring", cat: "rings", col: "bridal", karat: 18, metalColor: "White", gross: 5.1, net: 4.6, price: 24900, gender: "Women", occasion: "Engagement", stoneType: "Diamond", stoneCount: 3, carat: 1.8, image: PHOTOS.ring2, featured: true, desc: "Three emerald-cut diamonds symbolising past, present and future.", tags: ["diamond", "trilogy", "engagement"] },
    { sku: "AR-2203", name: "Classic 22K Band", cat: "rings", col: "heritage", karat: 22, metalColor: "Yellow", gross: 6.0, net: 6.0, price: 3100, mode: PriceMode.INQUIRY, gender: "Unisex", occasion: "Wedding", image: PHOTOS.ring3, desc: "A timeless 22K yellow-gold band, hand-finished in the Souk atelier.", tags: ["22k", "band", "wedding"] },
    { sku: "AR-2204", name: "Sapphire Cocktail Ring", cat: "rings", col: "bridal", karat: 18, metalColor: "Rose", gross: 6.8, net: 5.9, price: 15200, gender: "Women", occasion: "Evening", stoneType: "Sapphire", stoneCount: 1, carat: 2.4, image: PHOTOS.ring4, isNew: true, desc: "A vivid blue sapphire cradled in rose-gold scrollwork.", tags: ["sapphire", "cocktail", "colour"] },
    { sku: "AN-3301", name: "Layla Diamond Rivière", cat: "necklaces", col: "bridal", karat: 18, metalColor: "White", gross: 22.4, net: 19.1, price: 68500, gender: "Women", occasion: "Bridal", stoneType: "Diamond", stoneCount: 41, carat: 6.5, image: PHOTOS.necklace1, featured: true, desc: "A graduated rivière of round brilliants — the centrepiece of the Bridal Couture line.", tags: ["diamond", "riviere", "bridal", "statement"] },
    { sku: "AN-3302", name: "22K Heritage Choker", cat: "necklaces", col: "heritage", karat: 22, metalColor: "Yellow", gross: 38.0, net: 38.0, price: 19800, mode: PriceMode.INQUIRY, gender: "Women", occasion: "Wedding", image: PHOTOS.necklace2, desc: "Intricately hand-worked 22K choker, a modern take on a bridal classic.", tags: ["22k", "choker", "wedding", "heritage"] },
    { sku: "AN-3303", name: "Pearl & Gold Strand", cat: "necklaces", col: "everyday", karat: 18, metalColor: "Yellow", gross: 12.2, net: 9.4, price: 8600, gender: "Women", occasion: "Everyday", stoneType: "Pearl", stoneCount: 28, image: PHOTOS.necklace3, isNew: true, desc: "Akoya pearls interspersed with polished 18K gold beads.", tags: ["pearl", "strand", "everyday"] },
    { sku: "AE-4401", name: "Chandelier Diamond Earrings", cat: "earrings", col: "bridal", karat: 18, metalColor: "White", gross: 9.6, net: 7.8, price: 32400, gender: "Women", occasion: "Bridal", stoneType: "Diamond", stoneCount: 56, carat: 3.1, image: PHOTOS.earring1, featured: true, desc: "Cascading brilliants that catch the light with every movement.", tags: ["diamond", "chandelier", "bridal"] },
    { sku: "AE-4402", name: "22K Jhumka Drops", cat: "earrings", col: "heritage", karat: 22, metalColor: "Yellow", gross: 14.5, net: 14.5, price: 7900, mode: PriceMode.INQUIRY, gender: "Women", occasion: "Festive", image: PHOTOS.earring2, isNew: true, desc: "Traditional jhumka silhouette in luminous 22K gold.", tags: ["22k", "jhumka", "festive"] },
    { sku: "AB-5501", name: "Tennis Bracelet 3ct", cat: "bracelets", col: "solitaire", karat: 18, metalColor: "White", gross: 11.0, net: 8.5, price: 41200, gender: "Women", occasion: "Anniversary", stoneType: "Diamond", stoneCount: 42, carat: 3.0, image: PHOTOS.bracelet1, featured: true, desc: "A continuous line of certified round diamonds — the definitive tennis bracelet.", tags: ["diamond", "tennis", "anniversary"] },
    { sku: "AB-5502", name: "Rose Gold Cuff", cat: "bracelets", col: "everyday", karat: 18, metalColor: "Rose", gross: 15.2, net: 15.2, price: 9400, gender: "Women", occasion: "Everyday", image: PHOTOS.bracelet2, desc: "A sculptural open cuff in warm 18K rose gold.", tags: ["rose-gold", "cuff", "everyday"] },
    { sku: "AG-6601", name: "22K Filigree Bangle", cat: "bangles", col: "heritage", karat: 22, metalColor: "Yellow", gross: 24.0, net: 24.0, price: 12600, mode: PriceMode.INQUIRY, gender: "Women", occasion: "Wedding", image: PHOTOS.bangle1, desc: "Hand-pierced filigree bangle in the heritage tradition.", tags: ["22k", "bangle", "filigree"] },
    { sku: "AP-7701", name: "Solitaire Pendant 0.5ct", cat: "pendants", col: "solitaire", karat: 18, metalColor: "White", gross: 2.4, net: 1.9, price: 7800, gender: "Women", occasion: "Gift", stoneType: "Diamond", stoneCount: 1, carat: 0.5, image: PHOTOS.pendant1, isNew: true, desc: "A single certified brilliant on a fine 18K chain.", tags: ["diamond", "solitaire", "gift"] },
    { sku: "AP-7702", name: "Evil-Eye Gold Pendant", cat: "pendants", col: "everyday", karat: 18, metalColor: "Yellow", gross: 3.1, net: 2.7, price: 3200, gender: "Unisex", occasion: "Everyday", stoneType: "Enamel", image: PHOTOS.pendant2, desc: "A protective evil-eye motif in enamel and 18K gold.", tags: ["evil-eye", "everyday", "gift"] },
  ];

  let idx = 0;
  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
        slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + p.sku.toLowerCase(),
        description: p.desc,
        categoryId: cats[p.cat],
        collectionId: cols[p.col],
        priceMode: p.mode ?? PriceMode.FIXED,
        basePrice: p.price,
        makingCharge: 12,
        metal: "Gold",
        karat: p.karat,
        metalColor: p.metalColor,
        grossWeight: p.gross,
        netWeight: p.net,
        stoneType: p.stoneType,
        stoneCount: p.stoneCount ?? 0,
        totalCarat: p.carat ?? 0,
        gender: p.gender,
        occasion: p.occasion,
        tags: p.tags,
        certNumber: p.stoneType === "Diamond" ? `IGI-${1000 + idx}` : null,
        certIssuer: p.stoneType === "Diamond" ? "IGI" : null,
        featured: p.featured ?? false,
        isNew: p.isNew ?? false,
        media: { create: [{ url: p.image, isPrimary: true, sort: 0 }] },
        inventory: {
          create: branches.map((b, i) => ({ branchId: b.id, quantity: ((idx + i) % 5) + 1 })),
        },
      },
    });
    idx++;
    void product;
  }
  console.log(`✓ ${products.length} products with imagery + branch inventory`);

  // ── Customers (one with a boutique login) ──
  const custPassword = await bcrypt.hash("Customer123!", 10);
  const customers = await Promise.all([
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Aisha Al Mansoori", phone: "+971501112233", email: "aisha@example.ae", passwordHash: custPassword, segment: "high_value", marketingConsent: true } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Rahul Menon", phone: "+971502223344", email: "rahul@example.ae", segment: "repeat", marketingConsent: true } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Sara Khan", phone: "+971503334455", email: "sara@example.ae", segment: "new" } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "James Carter", phone: "+971504445566", segment: "new" } }),
  ]);
  console.log(`✓ ${customers.length} customers (1 with boutique account)`);

  // ── A few live inquiries + an appointment so the CRM isn't empty ──
  const firstProduct = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  await prisma.inquiry.create({
    data: {
      tenantId: tenant.id, reference: "INQ-SEED1", customerId: customers[0].id, branchId: mall.id, assignedToId: users[3].id,
      status: "QUALIFIED", source: "boutique", occasion: "Anniversary", budget: 40000, notes: "Prefers white gold, size 6.",
      items: { create: [{ productId: firstProduct?.id, productName: firstProduct?.name ?? "Solitaire Halo Ring", quantity: 1 }] },
    },
  });
  await prisma.inquiry.create({
    data: {
      tenantId: tenant.id, reference: "INQ-SEED2", customerId: customers[1].id, branchId: souk.id,
      status: "NEW", source: "whatsapp", occasion: "Wedding",
      items: { create: [{ productName: "22K Heritage Choker", quantity: 1 }] },
    },
  });
  await prisma.appointment.create({
    data: { tenantId: tenant.id, reference: "APT-SEED1", customerId: customers[0].id, branchId: mall.id, staffId: users[2].id, reason: "Bridal consultation", scheduledAt: new Date(Date.now() + 2 * 864e5), status: "CONFIRMED" },
  });

  // ── Suppliers ──
  await prisma.supplier.createMany({
    data: [
      { tenantId: tenant.id, name: "Emirates Bullion DMCC", contact: "Karim Saleh", phone: "+971 4 555 1000", categories: ["Gold", "Bullion"], payable: 125000 },
      { tenantId: tenant.id, name: "Antwerp Diamond House", contact: "Elise Vermeer", phone: "+32 3 234 5678", categories: ["Diamond"], payable: 89000 },
      { tenantId: tenant.id, name: "Jaipur Gem Works", contact: "Rohan Gupta", phone: "+91 141 234 5678", categories: ["Sapphire", "Emerald", "Pearl"], payable: 21000 },
    ],
  });

  // ── Offers ──
  await prisma.offer.createMany({
    data: [
      { tenantId: tenant.id, title: "Zero Making Charges — Bridal Week", description: "Waived making charges on all Bridal Couture pieces this week.", image: PHOTOS.ring1, discount: 12, code: "BRIDAL0", status: "ACTIVE", validUntil: new Date(Date.now() + 14 * 864e5) },
      { tenantId: tenant.id, title: "Eid Gold Exchange Bonus", description: "Extra AED 20/g on old-gold exchange across all branches.", image: PHOTOS.bangle1, discount: 0, code: "EIDGOLD", status: "ACTIVE", validUntil: new Date(Date.now() + 21 * 864e5) },
      { tenantId: tenant.id, title: "Solitaire Season — 10% off", description: "10% off certified solitaires above 1 carat.", image: PHOTOS.ring2, discount: 10, code: "SOL10", status: "ACTIVE", validUntil: new Date(Date.now() + 30 * 864e5) },
    ],
  });
  console.log("✓ suppliers + offers");

  // ── Gold price history (180 days, seed source) ──
  const purity: Record<number, number> = { 24: 1.0, 22: 0.916, 21: 0.875, 18: 0.75 };
  const base24 = 476; // AED / gram, illustrative starting point
  const rows: { tenantId: string; karat: number; pricePerGram: number; source: "SEED"; observedAt: Date }[] = [];
  let spot = base24;
  for (let d = 180; d >= 0; d--) {
    // gentle random walk with slight upward drift
    spot += (Math.random() - 0.48) * 3.2;
    spot = Math.max(430, Math.min(520, spot));
    const day = new Date();
    day.setDate(day.getDate() - d);
    day.setHours(9, 0, 0, 0);
    for (const k of [24, 22, 21, 18]) {
      rows.push({ tenantId: tenant.id, karat: k, pricePerGram: +(spot * purity[k]).toFixed(2), source: "SEED", observedAt: new Date(day) });
    }
  }
  // chunked insert
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.goldPriceObservation.createMany({ data: rows.slice(i, i + 500) });
  }
  console.log(`✓ ${rows.length} gold price observations (180 days × 4 karats)`);

  console.log("\n✔ Seed complete.\n");
  console.log("── CRM logins (https://<crm-url>) ──");
  staff.forEach((s) => console.log(`   ${s.role.padEnd(15)} ${s.email}  /  Password123!`));
  console.log("\n── Boutique customer login (https://<boutique-url>) ──");
  console.log("   Phone +971501112233  /  Customer123!\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
