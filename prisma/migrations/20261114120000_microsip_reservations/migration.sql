-- Additive: preserve existing orders, stock and import history.
ALTER TABLE `Order` ADD COLUMN `microsipIncludedAt` DATETIME(3) NULL;
ALTER TABLE `ImportBatch`
  ADD COLUMN `exportedAt` DATETIME(3) NULL,
  ADD COLUMN `reconciliation` JSON NULL;
-- One transactional row lock shared by imports and stock mutations.
INSERT IGNORE INTO `Setting` (`key`,`value`,`group`,`public`,`createdAt`,`updatedAt`)
VALUES ('inventory_transaction_lock', '1', 'system', false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
