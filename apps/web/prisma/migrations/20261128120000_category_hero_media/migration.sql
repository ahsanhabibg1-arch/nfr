-- A section landing page's hero photograph, chosen from the Media Library.
--
-- Purely additive: one nullable column plus its index and foreign key. Every
-- existing row keeps a NULL hero, and a landing page with no hero renders the
-- plain dark header it renders today, so nothing changes visually until an
-- editor picks an image.
--
-- ON DELETE SET NULL, matching `InfoPage.heroMediaId`: retiring an asset from
-- the Media Library empties the hero rather than refusing the delete or
-- leaving a reference to a row that no longer exists.
ALTER TABLE "Category" ADD COLUMN "heroMediaId" TEXT;

CREATE INDEX "Category_heroMediaId_idx" ON "Category"("heroMediaId");

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_heroMediaId_fkey"
  FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
