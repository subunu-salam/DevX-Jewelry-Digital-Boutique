-- CreateTable
CREATE TABLE "CallTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "assignedToId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reason" TEXT NOT NULL,
    "tier" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "notes" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallTask_tenantId_status_idx" ON "CallTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CallTask_assignedToId_idx" ON "CallTask"("assignedToId");

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
