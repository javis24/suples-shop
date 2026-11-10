-- Compatibility: main's old migrations omit the payment columns used by its schema.
-- Create them only when absent; never replace existing values. MySQL 8 / MariaDB compatible.
SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `paymentMethod` ENUM(''CASH'', ''TRANSFER'', ''ONLINE'') NOT NULL DEFAULT ''CASH''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'paymentMethod');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;

SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `paymentProvider` VARCHAR(40) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'paymentProvider');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;

SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `paymentPreferenceId` VARCHAR(120) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'paymentPreferenceId');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;

SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `Order` ADD COLUMN `paymentReference` VARCHAR(120) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'paymentReference');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;

-- Additive migration: existing orders keep their payment method and shipping amount.
ALTER TABLE `Order`
  ADD COLUMN `checkoutKey` VARCHAR(64) NULL,
  ADD COLUMN `checkoutHash` VARCHAR(64) NULL,
  ADD COLUMN `shippingQuoted` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `carrier` VARCHAR(120) NULL,
  ADD COLUMN `trackingNumber` VARCHAR(120) NULL,
  MODIFY COLUMN `paymentMethod` ENUM('CASH', 'TRANSFER', 'ONLINE', 'TO_CONFIRM') NOT NULL DEFAULT 'CASH';
CREATE UNIQUE INDEX `Order_checkoutKey_key` ON `Order`(`checkoutKey`);

SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `Order_paymentReference_key` ON `Order`(`paymentReference`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND INDEX_NAME = 'Order_paymentReference_key');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;

SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `Order_paymentMethod_createdAt_idx` ON `Order`(`paymentMethod`, `createdAt`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND INDEX_NAME = 'Order_paymentMethod_createdAt_idx');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;
