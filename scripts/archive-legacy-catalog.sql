-- ARCHIVADO ÚNICO DEL CATÁLOGO IMPORTADO CON EL EXCEL ANTERIOR.
--
-- Los productos no se eliminan físicamente porque pueden estar vinculados
-- con pedidos reales. Se ocultan de la tienda, se pone su existencia en cero
-- y se conserva el historial de pedidos.
--
-- 1. Exporta una copia completa de la base de datos desde Hostinger.
-- 2. Ejecuta primero este archivo con @CONFIRM_ARCHIVE = 'NO'.
-- 3. Revisa el conteo de "variantes_que_se_archivarian".
-- 4. Cambia NO por YES y vuelve a ejecutarlo una sola vez.

SET @CONFIRM_ARCHIVE = 'NO';

SELECT
  COUNT(*) AS variantes_que_se_archivarian,
  COUNT(DISTINCT `productId`) AS productos_que_se_archivarian
FROM `ProductVariant`
WHERE
  (
    `sourceKey` IS NOT NULL
    AND `sourceKey` NOT LIKE 'SKU:%'
    AND `sourceKey` NOT LIKE 'NAME:%'
    AND `sourceKey` NOT LIKE 'LEGACY:%'
  )
  OR (`sourceKey` IS NULL AND `microsipName` IS NOT NULL);

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS `LegacyVariantsToArchive`;

CREATE TEMPORARY TABLE `LegacyVariantsToArchive` (
  `id` INT NOT NULL PRIMARY KEY,
  `productId` INT NOT NULL,
  `previousStock` INT NOT NULL
) ENGINE = MEMORY;

INSERT INTO `LegacyVariantsToArchive` (`id`, `productId`, `previousStock`)
SELECT `id`, `productId`, `stock`
FROM `ProductVariant`
WHERE
  @CONFIRM_ARCHIVE = 'YES'
  AND (
    (
      `sourceKey` IS NOT NULL
      AND `sourceKey` NOT LIKE 'SKU:%'
      AND `sourceKey` NOT LIKE 'NAME:%'
      AND `sourceKey` NOT LIKE 'LEGACY:%'
    )
    OR (`sourceKey` IS NULL AND `microsipName` IS NOT NULL)
  );

INSERT INTO `InventoryMovement` (
  `variantId`,
  `type`,
  `quantity`,
  `previousStock`,
  `newStock`,
  `reason`,
  `createdAt`
)
SELECT
  `id`,
  'ADJUSTMENT',
  -`previousStock`,
  `previousStock`,
  0,
  'Catálogo anterior archivado antes de ExportacionWeb',
  NOW()
FROM `LegacyVariantsToArchive`
WHERE `previousStock` <> 0;

UPDATE `ProductVariant` AS `variant`
INNER JOIN `LegacyVariantsToArchive` AS `legacy`
  ON `legacy`.`id` = `variant`.`id`
SET
  `variant`.`sourceKey` = LEFT(
    CONCAT(
      'LEGACY:',
      `variant`.`id`,
      ':',
      COALESCE(
        NULLIF(`variant`.`sourceKey`, ''),
        NULLIF(`variant`.`microsipName`, ''),
        'SIN-CLAVE'
      )
    ),
    255
  ),
  `variant`.`microsipName` = NULL,
  `variant`.`barcode` = NULL,
  `variant`.`stock` = 0,
  `variant`.`active` = FALSE,
  `variant`.`lastSeenAt` = NULL;

UPDATE `Product` AS `product`
INNER JOIN (
  SELECT DISTINCT `productId`
  FROM `LegacyVariantsToArchive`
) AS `legacyProduct`
  ON `legacyProduct`.`productId` = `product`.`id`
SET
  `product`.`status` = 'ARCHIVED',
  `product`.`featured` = FALSE
WHERE NOT EXISTS (
  SELECT 1
  FROM `ProductVariant` AS `activeVariant`
  WHERE
    `activeVariant`.`productId` = `product`.`id`
    AND `activeVariant`.`active` = TRUE
);

SELECT
  COUNT(*) AS variantes_archivadas_en_esta_ejecucion,
  COUNT(DISTINCT `productId`) AS productos_procesados_en_esta_ejecucion
FROM `LegacyVariantsToArchive`;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS `LegacyVariantsToArchive`;
