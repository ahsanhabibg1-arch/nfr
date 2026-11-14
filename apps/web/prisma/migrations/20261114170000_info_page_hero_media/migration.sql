-- An information page can carry a hero image from the Media Library (PM-03).
--
-- A REFERENCE, not a copy. Alt text, caption, credit, rights status and
-- dimensions already live on MediaAsset; duplicating them here would let a
-- rights status corrected in the Media Library stay wrong on every page that
-- had copied it.
--
-- Additive and nullable: every existing page reads as "no hero", which is what
-- they all are today.
ALTER TABLE "InfoPage" ADD COLUMN "heroMediaId" TEXT;

CREATE INDEX "InfoPage_heroMediaId_idx" ON "InfoPage"("heroMediaId");

-- ON DELETE SET NULL: removing an asset must not remove the page with it.
ALTER TABLE "InfoPage"
  ADD CONSTRAINT "InfoPage_heroMediaId_fkey"
  FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
