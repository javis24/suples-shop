-- Registro auditable de mensajes de pedido preparados para WhatsApp.
CREATE TABLE `OrderWhatsAppLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderId` INTEGER NOT NULL,
  `destination` VARCHAR(30) NOT NULL,
  `message` TEXT NOT NULL,
  `action` VARCHAR(30) NOT NULL DEFAULT 'GENERATED',
  `userId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `OrderWhatsAppLog_orderId_createdAt_idx`(`orderId`, `createdAt`),
  INDEX `OrderWhatsAppLog_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderWhatsAppLog`
  ADD CONSTRAINT `OrderWhatsAppLog_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrderWhatsAppLog`
  ADD CONSTRAINT `OrderWhatsAppLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
