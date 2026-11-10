-- main's schema already declares ImportRow.price; old migrations omitted it.
SET @checkout_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `ImportRow` ADD COLUMN `price` DECIMAL(12,2) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ImportRow' AND COLUMN_NAME = 'price');
PREPARE checkout_stmt FROM @checkout_sql;
EXECUTE checkout_stmt;
DEALLOCATE PREPARE checkout_stmt;
