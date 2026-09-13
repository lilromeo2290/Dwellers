-- Phase 6 (PART 18/61): quotation notes — the only genuine schema gap.
-- Notes are required by the Phase 6 spec; every other quotation field
-- already existed on the Quote/QuoteItem models since Phase 2.
ALTER TABLE "quotes" ADD COLUMN "notes" TEXT;
