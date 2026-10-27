# Bengali in the app: glossary and review guide

This is for the native speaker who checks the Bengali (NFR-8), and for anyone adding strings later. Every string the app shows is in `docs/translations-review.csv`. Regenerate it with `npm run i18n:review` after changes.

## How to review

Open `translations-review.csv` in a spreadsheet. It has one row per string:

| Column | What it holds |
|---|---|
| key | Where the string lives in `src/i18n/bn.ts` |
| area | The screen or part of the app it appears on |
| english | The English string |
| bengali | The Bengali string, which is what to check |
| blanks | Values the app fills in, such as `{{project}}`. Keep every blank in your version. |
| reviewer note | Free for your comments and corrections |

Please check that each string:

- reads naturally to a farmer or an office worker in Bangladesh;
- means the same as the English;
- uses the terms below.

If a term below is wrong, change it here first; a test then lists every string still using the old word.

## What the app does by itself

- **Digits.** Numbers, amounts and dates show Bengali digits: ১২, ৳১,২৩৪.৫০, ২৪ জানুয়ারি ২০২৭. A plain number filled into a sentence, such as a record number in "বুকিং #১২", is converted too. Digits written into a string itself stay as written; examples are the phone number to copy (01712345678), A4, and the code rule 0–9. Write numbers in strings as Bengali digits unless the reader is meant to type or copy them.
- **Money.** Amounts are shown as ৳ with international grouping (৳১,২৩৪,৫৬৭), never lakh and crore.
- **Units.** A `{{unit}}` blank is filled with the catalog's Bengali symbol: কেজি, গ্রাম, লিটার, মি.লি., পিস. Editors set it per unit in the catalog.
- **Plurals.** Bengali has one plural form, so `_one` and `_other` may be the same.
- **Names stay as given.** People, projects, banks, branches and places are shown as they were entered. Crop and input names come from the catalog in both languages.

## What stays in English

- **WeGro**, the name.
- **File and data formats people handle:** CSV, JSON, PDF, JPEG, PNG, WebP, SMS, QR, A4. The same goes for file and column names they must match exactly: `bank_branches.json`, `payment_reference`, `payee_id`.
- **The ledger's own error names**, shown only to staff (for example `NotFarmersOfficer`), and the raw ledger values under "লেজারের বিবরণ".
- **Routes in the request log**, such as `/api/projects`.

## Terms

One word per idea, so a reader never wonders whether two words mean two things. The terms marked † are checked by a test (`src/i18n/i18n.test.ts`); the old variant in brackets is what it rejects.

| English | Bengali | Notes |
|---|---|---|
| Project | প্রকল্প | |
| Unit (of a project; what investors book) | ইউনিট † | Not স্লট. English says "unit" too, never "slot". |
| Booking | বুকিং † | Not রিজার্ভেশন. English says "booking", never "reservation". |
| Payment proof | পরিশোধের প্রমাণ | |
| Offer | প্রস্তাব † | Not অফার |
| Deal | চুক্তি | An offer once approved |
| Listing | তালিকা | |
| Delivery | সরবরাহ † | Not ডেলিভারি |
| Buyer request | চাহিদা | Menu name; the pages also say ক্রেতার অনুরোধ |
| Marketplace | বাজার | |
| Insurance, insured, insurer | বীমা, বীমাকৃত, বীমাকারী † | বীমা as the regulator spells it (বীমা উন্নয়ন ও নিয়ন্ত্রণ কর্তৃপক্ষ), not বিমা |
| Cover (insurance terms) | বীমার শর্ত | Not কভার |
| Claim | দাবি | |
| Weather event | আবহাওয়ার ঘটনা | |
| Payout / payout round | অর্থ প্রদান / অর্থ প্রদান পর্ব † | Not পেআউট or রাউন্ড |
| Statement | বিবরণী | |
| Fee | ফি | |
| Farm update | খামারের হালনাগাদ † | Not খামার আপডেট |
| Voucher | ভাউচার | |
| Input (seed, fertiliser…) | উপকরণ | |
| Batch / lot | ব্যাচ / লট | A batch is a supplier's registered goods; the lot number is printed on them |
| Warehouse, receipt | গুদাম, রসিদ | |
| Buy-back | বাই-ব্যাক | Sentences also say ফেরত কেনা. **Reviewer: which reads better to farmers?** |
| Track record | ট্র্যাক রেকর্ড | |
| Bank permission | ব্যাংকের অনুমতি | |
| Field officer | মাঠ কর্মকর্তা | |
| Accounts (the team) | হিসাব বিভাগ | |
| Auditor | নিরীক্ষক | |
| Ledger | লেজার | The blockchain record |
| Fingerprint (hash) | ফিঙ্গারপ্রিন্ট | |
| Signing key | চাবি | Not কী, which also means "what" |
| Verify / verified | যাচাই / যাচাইকৃত | |
| Withdraw (permission, offer) | প্রত্যাহার | |
| Notification | বিজ্ঞপ্তি † | Not নোটিফিকেশন |
| Sign in | সাইন ইন | |

## Open questions for the reviewer

1. **পেমেন্ট and পরিশোধ** both appear: পেমেন্ট mostly for the money as a thing ("বীমাকারীর পেমেন্ট") and পরিশোধ for the act of paying ("পরিশোধিত", "পরিশোধের প্রমাণ"). Is that split natural, or should one word win?
2. **বাই-ব্যাক or ফেরত কেনা** for buy-back (see the table above).
3. **Loanwords:** ড্যাশবোর্ড, ক্যাটালগ, সিস্টেম, অ্যাডমিন and অপারেশনস are kept as office staff say them. Are there Bengali words people would recognise better?
