-- AlterTable
ALTER TABLE "CallTask" ADD COLUMN "segment" TEXT;
ALTER TABLE "CallTask" ADD COLUMN "lostReason" TEXT;
ALTER TABLE "CallTask" ADD COLUMN "feedback" TEXT;

-- CreateTable
CREATE TABLE "OfferRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "callTaskId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "code" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "redeemedAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monthlyAmount" DOUBLE PRECISION NOT NULL,
    "tenureMonths" INTEGER NOT NULL DEFAULT 11,
    "bonusPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "karat" INTEGER NOT NULL DEFAULT 22,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "nominee" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoldPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPlanPayment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "goldRate" DOUBLE PRECISION NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoldPlanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferRequest_tenantId_status_idx" ON "OfferRequest"("tenantId", "status");
CREATE INDEX "GoldPlan_tenantId_status_idx" ON "GoldPlan"("tenantId", "status");
CREATE INDEX "GoldPlanPayment_planId_idx" ON "GoldPlanPayment"("planId");

-- AddForeignKey
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_callTaskId_fkey" FOREIGN KEY ("callTaskId") REFERENCES "CallTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfferRequest" ADD CONSTRAINT "OfferRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoldPlan" ADD CONSTRAINT "GoldPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoldPlan" ADD CONSTRAINT "GoldPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoldPlanPayment" ADD CONSTRAINT "GoldPlanPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GoldPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
