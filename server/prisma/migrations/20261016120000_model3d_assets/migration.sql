-- CreateTable
CREATE TABLE "Model3DAsset" (
    "productId" TEXT NOT NULL,
    "glb" BYTEA NOT NULL,
    "fileName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Model3DAsset_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "Model3DAsset" ADD CONSTRAINT "Model3DAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
