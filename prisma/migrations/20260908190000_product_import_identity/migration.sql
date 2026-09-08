-- Identidad estable para agrupar un producto padre y sus variantes de Microsip.
--
-- Si estas columnas ya se agregaron manualmente en producción, no ejecutes
-- este SQL de nuevo. Marca la migración como aplicada con:
-- prisma migrate resolve --applied 20260908190000_product_import_identity

ALTER TABLE `Product`
    ADD COLUMN `importKey` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `Product_importKey_key`
    ON `Product`(`importKey`);

ALTER TABLE `ProductVariant`
    ADD COLUMN `sourceKey` VARCHAR(255) NULL,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL,
    MODIFY `lowStockAt` INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `ProductVariant_sourceKey_key`
    ON `ProductVariant`(`sourceKey`);

CREATE INDEX `ProductVariant_lastSeenAt_idx`
    ON `ProductVariant`(`lastSeenAt`);
