CREATE TABLE `PaymentRecord` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderId` INTEGER NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `method` ENUM('CASH','TRANSFER','CARD') NOT NULL,
  `reference` VARCHAR(120) NULL,
  `note` VARCHAR(500) NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdById` INTEGER NOT NULL,
  `voidedAt` DATETIME(3) NULL,
  `voidReason` VARCHAR(255) NULL,
  `voidedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `PaymentRecord_orderId_voidedAt_receivedAt_idx`(`orderId`, `voidedAt`, `receivedAt`),
  INDEX `PaymentRecord_method_receivedAt_idx`(`method`, `receivedAt`),
  INDEX `PaymentRecord_createdById_idx`(`createdById`),
  INDEX `PaymentRecord_voidedById_idx`(`voidedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaymentRecord`
  ADD CONSTRAINT `PaymentRecord_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PaymentRecord`
  ADD CONSTRAINT `PaymentRecord_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PaymentRecord`
  ADD CONSTRAINT `PaymentRecord_voidedById_fkey`
  FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
