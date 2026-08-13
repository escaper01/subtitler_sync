-- Lemon Squeezy is gone; the enum values that named it are renamed rather than dropped.
--
-- Prisma's own diff wanted to DROP and recreate both types, which fails outright if any
-- historical row still carries the old value -- and these are append-only ledgers, so on a
-- database that has ever taken a payment, some row always will. RENAME VALUE rewrites the
-- label in place and every existing row follows it.
--
-- The new name is deliberately provider-neutral. "Bought" is the fact worth recording; who
-- processed the card is not, and encoding it here is what made this migration necessary.

ALTER TYPE "EntitlementSource" RENAME VALUE 'LEMON' TO 'PURCHASE';
ALTER TYPE "LicenseSource" RENAME VALUE 'LEMON' TO 'PURCHASE';
