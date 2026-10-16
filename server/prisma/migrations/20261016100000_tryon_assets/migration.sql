-- CreateTable
CREATE TABLE "TryOnAsset" (
    "productId" TEXT NOT NULL,
    "png" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TryOnAsset_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "TryOnAsset" ADD CONSTRAINT "TryOnAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
